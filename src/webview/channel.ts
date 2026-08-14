import * as vscode from "vscode";
import { createTranslator, effectiveLanguage } from "../dsh/i18n";
import { readFileSync } from "node:fs";
import type { DshHub } from "../dsh/hub";
import { folderCwd } from "../dsh/participantSessions";
import type { PendingApproval, PendingQuestion, StoredEvent, StoredSession } from "../dsh/sessionStore";
import type { PromptContentPart } from "../dsh/types";

/** 宿主侧文案翻译(跟随 dsh.language 设置,配置变更即时生效)。 */
const t = createTranslator();

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

  constructor(
    private readonly hub: DshHub,
    private readonly ctx: vscode.ExtensionContext,
    private readonly sink: ChatSink,
  ) {
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
    });
    this.disposables.push(
      // 激活文件推送:编辑器切换或视图创建时告知前端(默认附加)
      { dispose: () => activeEditorSub.dispose() },
      // 语言设置变更:通知前端重载界面
      { dispose: () => configSub.dispose() },
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
    );

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

  private serializeSessions(): StoredSession[] {
    return this.hub.store.listSessions().map((s) => {
      const pending = this.hub.store.pendingFor(s.sessionId);
      return { ...s, ...(pending ? { pending } : {}) };
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

  private async pushFullState() {
    const store = this.hub.store;
    const current = store.currentSessionId;
    this.post({
      kind: "init",
      lang: effectiveLanguage(),
      languagePref: this.languagePref(),
      status: this.hub.status,
      sessions: this.serializeSessions(),
      ...this.serializeWorkspaces(),
      current,
      events: current ? store.eventsFor(current).map((e) => this.serializeEvent(e)) : [],
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
            const images: { data: string; mediaType: string; name?: string }[] = Array.isArray(msg.images) ? msg.images.slice(0, 8) : [];
            if (images.length > 0) {
              // 带图片的消息:直接以内容块发送(官方 session.prompt image 通道)
              const content: PromptContentPart[] = images.map((img) => ({
                type: "image",
                mediaType: typeof img.mediaType === "string" ? img.mediaType : "image/png",
                data: img.data,
                ...(img.name ? { name: img.name } : {}),
              }));
              const text = await this.composeWithAttachments(msg.text, msg.attachments);
              content.push({ type: "text", text });
              await this.hub.sendParts(current, content);
            } else {
              const text = await this.composeWithAttachments(msg.text, msg.attachments);
              await this.hub.send(current, text);
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
        if (typeof msg.sessionId === "string") {
          await this.hub.openSession(msg.sessionId);
          void this.hub.updateCurrentModel(msg.sessionId);
          await this.pushFullState();
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
        // 预设命令(计划模式等):直接作为斜杠命令发送
        if (current && typeof msg.line === "string" && msg.line.trim()) {
          try {
            await this.hub.send(current, msg.line.trim());
          } catch {
            // 错误已通过 notice 提示
          }
        }
        break;
      }
      case "permission": {
        if (current && typeof msg.preset === "string") {
          try {
            await this.hub.send(current, `/permission ${msg.preset}`);
            this.post({ kind: "notice", message: t("notice.permissionSet", { preset: msg.preset }), level: "info" });
          } catch {
            // 错误已通过 notice 提示
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
            events: store.eventsFor(current).map((e) => this.serializeEvent(e)),
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
        if (typeof msg.language === "string" && ["auto", "zh-cn", "en"].includes(msg.language)) {
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

  /** 用户配置的语言偏好(auto / zh-cn / en)。 */
  private languagePref(): string {
    return vscode.workspace.getConfiguration("dsh").get<string>("language", "auto");
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
      "img-src ${webview.cspSource} data:",
      "style-src 'unsafe-inline'",
      `script-src 'nonce-${nonce}'`,
      "worker-src ${webview.cspSource}",
      "font-src ${webview.cspSource}",
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
