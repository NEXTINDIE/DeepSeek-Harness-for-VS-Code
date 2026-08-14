import * as vscode from "vscode";
import { createTranslator, effectiveLanguage } from "../dsh/i18n";
import { readFileSync } from "node:fs";
import type { DshHub } from "../dsh/hub";
import { folderCwd } from "../dsh/participantSessions";
import type { PendingApproval, PendingQuestion, StoredEvent, StoredSession, SessionStore } from "../dsh/sessionStore";
import type { QueueItem } from "../dsh/types";

/** 宿主侧文案翻译(跟随 dsh.language 设置,配置变更即时生效)。 */
const t = createTranslator();

/** 流式专用事件:只在实时流中有意义,历史回放时过滤(一个长会话可能有十余万条 chunk,渲染会卡死)。 */
const STREAM_ONLY_EVENTS = new Set(["assistant/chunk", "llm/retry", "llm/retry-started"]);

/** 历史回放用事件(剔除流式分片)。 */
function historyEvents(store: SessionStore, sessionId: string): StoredEvent[] {
  return store.eventsFor(sessionId).filter((e) => !STREAM_ONLY_EVENTS.has(e.event.type));
}

/**
 * 聊天面板宿主抽象:同一个 ChatChannel 可挂在侧边栏 WebviewView 或编辑器区 WebviewPanel 上。
 */
export interface ChatSink {
  webview: vscode.Webview;
  onDidDispose: vscode.Event<void>;
  dispose(): void;
}

/** ChatChannel 构造选项:锁定会话(编辑器标签页模式)与列表模式(侧边栏会话列表)。 */
export interface ChatChannelOptions {
  /** 锁定会话:该通道只服务于指定会话,忽略会话切换(编辑器标签页模式,一个对话一个标签)。 */
  lockSession?: string;
  /** 列表模式:仅渲染会话列表;点击会话经 onOpenTab 在编辑器标签页打开。 */
  mode?: "chat" | "list";
  /** 列表模式下"打开会话"回调(宿主打开对应会话的编辑器标签页)。 */
  onOpenTab?: (sessionId: string) => void;
  /** 列表/锁定模式下"新建会话"回调(宿主创建会话并打开新标签页)。 */
  onNewTab?: () => void;
}

/**
 * 聊天通道:会话存储的增量同步 + webview 消息处理 + HTML/CSP 装配。
 * 侧边栏视图(列表模式)与编辑器区标签页(锁定会话模式)共用这一份逻辑。
 */
export class ChatChannel {
  private disposables: vscode.Disposable[] = [];
  private readonly mode: "chat" | "list";
  private readonly lockSession: string | undefined;
  private readonly onOpenTab: ((sessionId: string) => void) | undefined;
  private readonly onNewTab: (() => void) | undefined;

