import * as vscode from "vscode";
import { createTranslator, effectiveLanguage, SUPPORTED_LANGUAGES } from "../dsh/i18n";
import { readFileSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import type { DshHub } from "../dsh/hub";
import { folderCwd } from "../dsh/participantSessions";
import { checkpointSummaries, gitHeadUriForFile, gitShowContent, loadRollbackRecord, rollbackFileDiff, rollbackPreview } from "../dsh/rollback";
import type { PendingApproval, PendingQuestion, StoredEvent, StoredSession } from "../dsh/sessionStore";
import type { CommandExecutionView, PromptContentPart } from "../dsh/types";

/** 宿主侧文案翻译(跟随 dsh.language 设置,配置变更即时生效)。 */
const t = createTranslator();

/** 回退对比:自定义 URI scheme,由内容提供器按需执行 git show <commit>:<path> 供给 diff 左栏。 */
const COMPARE_SCHEME = "dsh-git-old";
let compareProviderRegistered = false;
function ensureCompareProvider() {
  if (compareProviderRegistered) return;
  compareProviderRegistered = true;
  const provider: vscode.TextDocumentContentProvider = {
    provideTextDocumentContent: async (uri: vscode.Uri): Promise<string> => {
      const query = new URLSearchParams(uri.query);
      const cwd = query.get("cwd") ?? "";
      const commit = query.get("commit") ?? "";
      const path = query.get("path") ?? "";
      return gitShowContent(cwd, commit, path);
    },
  };
  void vscode.workspace.registerTextDocumentContentProvider(COMPARE_SCHEME, provider);
}

/** 文件名清理:替换非法字符、压缩空白、去首尾符号并截断。 */
function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\r\n\t]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\- ]+|[.\- ]+$/g, "")
    .trim();
  return (cleaned || "plan").slice(0, 48);
}

/** 转义正则元字符(用于按名替换 @提及)。 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 解析智能体定义文件的 front matter(行业约定:Claude Code / Codex / Copilot agents 同款)。
 * ---
 * name: xxx
 * description: xxx
 * ---
 * 正文
 * 无 front matter 时回退文件名。
 */
function parseAgentFrontMatter(raw: string, fallbackName: string): { name: string; description?: string; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { name: fallbackName, body: raw.trim() };
  const fields: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w.-]+)\s*:\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  const name = (fields.name ?? fallbackName).trim() || fallbackName;
  return {
    name,
    ...(fields.description ? { description: fields.description } : {}),
    body: raw.slice(m[0].length).trim(),
  };
}

/** 计划文件路径持久化键(globalState)。 */
const PLAN_FILES_KEY = "dsh.planFiles";

/**
 * 聊天面板宿主抽象:同一个 ChatChannel 可挂在侧边栏 WebviewView 或编辑器区 WebviewPanel 上。
 */
export interface ChatSink {
  webview: vscode.Webview;
  onDidDispose: vscode.Event<void>;
  dispose(): void;
}

/**
 * 聊天通道:会话存储的增量同步 + webview 消息处理 + HTML/CSP 装配。
 * 侧边栏视图与独立窗口共用这一份逻辑。
 */
