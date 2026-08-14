import * as vscode from "vscode";
import type { DshHub } from "./hub";
import { createTranslator } from "./i18n";
import { activeFolder } from "./participantSessions";

/**
 * 源代码管理(SCM)视图的「生成提交信息」功能:
 * 取内置 git 扩展的 diff → 在一次性 DSH 会话(创建即归档,不占用会话列表)中选中轻量模型
 * (默认 deepseek-v4-flash + low 不思考)→ 发送生成提示词 → 等待回合结束 → 提取最终文本写入 SCM 输入框。
 */

const t = createTranslator();

/** diff 上限字符数(超出截断,避免超大提交拖慢生成)。 */
const MAX_DIFF_CHARS = 50_000;
/** 生成超时:超过则取消会话并报错。 */
const GENERATION_TIMEOUT_MS = 120_000;

// ---------- 内置 git 扩展 API(最小类型,运行时特性检测;官方类型由 vscode.git 扩展自身提供) ----------

interface GitRepositoryLike {
  readonly rootUri: vscode.Uri;
  readonly inputBox: { value: string };
  diff(cached?: boolean): Promise<string>;
}

interface GitApiLike {
  readonly repositories: GitRepositoryLike[];
  getRepository(uri: vscode.Uri): GitRepositoryLike | null;
}

async function getGitApi(): Promise<GitApiLike | undefined> {
  const ext = vscode.extensions.getExtension<{ getAPI(version: number): GitApiLike }>("vscode.git");
  if (!ext) return undefined;
  try {
    const exports = ext.isActive ? ext.exports : await ext.activate();
    const api = exports.getAPI(1);
    if (!api || typeof api.getRepository !== "function") return undefined;
    return api;
  } catch {
    return undefined;
  }
}

/** scm/title 菜单传入的第一个参数是 SourceControl(带 rootUri)。 */
function argRootUri(arg: unknown): vscode.Uri | undefined {
  const sc = arg as { rootUri?: unknown } | undefined;
  return sc?.rootUri instanceof vscode.Uri ? sc.rootUri : undefined;
}

async function resolveRepository(api: GitApiLike, arg: unknown): Promise<GitRepositoryLike | undefined> {
  const root = argRootUri(arg) ?? activeFolder()?.uri;
  if (root) {
    const direct = api.getRepository(root);
    if (direct) return direct;
    const nested = api.repositories.find((r) => root.toString().startsWith(r.rootUri.toString()));
    if (nested) return nested;
  }
  if (api.repositories.length === 1) return api.repositories[0];
  if (api.repositories.length > 1) {
    const picked = await vscode.window.showQuickPick(
      api.repositories.map((r) => ({ label: r.rootUri.fsPath, repo: r })),
      { placeHolder: t("commit.pickRepo") },
    );
    return picked?.repo;
  }
  return undefined;
}

/** 优先已暂存改动(index vs HEAD);为空回退未暂存(工作区 vs index)。 */
async function collectDiff(repo: GitRepositoryLike): Promise<string | undefined> {
  let diff = "";
  try {
    diff = (await repo.diff(true)).trim();
  } catch {
    diff = "";
  }
  if (!diff) {
    try {
      diff = (await repo.diff(false)).trim();
    } catch {
      diff = "";
    }
  }
  if (!diff) return undefined;
  if (diff.length > MAX_DIFF_CHARS) {
    diff = `${diff.slice(0, MAX_DIFF_CHARS)}\n… (${t("commit.diffTruncated")})`;
  }
  return diff;
}

// ---------- 一次性会话:创建后立即归档,全程不出现在会话列表 ----------
// 归档只是从分组界面隐藏(不影响事件流与生成),生成结束后仍可在归档区查看/恢复。

function commitSessionKey(root: vscode.Uri): string {
  return `dsh.commit.session:${root.toString()}`;
}

/** 创建提交信息专用会话并立即归档(静默)。 */
async function createCommitSession(hub: DshHub, root: vscode.Uri): Promise<string> {
  const sessionId = await hub.createSession(root.fsPath);
  try {
    await hub.archiveSession(sessionId);
  } catch (error) {
    console.error("[dsh] archive commit session failed:", error);
  }
  return sessionId;
}