  constructor(
    private readonly hub: DshHub,
    private readonly ctx: vscode.ExtensionContext,
    private readonly sink: ChatSink,
    options: ChatChannelOptions = {},
  ) {
    this.mode = options.mode ?? "chat";
    this.lockSession = options.lockSession;
    this.onOpenTab = options.onOpenTab;
    this.onNewTab = options.onNewTab;
    sink.webview.options = {
      ...sink.webview.options,
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.ctx.extensionUri, "dist"),
        vscode.Uri.joinPath(this.ctx.extensionUri, "media"),
      ],
    };
    sink.webview.html = this.html(sink.webview);
    sink.webview.onDidReceiveMessage(
      (msg) => {
        void this.onMessage(msg).catch((error) => {
          // 统一兜底:个别 case 内部未 try 的异步错误不再成为 unhandled rejection
          console.error("[dsh] webview message failed:", msg?.kind, error);
        });
      },
      undefined,
      this.disposables,
    );
    this.disposables.push(
      sink.onDidDispose(() => {
        this.stopStatsPoll();
        for (const d of this.disposables) d.dispose();
        this.disposables = [];
      }),
    );

    const store = this.hub.store;
    const activeEditorSub = vscode.window.onDidChangeActiveTextEditor(() => this.postActiveFile());
    const configSub = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("dsh.language")) {
        this.post({ kind: "lang", lang: effectiveLanguage() });
      }
    });
    this.disposables.push(
      // 激活文件推送:编辑器切换或视图创建时告知前端(默认附加)
      { dispose: () => activeEditorSub.dispose() },
      // 语言设置变更:通知前端重载界面
      { dispose: () => configSub.dispose() },
      {
        dispose: store.on("sessionsChanged", () => {
          this.post({ kind: "sessions", sessions: this.serializeSessions() });
          if (this.mode === "list") void this.pushWorkspaces();
        }),
      },
      {
        dispose: store.on("sessionEvent", (sid: string, stored: StoredEvent) => {
          if (sid === this.session()) {
            this.post({ kind: "delta", sessionId: sid, events: [this.serializeEvent(stored)] });
          }
        }),
      },
      {
        dispose: store.on("running", (sid: string, running: boolean) => {
          if (sid !== this.session()) {
            // 其它会话停止时,若轮询正在服务当前会话,一并停止(切换会话后不留定时器)
            if (!running) this.stopStatsPoll();
            return;
          }
          this.post({ kind: "running", sessionId: sid, running });
          if (this.mode === "chat") {
            if (running) this.startStatsPoll();
            else this.stopStatsPoll();
          }
        }),
      },
      {
        dispose: store.on("agentError", (sid: string, message: string) => {
          if (sid !== this.session()) return;
          // agent 出错:running 状态已由 store 同步为 false,这里补一条错误提示
          this.post({ kind: "notice", message: t("msg.agentError", { message }), level: "error" });
        }),
      },
      {
        dispose: store.on("approval", (approval: PendingApproval) => {
          if (approval.sessionId === this.session()) this.post({ kind: "approval", ...approval });
        }),
      },
      { dispose: store.on("approvalResolved", (approvalId: string) => this.post({ kind: "approvalResolved", approvalId })) },
      {
        dispose: store.on("question", (question: PendingQuestion) => {
          if (question.sessionId === this.session()) this.post({ kind: "question", ...question });
        }),
      },
      { dispose: store.on("questionResolved", (frameRpcId: string) => this.post({ kind: "questionResolved", frameRpcId })) },
      {
        dispose: store.on("goal", (sid: string, value: unknown) => {
          if (sid === this.session()) this.post({ kind: "goal", sessionId: sid, value });
        }),
      },
      {
        dispose: store.on("context", (sid: string, value: unknown) => {
          if (sid === this.session()) this.post({ kind: "context", sessionId: sid, value });
        }),
      },
      {
        dispose: store.on("permissions", (sid: string, value: unknown) => {
          if (sid === this.session()) this.post({ kind: "permissions", sessionId: sid, value });
        }),
      },
      {
        dispose: store.on("stats", (sid: string, value: unknown) => {
          if (sid === this.session()) this.post({ kind: "stats", sessionId: sid, value });
        }),
      },
      {
        dispose: store.on("todos", (sid: string, value: unknown) => {
          if (sid === this.session()) this.post({ kind: "todos", sessionId: sid, value });
        }),
      },
      {
        dispose: store.on("queue", (sid: string, items: QueueItem[]) => {
          if (sid === this.session()) this.post({ kind: "queue", sessionId: sid, items });
        }),
      },
      {
        dispose: store.on("currentChanged", () => {
          this.syncStatsPoll();
          void this.pushFullState();
        }),
      },
      { dispose: this.hub.onStatus((status) => this.post({ kind: "status", status })) },
    );

    void this.ensureAndPush();
    this.postActiveFile();
  }

  /** 本通道服务的会话:锁定模式固定为锁定会话(编辑器标签页),否则跟随全局当前会话。 */
  private session(): string | undefined {
    return this.lockSession ?? this.hub.store.currentSessionId;
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
    const current = this.session();
    if (current) {
      void this.hub.updateCurrentModel(current);
      // 回填历史(幂等):锁定标签页打开旧会话时本地可能为空,否则界面空白且无加载入口
      await this.hub.ensureHistory(current);
    }
    if (this.mode === "list") await this.pushWorkspaces();
    // 推送前强制刷新一次投影,保证统计/上下文等数据最新
    await this.hub.refreshSessions();
    await this.pushFullState();
    // 轮询对账:标签页打开时目标会话可能已在运行(running 事件已错过),按当前态补启
    this.syncStatsPoll();
  }

  /** 按当前会话运行态对账轮询(解决"运行中打开标签不轮询/切会话后定时器不停止")。 */
  private syncStatsPoll() {
    if (this.mode !== "chat") {
      this.stopStatsPoll();
      return;
    }
    const current = this.session();
    const running = current ? (this.hub.store.sessions.get(current)?.running ?? false) : false;
    if (running) this.startStatsPoll();
    else this.stopStatsPoll();
  }

  /** 统计轮询:会话运行期间每 5 秒刷新 session.list 投影,统计行实时更新(与 Web 端一致)。 */
  private statsTimer: ReturnType<typeof setInterval> | undefined;
  private startStatsPoll() {
    if (this.statsTimer !== undefined) return;
    this.statsTimer = setInterval(() => {
      void this.hub.refreshSessions().catch(() => undefined);
    }, 5000);
  }
  private stopStatsPoll() {
    if (this.statsTimer !== undefined) {
      clearInterval(this.statsTimer);
      this.statsTimer = undefined;
    }
  }

  /** 列表模式:推送工作区信息(侧边栏按工作区分组会话)。 */
  private async pushWorkspaces() {
    try {
      const { items } = await this.hub.listWorkspaces();
      this.post({ kind: "workspaces", workspaces: items });
    } catch {
      // 忽略:列表仍可按未分组展示
    }
  }

  private serializeSessions(): StoredSession[] {
    return this.hub.store.listSessions();
  }

  private serializeEvent(stored: StoredEvent): { event: unknown; view?: unknown } {
    return { event: stored.event, ...(stored.view ? { view: stored.view } : {}) };
  }

  private async pushFullState() {
    const store = this.hub.store;
    const current = this.session();
    this.post({
      kind: "init",
      mode: this.mode,
      locked: this.lockSession !== undefined,
      lang: effectiveLanguage(),
      status: this.hub.status,
      sessions: this.serializeSessions(),
      current,
      events: current ? historyEvents(store, current).map((e) => this.serializeEvent(e)) : [],
      approvals: current ? [...store.pendingApprovals.values()].filter((a) => a.sessionId === current) : [],
      questions: current ? [...store.pendingQuestions.values()].filter((q) => q.sessionId === current) : [],
      running: current ? (store.sessions.get(current)?.running ?? false) : false,
      goal: current ? store.goals.get(current) : undefined,
      context: current ? store.context.get(current) : undefined,
      permissions: current ? store.permissions.get(current) : undefined,
      stats: current ? store.stats.get(current) : undefined,
      todos: current ? store.todos.get(current) : undefined,
      queue: current ? (store.queues.get(current) ?? []) : [],
      hasMore: current ? (store.historyHasMore.get(current) ?? false) : false,
    });
  }

  private async onMessage(msg: { kind: string; [key: string]: any }) {
    const store = this.hub.store;
    const current = this.session();
    switch (msg.kind) {
      case "ready":
        await this.ensureAndPush();
        break;
      case "openTab":
        // 侧边栏列表模式:点击会话 → 在编辑器标签页打开
        if (this.mode === "list" && typeof msg.sessionId === "string") this.onOpenTab?.(msg.sessionId);
        break;
      case "newTab":
        // 侧边栏列表模式:新建对话 → 创建会话并打开新标签页
        if (this.mode === "list") this.onNewTab?.();
        break;
      case "send": {
        if (current && typeof msg.text === "string" && msg.text.trim()) {
          try {
            const text = await this.composeWithAttachments(msg.text, msg.attachments);
            await this.hub.send(current, text, msg.mode === "steer" ? "steer" : "queue");
            // 发送后立即刷新投影,统计行不会被回合开始时的空帧清空
            void this.hub.refreshSessions();
          } catch {
            // 错误已通过 notice 提示
          }
        }
        break;
      }
      case "queueAction": {
        // 排队消息操作:插话发送(steer)/ 移除(remove) / 编辑(edit)
        if (current && typeof msg.itemId === "string") {
          const action =
            msg.action === "remove"
              ? { kind: "remove" as const }
              : msg.action === "edit"
                ? { kind: "edit" as const, content: msg.content ?? [] }
                : { kind: "steer" as const };
          try {
            await this.hub.client.updateQueue(current, msg.itemId, action);
            // 队列状态经 mux 帧自动同步;顺手刷新投影保持统计行准确
            void this.hub.refreshSessions();
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.queueActionFailed", { error: String(error) }), level: "error" });
          }
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
            openLabel: mode === "folder" ? t("添加文件夹") : mode === "file" ? t("添加文件") : t("添加到对话"),
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
        const empty = { claudeMd: false, commands: [], skills: [], codexConfig: false, codexSkills: [], copilotInstructions: null, copilotInstructionFiles: [], copilotAgents: [], copilotPrompts: [] };
        try {
          const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
          const value = folder ? await scanAgentConfigs(folder) : empty;
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
        // 锁定会话的标签页忽略会话切换(标签即会话)
        if (this.lockSession) break;
        if (typeof msg.sessionId === "string") {
          await this.hub.openSession(msg.sessionId);
          await this.hub.refreshSessions();
          void this.hub.updateCurrentModel(msg.sessionId);
          await this.pushFullState();
        }
        break;
      case "new": {
        // 锁定/列表模式:交给宿主新建标签页
        if (this.lockSession || this.mode === "list") {
          this.onNewTab?.();
          break;
        }
        const cwd = folderCwd();
        try {
          const sessionId = await this.hub.createSessionForFolder(cwd);
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
            const remaining = this.hub.store.listSessions();
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
      case "feedback": {
        // 官方 /feedback 命令记录会话反馈;附带被评价消息的片段
        if (current && (msg.rating === "positive" || msg.rating === "negative")) {
          const snippet = typeof msg.snippet === "string" ? msg.snippet.slice(0, 200) : "";
          const label = msg.rating === "positive" ? "positive" : "negative";
          try {
            await this.hub.send(current, `/feedback ${label}${snippet ? `: ${snippet}` : ""}`);
          } catch {
            // 错误已通过 notice 提示
          }
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
        // 预设命令(计划模式等):宿主直接执行(与 Web 端同通道),不经 agent
        if (current && typeof msg.line === "string" && msg.line.trim()) {
          try {
            await this.hub.runCommand(current, msg.line.trim());
            void this.hub.refreshSessions();
          } catch {
            // 错误已通过 notice 提示
          }
        }
        break;
      }
      case "permission": {
        if (current && typeof msg.preset === "string") {
          try {
            // 宿主直接执行 /permission(与 Web 端同通道):运行中切换也立即生效,无需审批,投影即时更新
            await this.hub.runCommand(current, `/permission ${msg.preset}`);
            void this.hub.refreshSessions();
            this.post({ kind: "notice", message: t("notice.permissionSet", { preset: msg.preset }), level: "info" });
          } catch {
            // 错误已通过 notice 提示
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
        if (typeof msg.path === "string" && msg.path) {
          try {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(msg.path));
            await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: false });
          } catch (error) {
            this.post({ kind: "notice", message: t("notice.openFileFailed", { error: String(error) }), level: "error" });
          }
        }
        break;
      }
      case "loadMore":
        if (current) {
          const { hasMore } = await this.hub.loadMoreHistory(current);
          this.post({
            kind: "historyMore",
            sessionId: current,
            events: historyEvents(store, current).map((e) => this.serializeEvent(e)),
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
      case "startServer":
        this.post({ kind: "status", status: { ...this.hub.status, serverStarting: true } });
        const result = await this.hub.ensureReady();
        if (!result.ok) {
          this.post({ kind: "notice", message: result.message ?? t("启动失败"), level: "error" });
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

  /** 把附件(文件内容 / 文件夹清单)拼进消息上下文。 */
  private async composeWithAttachments(text: string, attachments?: { kind: "file" | "folder"; path: string }[]): Promise<string> {    const list = (attachments ?? []).slice(0, 10);
    if (list.length === 0) return text;
    const parts: string[] = [];
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
      `img-src ${webview.cspSource} data:`,
      "style-src 'unsafe-inline'",
      `script-src 'nonce-${nonce}'`,
      `worker-src ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
    ].join("; ");
    return `<!DOCTYPE html>
<html lang="zh-CN">
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

/** 扫描工作区的智能体/技能配置:.claude(命令与技能)、.codex(技能与配置)、.github(Copilot 指令/智能体/提示词)。 */
async function scanAgentConfigs(folder: vscode.Uri): Promise<{
  claudeMd: boolean;
  commands: { name: string; content: string }[];
  skills: { name: string; content: string }[];
  codexConfig: boolean;
  codexSkills: { name: string; content: string }[];
  copilotInstructions: string | null;
  copilotInstructionFiles: { name: string; content: string }[];
  copilotAgents: { name: string; content: string }[];
  copilotPrompts: { name: string; content: string }[];
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
  const scanMdFiles = async (dir: vscode.Uri, suffix = ".md", cap = 20_000): Promise<{ name: string; content: string }[]> => {
    const out: { name: string; content: string }[] = [];
    if (!(await exists(dir))) return out;
    try {
      const entries = await vscode.workspace.fs.readDirectory(dir);
      for (const [name, type] of entries.slice(0, 30)) {
        if (type !== vscode.FileType.File || !name.endsWith(suffix)) continue;
        const content = await readText(vscode.Uri.joinPath(dir, name), cap);
        if (content) out.push({ name: name.replace(new RegExp(`${suffix.replace(".", "\\.")}$`), ""), content });
      }
    } catch {
      // 忽略
    }
    return out;
  };

  // CLAUDE.md / AGENTS.md(工作区根,DSH 核心自动加载;这里仅报告存在性)
  result.claudeMd = (await exists(vscode.Uri.joinPath(folder, "CLAUDE.md"))) || (await exists(vscode.Uri.joinPath(folder, "AGENTS.md")));

  // .claude/commands/*.md
  result.commands = await scanMdFiles(vscode.Uri.joinPath(folder, ".claude", "commands"));
  // .claude/skills/*/SKILL.md
  result.skills = await scanSkillDirs(vscode.Uri.joinPath(folder, ".claude", "skills"));

  // .codex:config.toml 存在性 + skills
  result.codexConfig = await exists(vscode.Uri.joinPath(folder, ".codex", "config.toml"));
  result.codexSkills = await scanSkillDirs(vscode.Uri.joinPath(folder, ".codex", "skills"));

  // .github(Copilot):copilot-instructions.md / instructions/*.md / agents/*.md / prompts/*.prompt.md
  const copilotInstructionsUri = vscode.Uri.joinPath(folder, ".github", "copilot-instructions.md");
  if (await exists(copilotInstructionsUri)) {
    const content = await readText(copilotInstructionsUri, 12_000);
    if (content) result.copilotInstructions = content;
  }
  result.copilotInstructionFiles = await scanMdFiles(vscode.Uri.joinPath(folder, ".github", "instructions"));
  result.copilotAgents = await scanMdFiles(vscode.Uri.joinPath(folder, ".github", "agents"));
  result.copilotPrompts = await scanMdFiles(vscode.Uri.joinPath(folder, ".github", "prompts"), ".prompt.md");

  return result;
}