export class ChatChannel {
  private disposables: vscode.Disposable[] = [];
  /** 会话 → 计划文本文件路径(写入工作区 .dsh/plans 或全局存储;随 globalState 持久化) */
  private planFiles = new Map<string, string>();
  /** 回合级 Git 回退:.dsh/rollback 文件监控器与去抖定时器 */
  private rollbackWatchers: vscode.Disposable[] = [];
  private rollbackRefreshTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly hub: DshHub,
    private readonly ctx: vscode.ExtensionContext,
    private readonly sink: ChatSink,
  ) {
    // 恢复上次会话的计划文件路径(重启 VS Code 后仍可重新打开)
    try {
      const saved = this.ctx.globalState.get<Record<string, string>>(PLAN_FILES_KEY);
      if (saved) for (const [sid, path] of Object.entries(saved)) this.planFiles.set(sid, path);
    } catch { /* 忽略损坏的持久化数据 */ }
    sink.webview.options = {
      ...sink.webview.options,
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.ctx.extensionUri, "dist"),
        vscode.Uri.joinPath(this.ctx.extensionUri, "media"),
      ],
    };
    sink.webview.html = this.html(sink.webview);
    sink.webview.onDidReceiveMessage((msg) => void this.onMessage(msg), undefined, this.disposables);
    this.disposables.push(
      sink.onDidDispose(() => {
        for (const d of this.disposables) d.dispose();
        this.disposables = [];
      }),
    );

    const store = this.hub.store;
    const activeEditorSub = vscode.window.onDidChangeActiveTextEditor(() => this.postActiveFile());
    const configSub = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("dsh.language")) {
        this.post({ kind: "lang", lang: effectiveLanguage(), languagePref: this.languagePref() });
      }
      if (e.affectsConfiguration("dsh.agentConfigDirs")) {
        // 扫描目录开关变更:重新扫描并推送 + 同步开关状态到设置面板
        this.post({ kind: "agentDirs", value: this.agentDirsConfig() });
        void this.rescanAgentConfigs();
      }
    });
    this.disposables.push(
      // 激活文件推送:编辑器切换或视图创建时告知前端(默认附加)
      { dispose: () => activeEditorSub.dispose() },
      // 语言设置变更:通知前端重载界面
      { dispose: () => configSub.dispose() },
      // 工作区文件夹变更:通知前端(会话下拉按当前目录过滤)
      { dispose: () => vscode.workspace.onDidChangeWorkspaceFolders(() => this.post({ kind: "workspaceFolder", path: this.workspaceFolder() })) },
      { dispose: store.on("sessionsChanged", () => this.post({ kind: "sessions", sessions: this.serializeSessions() })) },
      { dispose: store.on("jobs", (sid: string, jobs: unknown) => this.post({ kind: "jobs", sessionId: sid, jobs })) },
      {
        dispose: store.on("queue", (sid: string, items: unknown) => {
          if (sid === store.currentSessionId) this.post({ kind: "queue", sessionId: sid, items });
        }),
      },
      { dispose: store.on("workspaces", () => this.post({ kind: "workspaces", workspaces: this.serializeWorkspaces() })) },
      {
        dispose: store.on("sessionEvent", (sid: string, stored: StoredEvent) => {
          if (sid === store.currentSessionId) {
            this.post({ kind: "delta", sessionId: sid, events: [this.serializeEvent(stored)] });
          }
        }),
      },
      {
        dispose: store.on("running", (sid: string, running: boolean) => {
          if (sid === store.currentSessionId) this.post({ kind: "running", sessionId: sid, running });
        }),
      },
      {
        dispose: store.on("approval", (approval: PendingApproval) => {
          if (approval.sessionId === store.currentSessionId) this.post({ kind: "approval", ...approval });
        }),
      },
      { dispose: store.on("approvalResolved", (approvalId: string) => this.post({ kind: "approvalResolved", approvalId })) },
      {
        dispose: store.on("question", (question: PendingQuestion) => {
          if (question.sessionId === store.currentSessionId) this.post({ kind: "question", ...question });
        }),
      },
      {
        dispose: store.on("question", (question: PendingQuestion) => {
          // 计划审批:在 VS Code 编辑器区打开计划文本窗口;后续计划更新原地替换内容
          for (const item of question.questions) {
            const intent = (item as { intent?: { kind?: string } }).intent;
            if (intent?.kind === "plan-review" && item.detail) {
              void this.updatePlanDocument(question.sessionId, item.detail);
              break;
            }
          }
        }),
      },
      { dispose: store.on("questionResolved", (frameRpcId: string) => this.post({ kind: "questionResolved", frameRpcId })) },
      {
        dispose: store.on("goal", (sid: string, value: unknown) => {
          if (sid === store.currentSessionId) this.post({ kind: "goal", sessionId: sid, value });
        }),
      },
      {
        dispose: store.on("context", (sid: string, value: unknown) => {
          if (sid === store.currentSessionId) this.post({ kind: "context", sessionId: sid, value });
        }),
      },
      {
        dispose: store.on("permissions", (sid: string, value: unknown) => {
          if (sid === store.currentSessionId) this.post({ kind: "permissions", sessionId: sid, value });
        }),
      },
      {
        dispose: store.on("stats", (sid: string, value: unknown) => {
          if (sid === store.currentSessionId) this.post({ kind: "stats", sessionId: sid, value });
        }),
      },
      {
        dispose: store.on("todos", (sid: string, value: unknown) => {
          if (sid === store.currentSessionId) this.post({ kind: "todos", sessionId: sid, value });
        }),
      },
      {
        dispose: store.on("currentChanged", () => {
          void this.pushFullState();
        }),
      },
      { dispose: this.hub.onStatus((status) => this.post({ kind: "status", status })) },
      {
        dispose: () => {
          for (const w of this.rollbackWatchers) w.dispose();
          this.rollbackWatchers = [];
          for (const timer of this.rollbackRefreshTimers.values()) clearTimeout(timer);
          this.rollbackRefreshTimers.clear();
        },
      },
      {
        dispose: store.on("sessionEvent", (sid: string, stored: StoredEvent) => {
          // 新回合开始 = 服务端插件会写入新快照记录;去抖刷新让回退按钮及时出现
          if (stored.event.type === "turn/start" && sid === store.currentSessionId) {
            this.scheduleRollbackRefresh(sid);
          }
        }),
      },
    );

    this.setupRollbackWatchers();

    void this.ensureAndPush();
    this.postActiveFile();
  }

  private postActiveFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== "file") {
      this.post({ kind: "activeFile", file: null });
      return;
    }
    this.post({
      kind: "activeFile",
      file: {
        path: editor.document.uri.fsPath,
        label: editor.document.uri.fsPath.replace(/\\/g, "/").split("/").pop() ?? editor.document.uri.fsPath,
        languageId: editor.document.languageId,
      },
    });
  }

  private async ensureAndPush() {
    await this.hub.ensureReady();
    const current = this.hub.store.currentSessionId;
    if (current) void this.hub.updateCurrentModel(current);
    await this.pushFullState();
  }

  /**
   * 计划审批:把计划文本写入持久文件(Claude Code 计划窗口同款,纯文本等宽字体),
   * 并在编辑器区打开;同一会话的后续计划更新原地覆盖同一文件,已打开编辑器自动刷新。
   */
  private async updatePlanDocument(sessionId: string, plan: string) {
    const content = `${t("plan.reviewHeader")}\n\n${plan}`;
    try {
      const uri = await this.planUriFor(sessionId);
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
      // 迁移:旧版 .txt 计划文件按新 .md 路径覆盖后清理旧文件
      const prev = this.planFiles.get(sessionId);
      if (prev && prev !== uri.fsPath) {
        try {
          await vscode.workspace.fs.delete(vscode.Uri.file(prev), { useTrash: false });
        } catch {
          // 旧文件清理失败不影响新计划
        }
      }
      this.planFiles.set(sessionId, uri.fsPath);
      void this.ctx.globalState.update(PLAN_FILES_KEY, Object.fromEntries(this.planFiles));
      // 通知前端把计划文件计入本轮产物(📦 产物卡)
      this.post({ kind: "planFile", sessionId, path: uri.fsPath });
      // 已在编辑器打开则磁盘写入会自动刷新;否则打开(Claude Code 同款旁侧预览)
      const open = vscode.window.visibleTextEditors.some((e) => e.document.uri.toString() === uri.toString());
      if (!open) {
        const doc = await vscode.workspace.openTextDocument(uri);
        // 预览模式,在当前编辑器组打开为子 tab(不再新开编辑器组/窗口)
        await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });
      }
    } catch (error) {
      console.error("[dsh] plan document write/open failed:", error);
    }
  }

  /** 计划文件位置:工作区 .dsh/plans(便于在产物/资源管理器中查看),无工作区时回退全局存储。 */
  private async planUriFor(sessionId: string): Promise<vscode.Uri> {
    const cwd = this.hub.store.sessions.get(sessionId)?.cwd ?? folderCwd();
    if (cwd) {
      const dir = vscode.Uri.joinPath(vscode.Uri.file(cwd), ".dsh", "plans");
      await vscode.workspace.fs.createDirectory(dir);
      return vscode.Uri.joinPath(dir, this.planNameFor(sessionId));
    }
    const dir = vscode.Uri.joinPath(this.ctx.globalStorageUri, "dsh-plans");
    await vscode.workspace.fs.createDirectory(dir);
    return vscode.Uri.joinPath(dir, this.planNameFor(sessionId));
  }

  /** 计划文件的可读命名:优先会话标题(清理非法字符),否则短 id;跨会话同名时追加短 id 防覆盖。 */
  private planNameFor(sessionId: string): string {
    const title = (this.hub.store.sessions.get(sessionId)?.title ?? "").trim();
    const base = title ? sanitizeFileName(title) : sessionId.slice(0, 8);
    const name = `plan-${base}.md`;
    const taken = [...this.planFiles.entries()].some(([sid, path]) => sid !== sessionId && basename(path) === name);
    return taken ? `plan-${base}-${sessionId.slice(0, 8)}.md` : name;
  }

  /** 重新打开某会话的计划文本(重启 VS Code 后选择该会话时调用),当前编辑器组预览 tab。 */
  private async openPlanFile(path: string) {
    try {
      const uri = vscode.Uri.file(path);
      await vscode.workspace.fs.stat(uri);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });
    } catch {
      // 文件缺失/不可读时静默,不打断会话切换
    }
  }

  /** 产物是 git 已跟踪文件时:默认打开「HEAD → 工作树」diff 视图,改动一眼可见;失败回退普通打开。 */
  private async tryOpenGitDiff(filePath: string): Promise<boolean> {
    try {
      const headUri = await gitHeadUriForFile(filePath);
      if (!headUri) return false;
      await vscode.commands.executeCommand("vscode.diff", headUri, vscode.Uri.file(filePath), `${basename(filePath)} (HEAD → Working Tree)`);
      return true;
    } catch {
      return false;
    }
  }

  private serializeSessions(): StoredSession[] {
    return this.hub.store.listSessions().map((s) => {
      const pending = this.hub.store.pendingFor(s.sessionId);
      return { ...s, unread: this.hub.store.unreadSessionIds.has(s.sessionId), ...(pending ? { pending } : {}) };
    });
  }

  private serializeWorkspaces() {
    const store = this.hub.store;
    return {
      workspaces: store.listWorkspaces(),
      workspaceOrder: store.workspaceOrder,
      archivedSessionIds: [...store.archivedSessionIds],
    };
  }

  private serializeEvent(stored: StoredEvent): { event: unknown; view?: unknown } {
    return { event: stored.event, ...(stored.view ? { view: stored.view } : {}) };
  }

  /**
   * 批量序列化(init / historyMore 载荷):合并同一 (turn, step, index) 内连续的
   * assistant/chunk text-delta / reasoning-delta 事件,显著减小长会话的 wire 载荷
   * 与 webview 重放事件数。合并后事件 data 为克隆对象,不修改存储内的事件。
   */
  private serializeEventsForWire(stored: StoredEvent[]): { event: any; view?: unknown }[] {
    const out: { event: any; view?: unknown }[] = [];
    for (const item of stored) {
      const ev = item.event;
      if (ev.type === "assistant/chunk") {
        const chunk = ev.data?.chunk ?? {};
        const kind = chunk.type;
        const key = `${ev.data?.turn ?? ""}|${ev.data?.step ?? ""}|${chunk.index ?? ""}`;
        if (kind === "text-delta" || kind === "reasoning-delta") {
          const last = out.length > 0 ? out[out.length - 1] : undefined;
          if (last && last.event?.type === "assistant/chunk") {
            const lastChunk = last.event.data?.chunk ?? {};
            if (lastChunk.type === kind && `${last.event.data?.turn ?? ""}|${last.event.data?.step ?? ""}|${lastChunk.index ?? ""}` === key) {
              last.event = {
                ...last.event,
                seq: ev.seq,
                data: { ...last.event.data, chunk: { ...lastChunk, text: (lastChunk.text ?? "") + (chunk.text ?? "") } },
              };
              continue;
            }
          }
        }
        out.push({ event: { ...ev, data: { ...(ev.data ?? {}), chunk: { ...chunk } } } });
        continue;
      }
      out.push({ event: ev, ...(item.view ? { view: item.view } : {}) });
    }
    return out;
  }

  private async pushFullState() {
    const store = this.hub.store;
    const current = store.currentSessionId;
    this.post({
      kind: "init",
      lang: effectiveLanguage(),
      languagePref: this.languagePref(),
      agentDirs: this.agentDirsConfig(),
      status: this.hub.status,
      sessions: this.serializeSessions(),
      ...this.serializeWorkspaces(),
      workspaceFolder: this.workspaceFolder(),
      current,
      events: current ? this.serializeEventsForWire(store.eventsFor(current)) : [],
      approvals: current ? [...store.pendingApprovals.values()].filter((a) => a.sessionId === current) : [],
      questions: current ? [...store.pendingQuestions.values()].filter((q) => q.sessionId === current) : [],
      queue: current ? store.queues.get(current) ?? [] : [],
      jobs: current ? store.jobs.get(current) ?? [] : [],
      running: current ? (store.sessions.get(current)?.running ?? false) : false,
      goal: current ? store.goals.get(current) : undefined,
      context: current ? store.context.get(current) : undefined,
      permissions: current ? store.permissions.get(current) : undefined,
      stats: current ? store.stats.get(current) : undefined,
      todos: current ? store.todos.get(current) : undefined,
      hasMore: current ? (store.historyHasMore.get(current) ?? false) : false,
      planFile: current ? this.planFiles.get(current) : undefined,
    });
    // 回合级 Git 回退快照状态(异步读盘,单独推送)
    if (current) void this.refreshRollback(current);
  }

  // ---------- 回合级 Git 回退(服务端插件快照 + 本地执行恢复) ----------

  /** 建立工作区 .dsh/rollback 记录文件监控(服务端插件按回合写入)。 */
  private setupRollbackWatchers() {
    const watchers: vscode.FileSystemWatcher[] = [];
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, "**/.dsh/rollback/*.json"));
      const onChange = () => {
        const current = this.hub.store.currentSessionId;
        if (current) this.scheduleRollbackRefresh(current);
      };
      watcher.onDidCreate(onChange);
      watcher.onDidChange(onChange);
      watcher.onDidDelete(onChange);
      watchers.push(watcher);
    }
    this.rollbackWatchers = watchers;
  }

  /** 去抖刷新:服务端一次快照会连续写多条记录,合并为一次读取。 */
  private scheduleRollbackRefresh(sessionId: string) {
    const existing = this.rollbackRefreshTimers.get(sessionId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.rollbackRefreshTimers.delete(sessionId);
      void this.refreshRollback(sessionId);
    }, 400);
    this.rollbackRefreshTimers.set(sessionId, timer);
  }

  /** 读取会话的回合快照记录并推送给前端(消息操作条据此显示回退按钮)。 */
  private async refreshRollback(sessionId: string) {
    const session = this.hub.store.sessions.get(sessionId);
    const cwd = session?.cwd ?? folderCwd();
    if (!cwd) {
      this.post({ kind: "rollback", sessionId, available: false, checkpoints: [] });
      return;
    }
    const record = await loadRollbackRecord(cwd, sessionId);
    if (!record || record.checkpoints.length === 0) {
      this.post({ kind: "rollback", sessionId, available: false, checkpoints: [] });
      return;
    }
    this.post({
      kind: "rollback",
      sessionId,
      available: true,
      checkpoints: record.checkpoints.map((t) => ({ turn: t.turn, time: t.time })),
    });
  }

  private async onMessage(msg: { kind: string; [key: string]: any }) {
    const store = this.hub.store;
    const current = store.currentSessionId;
    switch (msg.kind) {
      case "ready":
        await this.ensureAndPush();
        break;
      case "send": {
        if (current && typeof msg.text === "string" && msg.text.trim()) {
          try {
            // @智能体名 提及:注入智能体定义上下文(折叠为附件上下文),并从可见文本中移除 @token
            const mention = await this.composeAgentMentions(msg.text);
            const baseText = mention ? mention.text : msg.text;
            const images: { data: string; mediaType: string; name?: string }[] = Array.isArray(msg.images) ? msg.images.slice(0, 8) : [];
            if (images.length > 0) {
              // 带图片的消息:直接以内容块发送(官方 session.prompt image 通道)
              const content: PromptContentPart[] = images.map((img) => ({
                type: "image",
                mediaType: typeof img.mediaType === "string" ? img.mediaType : "image/png",
                data: img.data,
                ...(img.name ? { name: img.name } : {}),
              }));
              const text = await this.composeWithAttachments(baseText, msg.attachments, mention?.agentParts);
              content.push({ type: "text", text });
              await this.hub.sendParts(current, content);
            } else {
              const raw = baseText.trim();
              // 斜杠 token 路由(与网页端裁决一致):
              // - 已知宿主命令 → 命令通道(commands.execute,不产生模型回合);
              // - 其他 token(技能 /name 等)→ 普通 prompt,由宿主 pre-step 边界注入技能正文。
              if (isCommandLine(raw) && !(msg.attachments?.length > 0)) {
                const cmdName = raw.split(/\s+/)[0].slice(1);
                if (await this.hub.isKnownCommand(current, cmdName)) {
                  await this.runCommandAndNotify(current, raw);
                } else {
                  const text = await this.composeWithAttachments(baseText, msg.attachments, mention?.agentParts);
                  await this.hub.send(current, text);
                }
              } else {
                const text = await this.composeWithAttachments(baseText, msg.attachments, mention?.agentParts);
                await this.hub.send(current, text);
              }
            }
          } catch {
            // 错误已通过 notice 提示
          }
        }
        break;
      }
      case "pickImages": {
        try {
          const picked = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: true,
            openLabel: t("dlg.addImage"),
            filters: { [t("dlg.imageFilter")]: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] },
            defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
          });
          if (!picked || picked.length === 0) break;
          const images: { data: string; mediaType: string; name: string }[] = [];
          for (const uri of picked.slice(0, 8)) {
            const raw = await vscode.workspace.fs.readFile(uri);
            if (raw.byteLength > 6 * 1024 * 1024) {
              this.post({ kind: "notice", message: t("notice.imageTooLarge", { name: uri.fsPath }), level: "warning" });
              continue;
            }
            const name = uri.fsPath.replace(/\\/g, "/").split("/").pop() ?? "image";
            const ext = name.split(".").pop()?.toLowerCase() ?? "png";
            const mediaType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/png";
            images.push({ data: Buffer.from(raw).toString("base64"), mediaType, name });
          }
          this.post({ kind: "imagesPicked", images });
        } catch (error) {
          this.post({ kind: "notice", message: t("notice.attachmentsFailed", { error: String(error) }), level: "error" });
        }
        break;
      }
      case "attachmentRead": {
        if (current && typeof msg.attachmentId === "string" && typeof msg.messageId === "string") {
          try {
            const value = await this.hub.readAttachment(current, msg.attachmentId);
            this.post({ kind: "attachmentData", messageId: msg.messageId, attachmentId: msg.attachmentId, data: value.data, mediaType: value.attachment?.mediaType });
          } catch (error) {
            this.post({ kind: "attachmentData", messageId: msg.messageId, attachmentId: msg.attachmentId, error: String(error) });
          }
        }
        break;
      }
      case "searchSessions": {
        if (typeof msg.query === "string" && msg.query.trim()) {
          try {
            const value = await this.hub.searchSessions(msg.query.trim().slice(0, 500));
            this.post({ kind: "searchResults", requestId: msg.requestId, value });
          } catch (error) {
            this.post({ kind: "searchResults", requestId: msg.requestId, value: null, error: String(error) });
          }
        }
        break;
      }
      // ---------- 工作区管理 ----------
      case "workspaceAdd": {
        try {
          const picked = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: t("dlg.addWorkspace"),
            defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
          });
          const path = picked?.[0]?.fsPath;
          if (!path) break;
          await this.hub.createWorkspace(path);
          await this.hub.refreshWorkspaces();
          this.post({ kind: "workspaces", workspaces: this.serializeWorkspaces() });
        } catch (error) {
          this.post({ kind: "notice", message: t("notice.workspaceAddFailed", { error: String(error) }), level: "error" });
        }
        break;
      }
      case "workspaceRename": {
        if (typeof msg.workspaceId === "string" && typeof msg.title === "string" && msg.title.trim()) {
          try {
            await this.hub.renameWorkspace(msg.workspaceId, msg.title.trim());
            await this.hub.refreshWorkspaces();
            this.post({ kind: "workspaces", workspaces: this.serializeWorkspaces() });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.workspaceRenameFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "workspaceDelete": {
        if (typeof msg.workspaceId === "string") {
          try {
            await this.hub.deleteWorkspace(msg.workspaceId);
            await this.hub.refreshWorkspaces();
            this.post({ kind: "workspaces", workspaces: this.serializeWorkspaces() });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.workspaceDeleteFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "workspaceMove": {
        if (typeof msg.workspaceId === "string") {
          try {
            await this.hub.moveWorkspace(msg.workspaceId, typeof msg.beforeWorkspaceId === "string" ? msg.beforeWorkspaceId : undefined);
            await this.hub.refreshWorkspaces();
            this.post({ kind: "workspaces", workspaces: this.serializeWorkspaces() });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.workspaceMoveFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "sessionMove": {
        if (typeof msg.workspaceId === "string" && typeof msg.sessionId === "string") {
          try {
            await this.hub.moveSessionInWorkspace(msg.workspaceId, msg.sessionId, typeof msg.beforeSessionId === "string" ? msg.beforeSessionId : undefined);
            await this.hub.refreshWorkspaces();
            this.post({ kind: "workspaces", workspaces: this.serializeWorkspaces() });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.sessionMoveFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "unarchiveSession": {
        // 官方 wire 无 unarchive 端点;归档会话仍可打开(归档只是从分组表面隐藏)
        if (typeof msg.sessionId === "string") {
          await this.hub.openSession(msg.sessionId);
          await this.pushFullState();
        }
        break;
      }
      case "getActiveFile":
        this.postActiveFile();
        break;
      case "pickAttachments": {
        try {
          const mode: "file" | "folder" | undefined = msg.mode === "folder" ? "folder" : msg.mode === "file" ? "file" : undefined;
          const picked = await vscode.window.showOpenDialog({
            canSelectFiles: mode !== "folder",
            canSelectFolders: mode !== "file",
            canSelectMany: true,
            openLabel: mode === "folder" ? t("dlg.addFolder") : mode === "file" ? t("dlg.addFile") : t("dlg.addToChat"),
            defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
          });
          if (!picked || picked.length === 0) break;
          const attachments: { kind: "file" | "folder"; path: string; label: string }[] = picked.slice(0, 10).map((uri) => ({
            kind: "file" as "file",
            path: uri.fsPath,
            label: uri.fsPath.replace(/\\/g, "/").split("/").pop() ?? uri.fsPath,
          }));
          // 目录判断:无扩展名且 stat 为目录
          for (const a of attachments) {
            try {
              const stat = await vscode.workspace.fs.stat(vscode.Uri.file(a.path));
              if (stat.type === vscode.FileType.Directory) a.kind = "folder";
            } catch {
              // 保持 file
            }
          }
          this.post({ kind: "attachmentsPicked", attachments });
        } catch (error) {
          this.post({ kind: "notice", message: t("notice.attachmentsFailed", { error: String(error) }), level: "error" });
        }
        break;
      }
      case "getSkills": {
        if (current) {
          try {
            const value = await this.hub.getSkills(current);
            this.post({ kind: "skills", sessionId: current, value });
          } catch (error) {
            this.post({ kind: "skills", sessionId: current, value: null, error: String(error) });
          }
        }
        break;
      }
      case "getClaudeConfig": {
        // 扫描工作区的智能体/技能配置目录:.claude / .codex / .github(Copilot)
        // 各目录族由 dsh.agentConfigDirs 勾选控制,全部勾选则全部扫描(默认全开)
        const empty = { claudeMd: false, commands: [], skills: [], codexConfig: false, codexSkills: [], copilotInstructions: null, copilotInstructionFiles: [], copilotAgents: [], copilotPrompts: [], dshSkills: [], dshAgents: [], dshMemory: [] };
        try {
          const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
          const value = folder ? await scanAgentConfigs(folder, this.agentDirsConfig()) : empty;
          this.post({ kind: "claudeConfig", value });
        } catch (error) {
          this.post({ kind: "claudeConfig", value: empty, error: String(error) });
        }
        break;
      }
      case "getSubagents": {
        if (current) {
          try {
            const value = await this.hub.listSubagents(current);
            this.post({ kind: "subagents", sessionId: current, value });
          } catch (error) {
            this.post({ kind: "subagents", sessionId: current, value: null, error: String(error) });
          }
        }
        break;
      }
      case "subagentPreview": {
        if (current && typeof msg.childId === "string") {
          try {
            const history = await this.hub.subagentHistory(current, msg.childId, msg.mode === "one-shot" ? "one-shot" : "continuable");
            const last = [...history.events].reverse().find((h) => h.event.type === "assistant/message");
            const text = (last?.event.data?.message?.content ?? [])
              .filter((b: any) => b?.type === "text")
              .map((b: any) => b.text)
              .join("\n");
            this.post({ kind: "subagentPreview", childId: msg.childId, preview: text.slice(0, 600) || t("notice.subagentNoReply") });
          } catch (error) {
            this.post({ kind: "subagentPreview", childId: msg.childId, preview: t("notice.subagentPreviewFailed", { error: String(error) }) });
          }
        }
        break;
      }
      case "stop":
        if (current) await this.hub.cancel(current);
        break;
      case "select":
        if (typeof msg.sessionId === "string") {
          await this.hub.openSession(msg.sessionId);
          void this.hub.updateCurrentModel(msg.sessionId);
          await this.pushFullState();
          // 重新打开该会话的计划文本(上次会话的计划可继续查看/修改)
          const planPath = this.planFiles.get(msg.sessionId);
          if (planPath) void this.openPlanFile(planPath);
        }
        break;
      case "new": {
        const cwd = folderCwd();
        try {
          const sessionId = await this.hub.createSession(cwd);
          void this.hub.applyDefaultReasoningEffort(sessionId);
          void this.hub.updateCurrentModel(sessionId);
          await this.pushFullState();
        } catch (error) {
          this.post({ kind: "notice", message: t("notice.newSessionFailed", { error: String(error) }), level: "error" });
        }
        break;
      }
      case "getModels": {
        if (current) {
          try {
            const value = await this.hub.getSessionModels(current);
            this.post({ kind: "models", sessionId: current, value });
          } catch (error) {
            this.post({ kind: "models", sessionId: current, value: null, error: String(error) });
          }
        }
        break;
      }
      case "selectModel": {
        if (current && typeof msg.provider === "string" && typeof msg.model === "string") {
          try {
            await this.hub.selectModel(current, msg.provider, msg.model, typeof msg.effort === "string" ? msg.effort : undefined);
            const value = await this.hub.getSessionModels(current);
            this.post({ kind: "models", sessionId: current, value });
            void this.hub.updateCurrentModel(current);
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.modelFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "getPresets": {
        try {
          const value = await this.hub.listPresets();
          this.post({ kind: "presets", value });
        } catch (error) {
          this.post({ kind: "presets", value: null, error: String(error) });
        }
        break;
      }
      case "selectPreset": {
        if (current && typeof msg.preset === "string") {
          try {
            await this.hub.selectPreset(current, msg.preset);
            this.post({ kind: "sessions", sessions: this.serializeSessions() });
            await this.pushFullState();
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.presetFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "rename": {
        if (current && typeof msg.title === "string" && msg.title.trim()) {
          try {
            await this.hub.renameSession(current, msg.title.trim());
            await this.hub.refreshSessions();
            this.post({ kind: "sessions", sessions: this.serializeSessions() });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.renameFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "fork": {
        if (current) {
          try {
            const forked = await this.hub.forkSession(current);
            await this.hub.openSession(forked);
            await this.pushFullState();
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.forkFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "archive": {
        if (current) {
          try {
            await this.hub.archiveSession(current);
            // 归档后选择下一个常规会话(跳过归档与子代理会话)
            const remaining = this.hub.store
              .listSessions()
              .filter((s) => !this.hub.store.archivedSessionIds.has(s.sessionId) && s.origin !== "subagent");
            const next = remaining[0]?.sessionId;
            if (next && next !== current) {
              this.hub.store.selectSession(next);
              await this.pushFullState();
            } else {
              this.hub.store.selectSession(undefined);
              await this.pushFullState();
            }
            this.post({ kind: "sessions", sessions: this.serializeSessions() });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.archiveFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "archiveSessionOnly": {
        // 从工作区面板归档会话(不切换当前会话)
        if (typeof msg.sessionId === "string") {
          try {
            await this.hub.archiveSession(msg.sessionId);
            await this.hub.refreshSessions();
            await this.hub.refreshWorkspaces();
            this.post({ kind: "sessions", sessions: this.serializeSessions() });
            this.post({ kind: "workspaces", workspaces: this.serializeWorkspaces() });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.archiveFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "feedback": {
        // 官方 /feedback 命令记录会话反馈;附带被评价消息的片段
        if (current && (msg.rating === "positive" || msg.rating === "negative")) {
          const snippet = typeof msg.snippet === "string" ? msg.snippet.slice(0, 200) : "";
          const label = msg.rating === "positive" ? "positive" : "negative";
          await this.runCommandAndNotify(current, `/feedback ${label}${snippet ? `: ${snippet}` : ""}`);
        }
        break;
      }
      case "forkAt": {
        // 从指定消息处回退并开启新分支(session.fork atSeq)
        if (current && typeof msg.seq === "number") {
          try {
            const forked = await this.hub.forkSession(current, msg.seq);
            await this.hub.openSession(forked);
            await this.pushFullState();
            this.post({ kind: "notice", message: t("notice.forked"), level: "info" });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.forkFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "command": {
        // 预设命令(计划模式等):走命令执行通道
        if (current && typeof msg.line === "string" && msg.line.trim()) {
          await this.runCommandAndNotify(current, msg.line.trim());
        }
        break;
      }
      case "permission": {
        if (current && typeof msg.preset === "string") {
          const result = await this.runCommandAndNotify(current, `/permission ${msg.preset}`);
          if (result.outcome !== "executed") {
            // 回退乐观更新:把存储中的真实权限投影重新推给界面
            this.post({ kind: "permissions", sessionId: current, value: store.permissions.get(current) });
          }
        }
        break;
      }
      case "updateQueue": {
        // 排队消息操作:编辑 / 移除 / 插队(session.updateQueue)
        if (typeof msg.sessionId === "string" && typeof msg.itemId === "string" && msg.action && typeof msg.action === "object") {
          try {
            await this.hub.client.updateQueue(msg.sessionId, msg.itemId, msg.action as { kind: "edit"; content: unknown[] } | { kind: "remove" } | { kind: "steer" });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.queueActionFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "goalComplete": {
        if (current && msg.ref?.id) {
          try {
            await this.hub.completeGoal(current, msg.ref);
            this.post({ kind: "notice", message: t("notice.goalComplete"), level: "info" });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.goalCompleteFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "goalEdit": {
        if (current && msg.ref?.id) {
          try {
            await this.hub.editGoal(current, msg.ref, typeof msg.objective === "string" ? msg.objective : undefined);
            this.post({ kind: "notice", message: t("notice.goalEdit"), level: "info" });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.goalEditFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "goalResume": {
        if (current && msg.ref?.id) {
          try {
            await this.hub.resumeGoal(current, msg.ref);
            this.post({ kind: "notice", message: t("notice.goalResume"), level: "info" });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.goalResumeFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "goalPause": {
        if (current && msg.ref?.id) {
          try {
            await this.hub.pauseGoal(current, msg.ref);
            this.post({ kind: "notice", message: t("notice.goalPause"), level: "info" });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.goalPauseFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "goalClear": {
        if (current && msg.ref?.id) {
          try {
            await this.hub.clearGoal(current, msg.ref);
            this.post({ kind: "notice", message: t("notice.goalClear"), level: "info" });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.goalClearFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "openFile": {
        // 产物/文件打开:相对路径按会话 cwd 解析(与网页端 openFile 语义一致),非文本文件回退资源管理器
        if (typeof msg.path === "string" && msg.path) {
          let target = msg.path;
          if (!isAbsolutePath(target) && current) {
            const cwd = store.sessions.get(current)?.cwd;
            if (cwd) target = join(cwd, target);
          }
          try {
            // 产物是 git 已跟踪文件时:默认打开 HEAD → 工作树 diff,改动一眼可见
            if (await this.tryOpenGitDiff(target)) break;
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
            // 预览模式打开,保持聊天面板焦点(计划待审等文件不进入编辑模式)
            await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });
          } catch {
            try {
              await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(target));
            } catch {
              // 无原生揭示能力则忽略
            }
          }
        }
        break;
      }
      case "rollbackApply": {
        // 回合级回退:统一走服务端插件命令通道(命令结果摘要经 runCommandAndNotify 透传)
        const sid = typeof msg.sessionId === "string" ? msg.sessionId : current;
        const turn = typeof msg.turn === "number" ? msg.turn : NaN;
        if (!sid || !Number.isFinite(turn)) break;
        await this.runCommandAndNotify(sid, `/rollback ${turn}`);
        break;
      }
      case "rollbackPreview": {
        // 回退前「代码审核」:工作区相对目标检查点的逐文件差异 + 将删除的未跟踪文件
        const sid = typeof msg.sessionId === "string" ? msg.sessionId : current;
        if (!sid) break;
        const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
        const session = store.sessions.get(sid);
        const cwd = session?.cwd ?? folderCwd();
        const record = cwd ? await loadRollbackRecord(cwd, sid) : undefined;
        const turn = typeof msg.turn === "number" ? msg.turn : undefined;
        const preview = cwd && record ? await rollbackPreview(cwd, record, turn) : undefined;
        this.post({
          kind: "rollbackPreviewData",
          requestId,
          sessionId: sid,
          ...(preview ? { preview } : { error: t("rollback.noRecord") }),
        });
        break;
      }
      case "rollbackDiff": {
        // 单个文件的完整差异(弹窗内点击展开时按需获取)
        const sid = typeof msg.sessionId === "string" ? msg.sessionId : current;
        if (!sid || typeof msg.path !== "string") break;
        const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
        const session = store.sessions.get(sid);
        const cwd = session?.cwd ?? folderCwd();
        const record = cwd ? await loadRollbackRecord(cwd, sid) : undefined;
        const turn = typeof msg.turn === "number" ? msg.turn : undefined;
        const entry = record && (typeof turn === "number" ? record.checkpoints.find((c) => c.turn === turn) : record.checkpoints[record.checkpoints.length - 1]);
        const diff = cwd && entry ? await rollbackFileDiff(cwd, entry.commit, msg.path) : undefined;
        this.post({
          kind: "rollbackDiffData",
          requestId,
          sessionId: sid,
          path: msg.path,
          ...(diff !== undefined ? { diff } : { error: "diff unavailable" }),
        });
        break;
      }
      case "rollbackCheckpoints": {
        // 检查点清单弹窗:每个检查点相对当前工作区的差异概览
        const sid = typeof msg.sessionId === "string" ? msg.sessionId : current;
        if (!sid) break;
        const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
        const session = store.sessions.get(sid);
        const cwd = session?.cwd ?? folderCwd();
        const record = cwd ? await loadRollbackRecord(cwd, sid) : undefined;
        const summary = cwd && record ? await checkpointSummaries(cwd, record) : undefined;
        this.post({
          kind: "rollbackCheckpointsData",
          requestId,
          sessionId: sid,
          ...(summary ? summary : { error: t("rollback.noRecord") }),
        });
        break;
      }
      case "rollbackCompare": {
        // 「对比」:用 VS Code 内置 diff 视图打开 检查点版本(git show,经自定义内容提供器)↔ 工作区当前版本
        const sid = typeof msg.sessionId === "string" ? msg.sessionId : current;
        if (!sid || typeof msg.path !== "string") break;
        const session = store.sessions.get(sid);
        const cwd = session?.cwd ?? folderCwd();
        const record = cwd ? await loadRollbackRecord(cwd, sid) : undefined;
        const turn = typeof msg.turn === "number" ? msg.turn : undefined;
        const entry = record && (typeof turn === "number" ? record.checkpoints.find((c) => c.turn === turn) : record.checkpoints[record.checkpoints.length - 1]);
        if (!cwd || !entry) {
          this.post({ kind: "notice", message: t("rollback.compareFailed", { error: t("rollback.noRecord") }), level: "error" });
          break;
        }
        try {
          ensureCompareProvider();
          const name = basename(msg.path);
          const query = `cwd=${encodeURIComponent(cwd)}&commit=${entry.commit}&path=${encodeURIComponent(msg.path)}`;
          const oldUri = vscode.Uri.parse(`${COMPARE_SCHEME}://compare/${encodeURIComponent(name)}?${query}`);
          const newUri = vscode.Uri.file(join(cwd, msg.path));
          await vscode.commands.executeCommand("vscode.diff", oldUri, newUri, name, { preview: true });
        } catch (error) {
          this.post({ kind: "notice", message: t("rollback.compareFailed", { error: String(error) }), level: "error" });
        }
        break;
      }
      case "loadMore":
        if (current) {
          const { hasMore } = await this.hub.loadMoreHistory(current);
          this.post({
            kind: "historyMore",
            sessionId: current,
            events: this.serializeEventsForWire(store.eventsFor(current)),
            hasMore,
          });
        }
        break;
      case "respond":
        if (current && typeof msg.approvalId === "string") {
          await this.hub.respondApproval(current, msg.approvalId, msg.outcome === "rejected" ? "rejected" : "allowed-once");
        }
        break;
      case "answer":
        if (current && typeof msg.frameRpcId === "string" && Array.isArray(msg.answers)) {
          await this.hub.respondQuestion(current, msg.frameRpcId, msg.answers);
        }
        break;
      case "answerCancel":
        if (current && typeof msg.frameRpcId === "string") {
          await this.hub.cancelQuestion(current, msg.frameRpcId);
        }
        break;
      case "goalCreate": {
        if (current && typeof msg.objective === "string" && msg.objective.trim()) {
          try {
            await this.hub.createGoal(current, msg.objective.trim(), typeof msg.maxGoalRounds === "number" ? msg.maxGoalRounds : undefined);
            this.post({ kind: "notice", message: t("notice.goalCreate"), level: "info" });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.goalCreateFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      // ---------- 预设作者 ----------
      case "presetRead": {
        if (typeof msg.preset === "string") {
          try {
            const value = await this.hub.readPreset(msg.preset);
            this.post({ kind: "presetRead", requestId: msg.requestId, value });
          } catch (error) {
            this.post({ kind: "presetRead", requestId: msg.requestId, value: null, error: String(error) });
          }
        }
        break;
      }
      case "presetCopy": {
        if (typeof msg.from === "string" && typeof msg.preset === "string") {
          try {
            await this.hub.copyPreset(msg.from, msg.preset, typeof msg.name === "string" ? msg.name : undefined);
            const value = await this.hub.listPresets();
            this.post({ kind: "presets", value });
            this.post({ kind: "notice", message: t("notice.presetCopied", { preset: msg.preset }), level: "info" });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.presetCopyFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "presetRemove": {
        if (typeof msg.preset === "string") {
          try {
            await this.hub.removePreset(msg.preset);
            const value = await this.hub.listPresets();
            this.post({ kind: "presets", value });
            this.post({ kind: "notice", message: t("notice.presetRemoved", { preset: msg.preset }), level: "info" });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.presetRemoveFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "presetOpenFolder": {
        if (typeof msg.preset === "string") {
          try {
            const result = await this.hub.openPresetDocument(msg.preset);
            if (!result.opened && result.path) {
              await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(result.path));
            }
            this.post({ kind: "presetFolderOpened", preset: msg.preset, path: result.path });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.presetOpenFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      // ---------- 子代理交互 ----------
      case "subagentOpen": {
        if (current && typeof msg.childId === "string") {
          try {
            const mode: "one-shot" | "continuable" = msg.mode === "one-shot" ? "one-shot" : "continuable";
            const history = await this.hub.subagentHistory(
              current,
              msg.childId,
              mode,
              typeof msg.beforeSeq === "number" ? msg.beforeSeq : undefined,
              typeof msg.beforeSeq === "number" ? 60 : undefined,
            );
            this.post({ kind: "subagentOpen", requestId: msg.requestId, childId: msg.childId, mode, events: history.events, hasMore: history.hasMore, append: !!msg.append });
          } catch (error) {
            this.post({ kind: "subagentOpen", requestId: msg.requestId, childId: msg.childId, error: String(error) });
          }
        }
        break;
      }
      case "subagentPrompt": {
        if (current && typeof msg.childId === "string" && typeof msg.text === "string" && msg.text.trim()) {
          try {
            await this.hub.subagentPrompt(current, msg.childId, msg.text.trim());
            this.post({ kind: "notice", message: t("notice.subagentPrompted"), level: "info" });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.subagentPromptFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "subagentInterrupt": {
        if (current && typeof msg.childId === "string") {
          try {
            await this.hub.subagentInterrupt(current, msg.childId);
            this.post({ kind: "notice", message: t("notice.subagentInterrupted"), level: "info" });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.subagentInterruptFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      // ---------- 设置 / 凭据 / LLM ----------
      case "settingsGet": {
        try {
          const value = await this.hub.settingsDescribe();
          this.post({ kind: "settingsDescribe", requestId: msg.requestId, value });
        } catch (error) {
          this.post({ kind: "settingsDescribe", requestId: msg.requestId, value: null, error: String(error) });
        }
        break;
      }
      case "settingsSave": {
        if (typeof msg.ns === "string" && msg.patch && typeof msg.patch === "object") {
          try {
            const next = await this.hub.settingsUpdate(msg.ns, msg.patch, typeof msg.expectedRevision === "number" ? msg.expectedRevision : undefined);
            this.post({ kind: "settingsSaved", requestId: msg.requestId, namespace: next });
            this.post({ kind: "notice", message: t("notice.settingsSaved", { ns: msg.ns }), level: "info" });
          } catch (error) {
            this.post({ kind: "settingsSaved", requestId: msg.requestId, error: String(error) });
            this.post({ kind: "notice", message: t("notice.settingsSaveFailed", { ns: msg.ns, error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "settingsReset": {
        if (typeof msg.ns === "string") {
          try {
            const next = await this.hub.settingsReplace(msg.ns, {}, typeof msg.expectedRevision === "number" ? msg.expectedRevision : undefined);
            this.post({ kind: "settingsSaved", requestId: msg.requestId, namespace: next });
            this.post({ kind: "notice", message: t("notice.settingsReset", { ns: msg.ns }), level: "info" });
          } catch (error) {
            this.post({ kind: "settingsSaved", requestId: msg.requestId, error: String(error) });
            this.post({ kind: "notice", message: t("notice.settingsSaveFailed", { ns: msg.ns, error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "settingsMutate": {
        if (typeof msg.ns === "string" && Array.isArray(msg.ops)) {
          try {
            const next = await this.hub.settingsMutate(msg.ns, msg.ops, typeof msg.expectedRevision === "number" ? msg.expectedRevision : undefined);
            this.post({ kind: "settingsSaved", requestId: msg.requestId, namespace: next });
          } catch (error) {
            this.post({ kind: "settingsSaved", requestId: msg.requestId, error: String(error) });
            this.post({ kind: "notice", message: t("notice.settingsSaveFailed", { ns: msg.ns, error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "settingsOpenDocument": {
        try {
          await this.hub.settingsOpenDocument();
        } catch (error) {
          this.post({ kind: "notice", message: t("notice.settingsOpenFailed", { error: String(error) }), level: "error" });
        }
        break;
      }
      case "setLanguage": {
        // 从设置面板切换界面语言(写入 dsh.language,全局)
        if (typeof msg.language === "string" && ["auto", ...SUPPORTED_LANGUAGES].includes(msg.language)) {
          try {
            await vscode.workspace.getConfiguration("dsh").update("language", msg.language, vscode.ConfigurationTarget.Global);
            this.post({ kind: "lang", lang: effectiveLanguage(), languagePref: msg.language });
            this.post({ kind: "notice", message: t("notice.languageSet", { lang: msg.language }), level: "info" });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.languageSetFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "setAgentDirs": {
        // 从设置面板切换智能体配置目录扫描开关(写入 dsh.agentConfigDirs,全局)
        const value = msg.value;
        if (value && typeof value === "object") {
          const next = {
            claude: value.claude !== false,
            codex: value.codex !== false,
            githubCopilot: value.githubCopilot !== false,
          };
          try {
            await vscode.workspace.getConfiguration("dsh").update("agentConfigDirs", next, vscode.ConfigurationTarget.Global);
          } catch (error) {
            // 配置未注册(旧版本扩展 / 开发宿主未重载):回退到扩展全局状态存储,开关依然生效
            console.warn("[dsh] dsh.agentConfigDirs not registered, falling back to globalState:", error);
            await this.ctx.globalState.update("dsh.agentConfigDirs", next);
          }
          this.post({ kind: "agentDirs", value: next });
          void this.rescanAgentConfigs();
        }
        break;
      }
      case "credentialSet": {
        if (typeof msg.ref === "string" && typeof msg.value === "string") {
          try {
            await this.hub.credentialsSet(msg.ref, msg.value);
            this.post({ kind: "credentialChanged", ref: msg.ref, set: true });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.credentialFailed", { ref: msg.ref, error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "credentialUnset": {
        if (typeof msg.ref === "string") {
          try {
            await this.hub.credentialsUnset(msg.ref);
            this.post({ kind: "credentialChanged", ref: msg.ref, set: false });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.credentialFailed", { ref: msg.ref, error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "credentialsState": {
        if (Array.isArray(msg.refs)) {
          try {
            const value = await this.hub.credentialsDescribe(msg.refs.slice(0, 50));
            this.post({ kind: "credentialsState", requestId: msg.requestId, value });
          } catch (error) {
            this.post({ kind: "credentialsState", requestId: msg.requestId, value: null, error: String(error) });
          }
        }
        break;
      }
      case "llmInfo": {
        try {
          const [providers, models] = await Promise.all([this.hub.llmProviders(), this.hub.llmModels()]);
          this.post({ kind: "llmInfo", requestId: msg.requestId, providers, models });
        } catch (error) {
          this.post({ kind: "llmInfo", requestId: msg.requestId, error: String(error) });
        }
        break;
      }
      case "discoverModels": {
        if (typeof msg.settingsNs === "string") {
          try {
            const value = await this.hub.llmDiscoverModels({
              settingsNs: msg.settingsNs,
              ...(typeof msg.provider === "string" ? { provider: msg.provider } : {}),
              ...(typeof msg.baseURL === "string" && msg.baseURL ? { baseURL: msg.baseURL } : {}),
              ...(typeof msg.api === "string" && msg.api ? { api: msg.api } : {}),
              ...(typeof msg.apiKey === "string" && msg.apiKey ? { apiKey: msg.apiKey } : {}),
            });
            this.post({ kind: "discoveredModels", requestId: msg.requestId, value });
          } catch (error) {
            this.post({ kind: "discoveredModels", requestId: msg.requestId, value: null, error: String(error) });
          }
        }
        break;
      }
      case "revealInExplorer": {
        if (typeof msg.path === "string" && msg.path) {
          try {
            await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(msg.path));
          } catch {
            // 无原生揭示能力则跳过
          }
        }
        break;
      }
      case "startServer":
        this.post({ kind: "status", status: { ...this.hub.status, serverStarting: true } });
        const result = await this.hub.ensureReady();
        if (!result.ok) {
          this.post({ kind: "notice", message: result.message ?? t("notice.serverStartFailed"), level: "error" });
        }
        await this.pushFullState();
        break;
      case "openBrowser":
        await vscode.env.openExternal(vscode.Uri.parse(this.dshUrl()));
        break;
      default:
        break;
    }
  }

  private dshUrl(): string {
    return vscode.workspace.getConfiguration("dsh").get<string>("url", "http://127.0.0.1:3080");
  }

  /** 当前工作区文件夹路径(会话下拉按目录过滤用);未打开文件夹时为 null。 */
  private workspaceFolder(): string | null {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  }

  /** 执行一条斜杠命令并给出结果提示;命令自身的结果文本(如 /rollback 回退摘要)透传到 notice。 */
  private async runCommandAndNotify(sessionId: string, line: string): Promise<{ outcome: "executed" | "unmatched" | "unavailable"; execution?: CommandExecutionView }> {
    const result = await this.hub.runCommandLine(sessionId, line);
    const outcome = result.outcome;
    const name = line.trim().split(/\s+/)[0] ?? line;
    if (outcome === "executed") {
      if (name === "/permission") {
        this.post({ kind: "notice", message: t("notice.permissionSet", { preset: line.trim().split(/\s+/)[1] ?? "" }), level: "info" });
      } else {
        const commandText = result.execution?.result?.text;
        const message = commandText ? `${t("notice.commandExecuted", { line })}\n${commandText}` : t("notice.commandExecuted", { line });
        this.post({ kind: "notice", message, level: result.execution?.result.kind === "error" ? "error" : "info" });
      }
    } else if (outcome === "unmatched") {
      this.post({ kind: "notice", message: t("notice.commandUnmatched", { line }), level: "error" });
    } else {
      if (name === "/permission") {
        // 权限切换不可用:带引导的操作提示(可跳转到"默认权限预设"设置)
        this.post({ kind: "permissionUnavailable", preset: line.trim().split(/\s+/)[1] ?? "" });
      } else {
        this.post({ kind: "notice", message: t("notice.commandUnavailable", { line }), level: "error" });
      }
    }
    return result;
  }

  /** 用户配置的语言偏好(auto / zh-cn / en …)。 */
  private languagePref(): string {
    return vscode.workspace.getConfiguration("dsh").get<string>("language", "auto");
  }

  /** 扫描目录开关(dsh.agentConfigDirs):默认全部勾选(全部扫描);配置未注册时回退扩展全局状态。 */
  private agentDirsConfig(): { claude: boolean; codex: boolean; githubCopilot: boolean } {
    const cfg = vscode.workspace.getConfiguration("dsh").get<{ claude?: boolean; codex?: boolean; githubCopilot?: boolean }>("agentConfigDirs", {});
    const fallback = this.ctx.globalState.get<{ claude?: boolean; codex?: boolean; githubCopilot?: boolean }>("dsh.agentConfigDirs");
    const pick = (v: boolean | undefined, f: boolean | undefined) => v ?? f ?? true;
    return {
      claude: pick(cfg?.claude, fallback?.claude),
      codex: pick(cfg?.codex, fallback?.codex),
      githubCopilot: pick(cfg?.githubCopilot, fallback?.githubCopilot),
    };
  }

  /** 按当前开关重新扫描智能体配置目录并推送前端。 */
  private async rescanAgentConfigs() {
    const empty = { claudeMd: false, commands: [], skills: [], codexConfig: false, codexSkills: [], copilotInstructions: null, copilotInstructionFiles: [], copilotAgents: [], copilotPrompts: [] };
    try {
      const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
      const value = folder ? await scanAgentConfigs(folder, this.agentDirsConfig()) : empty;
      this.post({ kind: "claudeConfig", value });
    } catch (error) {
      this.post({ kind: "claudeConfig", value: empty, error: String(error) });
    }
  }

  /** 把附件(文件内容 / 文件夹清单)拼进消息上下文。 */
  /** 展开消息中的 @智能体名 提及:匹配项目智能体(.dsh/agent + .github/agents),返回注入正文与清理后的消息。 */
  private async composeAgentMentions(text: string): Promise<{ agentParts: string; text: string } | undefined> {
    const tokens = [...text.matchAll(/@([A-Za-z0-9][\w.-]*)/g)].map((m) => m[1]);
    if (tokens.length === 0) return undefined;
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!folder) return undefined;
    let known: { name: string; content: string }[] = [];
    try {
      const cfg = await scanAgentConfigs(folder, this.agentDirsConfig());
      known = [
        ...cfg.dshAgents,
        ...cfg.copilotAgents.map((a) => ({ name: a.name, content: a.content })),
      ];
    } catch {
      known = [];
    }
    const parts: string[] = [];
    let cleaned = text;
    for (const name of tokens) {
      const agent = known.find((a) => a.name === name);
      if (!agent) continue;
      cleaned = cleaned.replace(new RegExp(`@${escapeRegExp(name)}`, "g"), "");
      parts.push(`**智能体 ${agent.name}**\n${agent.content}`);
    }
    if (parts.length === 0) return undefined;
    return { agentParts: parts.join("\n\n"), text: cleaned.trim() };
  }

  private async composeWithAttachments(text: string, attachments?: { kind: "file" | "folder"; path: string }[], agentParts?: string): Promise<string> {
    const list = (attachments ?? []).slice(0, 10);
    if (list.length === 0 && !agentParts) return text;
    const parts: string[] = [];
    if (agentParts) parts.push(agentParts);
    let total = 0;
    const MAX_TOTAL = 150_000;
    const MAX_FILE = 100_000;
    for (const a of list) {
      try {
        if (a.kind === "file") {
          const stat = await vscode.workspace.fs.stat(vscode.Uri.file(a.path));
          if (stat.size > 2 * 1024 * 1024) {
            parts.push(`**文件 ${a.path}**(超过 2MB,未读取内容)`);
            continue;
          }
          const raw = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(a.path))).toString("utf8");
          const content = raw.slice(0, MAX_FILE) + (raw.length > MAX_FILE ? `\n…(已截断,共 ${raw.length} 字符)` : "");
          parts.push(`**文件 ${a.path}**\n\`\`\`\n${content}\n\`\`\``);
        } else {
          const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(a.path));
          const lines = entries.slice(0, 200).map(([name, type]) => `- ${name}${type === vscode.FileType.Directory ? "/" : ""}`);
          parts.push(`**文件夹 ${a.path}**(顶层 ${entries.length} 项)\n${lines.join("\n")}`);
        }
      } catch (error) {
        parts.push(`**${a.path}**: 读取失败(${String(error)})`);
      }
      total = parts.reduce((n, p) => n + p.length, 0);
      if (total > MAX_TOTAL) break;
    }
    if (parts.length === 0) return text;
    return `【附加文件/文件夹】\n${parts.join("\n\n")}\n\n【用户消息】\n${text}`;
  }

  private post(message: unknown) {
    void this.sink.webview.postMessage(message);
  }

  private cssCache: string | undefined;

  /** 内联样式表:直接把 chat.css 嵌入 <style>,避免 link 加载失败导致"无样式"。 */
  private css(): string {
    if (this.cssCache === undefined) {
      try {
        this.cssCache = readFileSync(vscode.Uri.joinPath(this.ctx.extensionUri, "media", "chat.css").fsPath, "utf8");
      } catch {
        this.cssCache = "";
      }
    }
    return this.cssCache;
  }

  private html(webview: vscode.Webview): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, "dist", "webview", "ui.js"));
    const csp = [
      "default-src 'none'",
      "img-src ${webview.cspSource} data:",
      "style-src 'unsafe-inline'",
      `script-src 'nonce-${nonce}'`,
      "worker-src ${webview.cspSource}",
      "font-src ${webview.cspSource}",
    ].join("; ");
    const lang = effectiveLanguage();
    const htmlLang = lang === "zh-cn" ? "zh-CN" : lang === "zh-tw" ? "zh-TW" : lang;
    const htmlDir = lang === "ar" ? "rtl" : "ltr";
    return `<!DOCTYPE html>
<html lang="${htmlLang}" dir="${htmlDir}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
${this.css()}
  </style>
  <title>DSH Chat</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}

/** 是否为斜杠命令行(与宿主拦截规则一致:纯文本、以 /命令名 开头)。 */
function isCommandLine(text: string): boolean {
  return /^\/[a-zA-Z][\w-]*(\s.*)?$/.test(text.trim());
}

/** 是否为绝对路径(Windows 盘符 / UNC / POSIX 根)。 */
function isAbsolutePath(p: string): boolean {
  return isAbsolute(p) || /^[a-zA-Z]:[\\/]/.test(p);
}

/** 扫描工作区的智能体/技能配置:.claude(命令与技能)、.codex(技能与配置)、.github(Copilot 指令/智能体/提示词)、.dsh(自身约定:agent / skills / memory)。 */
async function scanAgentConfigs(
  folder: vscode.Uri,
  dirs: { claude: boolean; codex: boolean; githubCopilot: boolean },
): Promise<{
  claudeMd: boolean;
  commands: { name: string; content: string }[];
  skills: { name: string; content: string }[];
  codexConfig: boolean;
  codexSkills: { name: string; content: string }[];
  copilotInstructions: string | null;
  copilotInstructionFiles: { name: string; content: string }[];
  copilotAgents: { name: string; content: string }[];
  copilotPrompts: { name: string; content: string }[];
  dshSkills: { name: string; content: string }[];
  dshAgents: { name: string; description?: string; content: string; path: string }[];
  dshMemory: { name: string; content: string; path: string }[];
}> {
  const result = {
    claudeMd: false,
    commands: [] as { name: string; content: string }[],
    skills: [] as { name: string; content: string }[],
    codexConfig: false,
    codexSkills: [] as { name: string; content: string }[],
    copilotInstructions: null as string | null,
    copilotInstructionFiles: [] as { name: string; content: string }[],
    copilotAgents: [] as { name: string; content: string }[],
    copilotPrompts: [] as { name: string; content: string }[],
    dshSkills: [] as { name: string; content: string }[],
    dshAgents: [] as { name: string; description?: string; content: string; path: string }[],
    dshMemory: [] as { name: string; content: string; path: string }[],
  };
  const exists = async (uri: vscode.Uri) => {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  };
  const readText = async (uri: vscode.Uri, cap = 20_000): Promise<string> => {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > 2 * 1024 * 1024) return "";
      const raw = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
      return raw.slice(0, cap);
    } catch {
      return "";
    }
  };
  const scanSkillDirs = async (dir: vscode.Uri, cap = 8_000): Promise<{ name: string; content: string }[]> => {
    const out: { name: string; content: string }[] = [];
    if (!(await exists(dir))) return out;
    try {
      const entries = await vscode.workspace.fs.readDirectory(dir);
      for (const [name, type] of entries.slice(0, 20)) {
        if (type !== vscode.FileType.Directory) continue;
        const content = await readText(vscode.Uri.joinPath(dir, name, "SKILL.md"), cap);
        if (content) out.push({ name, content });
      }
    } catch {
      // 忽略
    }
    return out;
  };
  // 智能体定义扫描(.dsh/agent/*.md):按行业约定解析 front matter(name/description),正文供 @提及注入
  const scanAgentFiles = async (dir: vscode.Uri, cap = 20_000): Promise<{ name: string; description?: string; content: string; path: string }[]> => {
    const out: { name: string; description?: string; content: string; path: string }[] = [];
    if (!(await exists(dir))) return out;
    try {
      const entries = await vscode.workspace.fs.readDirectory(dir);
      for (const [fileName, type] of entries.slice(0, 30)) {
        if (type !== vscode.FileType.File || !fileName.endsWith(".md")) continue;
        const fileUri = vscode.Uri.joinPath(dir, fileName);
        const raw = await readText(fileUri, cap);
        if (!raw) continue;
        const parsed = parseAgentFrontMatter(raw, fileName.replace(/\.md$/, ""));
        out.push({ name: parsed.name, ...(parsed.description ? { description: parsed.description } : {}), content: parsed.body, path: fileUri.fsPath });
      }
    } catch {
      // 忽略
    }
    return out;
  };
  const scanMdFiles = async (dir: vscode.Uri, suffix = ".md", cap = 20_000): Promise<{ name: string; content: string; path: string }[]> => {
    const out: { name: string; content: string; path: string }[] = [];
    if (!(await exists(dir))) return out;
    try {
      const entries = await vscode.workspace.fs.readDirectory(dir);
      for (const [name, type] of entries.slice(0, 30)) {
        if (type !== vscode.FileType.File || !name.endsWith(suffix)) continue;
        const fileUri = vscode.Uri.joinPath(dir, name);
        const content = await readText(fileUri, cap);
        if (content) out.push({ name: name.replace(new RegExp(`${suffix.replace(".", "\\.")}$`), ""), content, path: fileUri.fsPath });
      }
    } catch {
      // 忽略
    }
    return out;
  };

  // CLAUDE.md / AGENTS.md(工作区根,DSH 核心自动加载;这里仅报告存在性)
  if (dirs.claude) {
    result.claudeMd = (await exists(vscode.Uri.joinPath(folder, "CLAUDE.md"))) || (await exists(vscode.Uri.joinPath(folder, "AGENTS.md")));
    // .claude/commands/*.md
    result.commands = await scanMdFiles(vscode.Uri.joinPath(folder, ".claude", "commands"));
    // .claude/skills/*/SKILL.md
    result.skills = await scanSkillDirs(vscode.Uri.joinPath(folder, ".claude", "skills"));
  }

  if (dirs.codex) {
    // .codex:config.toml 存在性 + skills
    result.codexConfig = await exists(vscode.Uri.joinPath(folder, ".codex", "config.toml"));
    result.codexSkills = await scanSkillDirs(vscode.Uri.joinPath(folder, ".codex", "skills"));
  }

  if (dirs.githubCopilot) {
    // .github(Copilot):copilot-instructions.md / instructions/*.md / agents/*.md / prompts/*.prompt.md
    const copilotInstructionsUri = vscode.Uri.joinPath(folder, ".github", "copilot-instructions.md");
    if (await exists(copilotInstructionsUri)) {
      const content = await readText(copilotInstructionsUri, 12_000);
      if (content) result.copilotInstructions = content;
    }
    result.copilotInstructionFiles = await scanMdFiles(vscode.Uri.joinPath(folder, ".github", "instructions"));
    result.copilotAgents = await scanMdFiles(vscode.Uri.joinPath(folder, ".github", "agents"));
    result.copilotPrompts = await scanMdFiles(vscode.Uri.joinPath(folder, ".github", "prompts"), ".prompt.md");
  }

  // .dsh 自身约定(始终扫描,与计划文件同级):项目级智能体 .dsh/agent/*.md、技能 .dsh/skills/*/SKILL.md、记忆 .dsh/memory/*.md
  result.dshSkills = await scanSkillDirs(vscode.Uri.joinPath(folder, ".dsh", "skills"));
  result.dshAgents = await scanAgentFiles(vscode.Uri.joinPath(folder, ".dsh", "agent"));
  result.dshMemory = await scanMdFiles(vscode.Uri.joinPath(folder, ".dsh", "memory"));

  return result;
}