/** 清理旧版本遗留的「每仓库常驻」提交会话:归档并移除映射。 */
async function cleanupLegacyCommitSession(hub: DshHub, ctx: vscode.ExtensionContext, root: vscode.Uri): Promise<void> {
  try {
    const key = commitSessionKey(root);
    const legacy = ctx.workspaceState.get<string>(key);
    if (legacy && hub.store.sessions.has(legacy)) {
      await hub.archiveSession(legacy);
    }
    await ctx.workspaceState.update(key, undefined);
  } catch (error) {
    console.error("[dsh] cleanup legacy commit session failed:", error);
  }
}

// ---------- 模型选择(默认 deepseek-v4-flash + low:该档在 DeepSeek 模型上不开思考) ----------

async function ensureCommitModel(hub: DshHub, sessionId: string): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("dsh");
  const wantModel = cfg.get<string>("commitModel", "deepseek-v4-flash").trim() || "deepseek-v4-flash";
  const wantEffort = cfg.get<string>("commitReasoningEffort", "low").trim();
  const models = await hub.getSessionModels(sessionId);
  const group = models.groups.find((g) => g.models.some((m) => m.id === wantModel));
  if (!group) return; // 目标模型在目录中不存在:保持会话当前模型
  const model = group.models.find((m) => m.id === wantModel);
  const effort = model?.reasoning?.efforts.some((e) => e.id === wantEffort) ? wantEffort : undefined;
  const current = models.current;
  if (current.provider === group.id && current.model === wantModel && (effort === undefined || current.reasoningEffort === effort)) {
    return;
  }
  await hub.selectModel(sessionId, group.id, wantModel, effort);
}

// ---------- 生成流程 ----------

function buildPrompt(diff: string): string {
  return [
    "请根据下面的 git diff 生成一条提交信息(commit message)。",
    "",
    "要求:",
    "- 使用 Conventional Commits 风格(如 feat: / fix: / refactor: / chore: 等);",
    "- 第一行为主题行,必要时用空行分隔后接简短正文;",
    "- 不要调用任何工具,不要执行任何操作;",
    "- 不要解释,直接输出提交信息本身(不要用 markdown 代码块包裹)。",
    "",
    "git diff:",
    "```diff",
    diff,
    "```",
  ].join("\n");
}

type WaitOutcome = "done" | "cancelled" | "error" | "timeout" | "interrupted";

/**
 * 等待本轮生成结束。beforeTurn = 发送前最后一个已完成回合,
 * 避免上一次生成(若仍在运行)的 turnEnd 提前唤醒。
 */
function waitForTurnEnd(hub: DshHub, sessionId: string, beforeTurn: number, isCancelled: () => boolean): Promise<WaitOutcome> {
  return new Promise((resolve) => {
    let finished = false;
    const unsubs: (() => void)[] = [];
    let poll: ReturnType<typeof setInterval> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (outcome: WaitOutcome) => {
      if (finished) return;
      finished = true;
      if (poll !== undefined) clearInterval(poll);
      if (timer !== undefined) clearTimeout(timer);
      for (const u of unsubs) u();
      resolve(outcome);
    };
    unsubs.push(
      hub.store.on("turnEnd", (sid: string, turn: number) => {
        if (sid === sessionId && turn > beforeTurn) finish("done");
      }),
      hub.store.on("agentError", (sid: string) => {
        if (sid === sessionId) finish("error");
      }),
      // 纯文本场景:模型一旦请求审批/提问,取消并提示
      hub.store.on("approval", (approval) => {
        if (approval.sessionId === sessionId) {
          void hub.cancel(sessionId);
          finish("interrupted");
        }
      }),
      hub.store.on("question", (question) => {
        if (question.sessionId === sessionId) {
          void hub.cancel(sessionId);
          finish("interrupted");
        }
      }),
    );
    poll = setInterval(() => {
      if (isCancelled()) {
        void hub.cancel(sessionId);
        finish("cancelled");
      }
    }, 250);
    timer = setTimeout(() => {
      void hub.cancel(sessionId);
      finish("timeout");
    }, GENERATION_TIMEOUT_MS);
  });
}

/** 提取最后一轮 assistant 最终消息中的文本块。 */
function extractCommitMessage(hub: DshHub, sessionId: string, minSeq: number): string {
  const events = hub.store.eventsFor(sessionId).filter((e) => e.event.seq > minSeq);
  const messages = events.filter((e) => e.event.type === "assistant/message");
  if (messages.length === 0) return "";
  const last = messages[messages.length - 1].event;
  const content: unknown[] = last.data?.message?.content ?? [];
  const text = content
    .filter((b): b is { type: string; text: string } => {
      const item = b as { type?: unknown; text?: unknown } | null | undefined;
      return !!item && item.type === "text" && typeof item.text === "string";
    })
    .map((b) => b.text)
    .join("\n");
  return cleanupCommitMessage(text);
}

function cleanupCommitMessage(text: string): string {
  let out = text.trim();
  out = out.replace(/^```[a-zA-Z]*\s*\n?/, "").replace(/\n?```\s*$/, "");
  return out.trim();
}

// ---------- 命令注册 ----------

export function registerCommitMessageCommand(hub: DshHub, ctx: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand("dsh.generateCommitMessage", async (arg?: unknown) => {
    const api = await getGitApi();
    if (!api) {
      void vscode.window.showWarningMessage(t("commit.noGitApi"));
      return;
    }
    const repo = await resolveRepository(api, arg);
    if (!repo) {
      void vscode.window.showWarningMessage(t("commit.noRepo"));
      return;
    }
    const diff = await collectDiff(repo);
    if (!diff) {
      void vscode.window.showInformationMessage(t("commit.noChanges"));
      return;
    }
    const ready = await hub.ensureReady();
    if (!ready.ok) {
      void vscode.window.showErrorMessage(t("commit.serverUnavailable", { message: ready.message ?? "" }));
      return;
    }
    await cleanupLegacyCommitSession(hub, ctx, repo.rootUri);
    let sessionId: string;
    try {
      sessionId = await createCommitSession(hub, repo.rootUri);
    } catch (error) {
      void vscode.window.showErrorMessage(t("commit.failed", { error: error instanceof Error ? error.message : String(error) }));
      return;
    }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: t("commit.generating"), cancellable: true },
      async (_progress, token) => {
        let cancelled = false;
        token.onCancellationRequested(() => {
          cancelled = true;
        });
        try {
          await ensureCommitModel(hub, sessionId);
        } catch (error) {
          void vscode.window.showErrorMessage(t("commit.failed", { error: error instanceof Error ? error.message : String(error) }));
          return;
        }
        const beforeTurn = hub.store.lastTurnBySession.get(sessionId) ?? 0;
        const promptSeq = hub.store.maxSeq.get(sessionId) ?? 0;
        try {
          await hub.send(sessionId, buildPrompt(diff));
        } catch {
          return; // hub.send 已通过 onNotice 弹出错误提示
        }
        const outcome = await waitForTurnEnd(hub, sessionId, beforeTurn, () => cancelled);
        switch (outcome) {
          case "cancelled":
            void vscode.window.showInformationMessage(t("commit.cancelled"));
            return;
          case "timeout":
            void vscode.window.showErrorMessage(t("commit.timeout"));
            return;
          case "interrupted":
            void vscode.window.showWarningMessage(t("commit.interrupted"));
            return;
          case "error":
            void vscode.window.showErrorMessage(t("commit.failed", { error: t("commit.agentError") }));
            return;
          case "done":
            break;
        }
        const message = extractCommitMessage(hub, sessionId, promptSeq);
        if (!message) {
          void vscode.window.showWarningMessage(t("commit.empty"));
          return;
        }
        repo.inputBox.value = message;
        void vscode.window.showInformationMessage(t("commit.done"));
      },
    );
  });
}
