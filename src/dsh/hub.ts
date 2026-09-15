import { DshApiClient, DshApiError, DshAuthError, type RemoteStreamHandle } from "./apiClient";
import { ServerManager } from "./serverManager";
import { SessionStore, type StoredSession } from "./sessionStore";
import type { CommandExecutionView, PromptContentPart, SessionFollowFrame } from "./types";
import type {
  CordisPluginRow,
  CordisRequestRun,
  CordisRequestRunResolved,
  CordisRunHostHalfResult,
  CordisRunResolution,
  CordisStopResult,
  CordisUndefineResult,
} from "./cordisTypes";

export interface HubStatus {
  serverUp: boolean;
  serverStartedByUs: boolean;
  serverStarting: boolean;
  muxConnected: boolean;
  hostConnected: boolean;
  version?: string;
  provider?: string;
  model?: string;
  message?: string;
}

export interface HubDeps {
  url: string;
  command: string;
  autoStart: boolean;
  autoStartTimeoutSec: number;
  /** 新建会话时自动应用的推理强度(思考深度);留空使用模型默认。 */
  defaultReasoningEffort?: string;
  onStatus?: (status: HubStatus) => void;
  onNotice?: (message: string, kind: "info" | "warning" | "error") => void;
  /** 诊断日志(启动器解析 / 服务器进程状态),由宿主输出到日志通道。 */
  onLog?: (message: string) => void;
  /** 翻译函数(vscode.l10n.t);hub 保持对 vscode 无依赖。 */
  t?: (key: string, args?: Record<string, string | number>) => string;
}

const HISTORY_PAGE_MESSAGES = 60;

/** 中枢:服务器 + API 客户端 + 会话存储的统一入口(0.1.5-rc.1 线协议,兼容 0.1.2 参数名)。 */
export class DshHub {
  readonly store = new SessionStore();
  readonly client: DshApiClient;
  readonly server: ServerManager;

  private statusState: HubStatus = {
    serverUp: false,
    serverStartedByUs: false,
    serverStarting: false,
    muxConnected: false,
    hostConnected: false,
  };

  private readyPromise: Promise<{ ok: boolean; message?: string }> | undefined;
  private statusListeners = new Set<(status: HubStatus) => void>();

  /** 当前跟随的会话(session/follow 流只能按地址打开)。 */
  private followedSession: string | undefined;
  private followHandle: RemoteStreamHandle | undefined;
  /** session/follow 打开帧的 cursor(分页用)。 */
  private followCursor = new Map<string, number>();
  private followSource = new Map<string, ("session" | "subagent")>();
  /** 生命周期流(control / workspace)句柄,每次连接重建。 */
  private controlHandle: RemoteStreamHandle | undefined;
  private workspaceHandle: RemoteStreamHandle | undefined;
  private connectionGeneration = 0;

  constructor(private readonly deps: HubDeps) {
    this.client = new DshApiClient(deps.url);
    this.server = new ServerManager(
      { url: deps.url, command: deps.command, autoStart: deps.autoStart, timeoutSec: deps.autoStartTimeoutSec, t: deps.t, onLog: deps.onLog },
      (s) => {
        this.statusState.serverUp = s.up;
        this.statusState.serverStartedByUs = s.startedByUs;
        this.statusState.serverStarting = s.starting;
        this.statusState.message = s.message;
        this.emitStatus();
      },
    );
    this.client.setStreamState((state) => {
      this.statusState.muxConnected = state === "connected";
      if (state === "connected") {
        // 每次连接建立后重建生命周期流(流随 socket 关闭而失效)
        this.rebuildLiveStreams();
      }
      this.emitStatus();
    });
    this.client.setEventsHandlers({
      onReady: () => {
        // $events 打开帧:主机信息(session.list 探测所需)
        this.emitStatus();
      },
      onEmit: (event, args) => {
        if (event.startsWith("api-session/")) {
          this.store.handleApiSessionEvent(event, args);
          return;
        }
        if (event === "commands/change") {
          this.clearCommandCache();
          return;
        }
        if (event === "agent-preset/selected" || event === "llm/adapters-updated") {
          void this.refreshSessions();
          return;
        }
        // 其余 emit(cordis/* 等)交给存储层转发
        this.store.handleRemoteEvent(event, args);
      },
      onWaterfall: (frame) => this.store.handleWaterfall(frame),
      onCancel: (eventId) => this.store.handleWaterfallCancel(eventId),
    });
  }

  get status(): HubStatus {
    return { ...this.statusState };
  }

  onStatus(listener: (status: HubStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  private emitStatus() {
    this.deps.onStatus?.({ ...this.statusState });
    for (const listener of this.statusListeners) {
      try {
        listener({ ...this.statusState });
      } catch (error) {
        console.error("[dsh] status listener threw:", error);
      }
    }
  }

  /** 在每次 remote.mux 连接建立后重建控制流与工作区流。 */
  private rebuildLiveStreams() {
    const generation = ++this.connectionGeneration;
    this.controlHandle?.cancel();
    this.workspaceHandle?.cancel();
    this.controlHandle = this.client.openStream("session/control", {}, {
      onItem: (value) => {
        if (generation !== this.connectionGeneration) return;
        this.store.handleControlFrame(value as Parameters<SessionStore["handleControlFrame"]>[0]);
      },
      onError: () => undefined, // socket 级失败由 client 重连后重建
    });
    this.workspaceHandle = this.client.openStream("workspace/follow", {}, {
      onItem: (value) => {
        if (generation !== this.connectionGeneration) return;
        this.store.handleWorkspaceFrame(value as Parameters<SessionStore["handleWorkspaceFrame"]>[0]);
      },
      onError: () => undefined,
    });
  }

  /** 确保服务器 + 客户端 + 初始数据就绪(可并发调用,共享同一 Promise)。 */
  ensureReady(): Promise<{ ok: boolean; message?: string }> {
    if (!this.readyPromise) {
      this.readyPromise = this.doEnsureReady().finally(() => {
        this.readyPromise = undefined;
      });
    }
    return this.readyPromise;
  }

  /** 仅探测(不自动启动):服务器在线时刷新会话;不主动选中会话,由用户从下拉框选择。 */
  async probe(): Promise<boolean> {
    let describe;
    try {
      describe = await this.client.ping();
    } catch (error) {
      if (error instanceof DshAuthError || this.isLegacyError(error)) {
        // 服务器在,但未授权(外部启动)或仍是旧版服务器:明确提示
        this.statusState.serverUp = true;
        this.statusState.message = this.errorMessage(error);
        this.emitStatus();
        return false;
      }
      this.statusState.serverUp = false;
      this.emitStatus();
      return false;
    }
    if (describe === undefined) {
      this.statusState.serverUp = false;
      this.emitStatus();
      return false;
    }
    this.statusState.serverUp = true;
    this.statusState.version = describe.version;
    this.client.setServerVersion(describe.version);
    this.emitStatus();
    // 服务器已在线:启动 remote.mux 流(events/control/workspace;旧版服务器无 token 时握手以 401 重试)
    this.client.startStreams();
    await this.refreshSessions();
    return true;
  }

  private async doEnsureReady(): Promise<{ ok: boolean; message?: string }> {
    const ensured = await this.server.ensure();
    if (!ensured.up) {
      this.deps.onNotice?.(ensured.message ?? this.deps.t?.("hub.serverUnavailable") ?? "DSH server unavailable", "error");
      return { ok: false, message: ensured.message };
    }
    this.syncLaunchTokenFromServer();
    let describe;
    try {
      describe = await this.client.ping();
    } catch (error) {
      if (error instanceof DshAuthError && this.server.refreshLaunchToken()) {
        // 服务器由上一个扩展实例(或终端)启动:从常见日志补取授权 token 后再试一次
        this.syncLaunchTokenFromServer();
        try {
          describe = await this.client.ping();
        } catch (retryError) {
          const msg = this.errorMessage(retryError);
          this.deps.onNotice?.(msg, "error");
          return { ok: false, message: msg };
        }
      } else {
        const msg = this.errorMessage(error);
        this.deps.onNotice?.(msg, "error");
        return { ok: false, message: msg };
      }
    }
    if (describe === undefined) {
      const msg = this.deps.t?.("hub.serverNoResponse", { url: this.deps.url }) ?? `DSH server at ${this.deps.url} is not responding`;
      this.deps.onNotice?.(msg, "error");
      return { ok: false, message: msg };
    }
    this.statusState.version = describe.version;
    this.client.setServerVersion(describe.version);
    this.emitStatus();
    // 启动流(remote.mux:$events + control + workspace)
    this.client.startStreams();
    await this.refreshSessions();
    return { ok: true };
  }

  /** 把服务器管理器已解析的授权 token 同步给 API 客户端。 */
  private syncLaunchTokenFromServer() {
    const token = this.server.launchToken;
    if (token) this.client.setLaunchToken(token);
  }

  /** Build the browser URL with the launch token required by authenticated servers. */
  browserUrl(baseUrl: string): string {
    this.server.refreshLaunchToken();
    const token = this.server.launchToken;
    if (!token) return baseUrl;
    const url = new URL(baseUrl);
    url.searchParams.set("token", token);
    return url.toString();
  }

  /** 旧版服务器(0.1.1-及更早)探测结果。 */
  private isLegacyError(error: unknown): boolean {
    return error instanceof DshApiError && error.code === "server-old-version";
  }

  /** 把 ping 失败转换为面向用户的提示文案。 */
  private errorMessage(error: unknown): string {
    if (error instanceof DshApiError && error.code === "server-old-version") return error.message;
    if (error instanceof DshAuthError) return error.message;
    return this.deps.t?.("hub.serverNoResponse", { url: this.deps.url }) ?? `DSH server at ${this.deps.url} is not responding`;
  }

  /** 刷新会话列表(合并 host 帧之外的信息:标题、running、更新顺序)。 */
  async refreshSessions() {
    try {
      const sessionList = await this.client.listSessions();
      let changed = false;
      for (const item of sessionList.items) {
        const existing = this.store.sessions.get(item.sessionId);
        const values = item.projections?.values ?? {};
        const next: StoredSession = {
          sessionId: item.sessionId,
          title: typeof values.title === "string" ? values.title : existing?.title,
          running: item.running,
          blank: item.blank,
          cwd: item.cwd ?? existing?.cwd,
          agentPreset: typeof values.agentPreset === "string" ? values.agentPreset : existing?.agentPreset,
          parentSessionId: item.parentSessionId,
          origin: item.origin,
          updatedAt: item.updatedAt,
        };
        const prev = this.store.sessions.get(item.sessionId);
        if (!prev || prev.title !== next.title || prev.running !== next.running || prev.updatedAt !== next.updatedAt) {
          this.store.sessions.set(item.sessionId, next);
          changed = true;
        }
        if (values.goal !== undefined) this.store.applyGoal(item.sessionId, values.goal);
        if (values.contextPressure !== undefined) {
          this.store.context.set(item.sessionId, values.contextPressure as { pressureTokens?: number; projectedTokens?: number; contextWindow?: number });
        }
        if (values.contextBreakdown !== undefined) {
          const raw = values.contextBreakdown as { systemTokens?: number; toolsTokens?: number; messageTokens?: number };
          this.store.breakdown.set(item.sessionId, {
            systemTokens: raw.systemTokens ?? 0,
            toolsTokens: raw.toolsTokens ?? 0,
            messageTokens: raw.messageTokens ?? 0,
          });
        }
        if (values.permissions !== undefined) {
          this.store.permissions.set(item.sessionId, values.permissions as { options: { value: string; name: string }[]; currentValue: string });
        }
        if (values.todos !== undefined) {
          this.store.todos.set(item.sessionId, values.todos as { content: string; status: "pending" | "in_progress" | "completed" }[] | null);
        }
        if (values.sessionStats !== undefined || values.tokenUsage !== undefined) {
          const current = this.store.stats.get(item.sessionId) ?? {};
          if (values.sessionStats !== undefined) current.sessionStats = values.sessionStats;
          if (values.tokenUsage !== undefined) current.tokenUsage = values.tokenUsage;
          this.store.stats.set(item.sessionId, current);
        }
      }
      if (changed) {
        this.store.notifySessionsChanged();
      }
      return sessionList.items;
    } catch (error) {
      console.error("[dsh] refreshSessions failed:", error);
      return [];
    }
  }

  /** 打开会话:切换到该会话并从 session/follow 回填(分叉会话必拉快照以还原边界)。 */
  async openSession(sessionId: string) {
    this.store.selectSession(sessionId);
    await this.startFollow(sessionId);
  }

  /**
   * 额外订阅一个会话的事件流,不改动当前 UI 跟随(remote.mux 支持多路逻辑流)。
   * 0.1.2 起会话事件按地址分路(session/follow),一次性/后台会话(如提交信息生成的
   * 归档会话)若不单独 follow 就收不到 turnEnd 等事件,等待方会一直超时。返回关闭句柄。
   */
  watchSession(sessionId: string): RemoteStreamHandle {
    return this.client.openStream("session/follow", { request: { address: { kind: "session", sessionId }, maxMessages: HISTORY_PAGE_MESSAGES, assistantStream: true } }, {
      onItem: (value) => {
        const frame = value as SessionFollowFrame;
        if (frame.type === "snapshot") {
          this.followCursor.set(sessionId, frame.cursor);
          this.followSource.set(sessionId, "session");
          this.store.handleFollowSnapshot(frame);
        } else if (frame.type === "assistant-stream") {
          this.store.handleAssistantStreamFrame(sessionId, frame.frame);
        } else {
          this.store.handleFollowEvent(sessionId, frame);
        }
      },
    });
  }

  /** 会话 follow 快照入库完成回调集合(供 UI 在事件合并后重建历史,解决首次切换空白)。 */
  private readonly followReadyListeners = new Set<(sessionId: string) => void>();

  /** 订阅「某会话 follow 快照已入库」。返回退订函数。 */
  onFollowReady(fn: (sessionId: string) => void): () => void {
    this.followReadyListeners.add(fn);
    return () => {
      this.followReadyListeners.delete(fn);
    };
  }

  private notifyFollowReady(sessionId: string) {
    for (const fn of this.followReadyListeners) {
      try {
        fn(sessionId);
      } catch (error) {
        console.error("[dsh] onFollowReady listener threw:", error);
      }
    }
  }

  /** 跟随一个会话:打开 session/follow 流(替换旧跟随)。 */
  private async startFollow(sessionId: string) {
    if (this.followedSession === sessionId && this.followHandle) return;
    this.followHandle?.cancel();
    this.followedSession = sessionId;
    this.followHandle = this.client.openStream("session/follow", { request: { address: { kind: "session", sessionId }, maxMessages: HISTORY_PAGE_MESSAGES, assistantStream: true } }, {
      onItem: (value) => {
        const frame = value as SessionFollowFrame;
        if (frame.type === "snapshot") {
          this.followCursor.set(sessionId, frame.cursor);
          this.followSource.set(sessionId, "session");
          this.store.handleFollowSnapshot(frame);
          this.notifyFollowReady(sessionId);
        } else if (frame.type === "assistant-stream") {
          this.store.handleAssistantStreamFrame(sessionId, frame.frame);
        } else {
          this.store.handleFollowEvent(sessionId, frame);
        }
      },
      onError: () => {
        // 跟随断开:保留现有内容,后续重新打开时再补
        if (this.followedSession === sessionId) this.followedSession = undefined;
      },
    });
  }

  /** 子代理历史:0.1.2 无 subagent.history,改为按子代理地址短暂 follow 取快照。 */
  async subagentHistory(
    parentSessionId: string,
    childSessionId: string,
    mode: "one-shot" | "continuable",
    beforeSeq?: number,
    maxMessages?: number,
  ): Promise<{ events: { event: { type: string; seq: number; time: number; data: any }; view?: unknown }[]; hasMore: boolean }> {
    const result = await new Promise<{ events: { event: { type: string; seq: number; time: number; data: any }; view?: unknown }[]; hasMore: boolean }>((resolve) => {
      let resolved = false;
      const finish = (value: { events: { event: { type: string; seq: number; time: number; data: any }; view?: unknown }[]; hasMore: boolean }) => {
        if (!resolved) {
          resolved = true;
          handle.cancel();
          resolve(value);
        }
      };
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          handle.cancel();
          resolve({ events: [], hasMore: false });
        }
      }, 10_000);
      const handle = this.client.openStream("session/follow", { request: { address: { kind: "subagent", parentSessionId, childSessionId, mode }, maxMessages: HISTORY_PAGE_MESSAGES, assistantStream: true } }, {
        onItem: (value) => {
          const frame = value as SessionFollowFrame;
          if (frame.type === "snapshot") {
            clearTimeout(timeout);
            this.followCursor.set(childSessionId, frame.cursor);
            this.followSource.set(childSessionId, "subagent");
            finish({
              events: frame.records.map((r) => (r.type === "event" ? { event: r.event } : { event: r.event })),
              hasMore: frame.hasMore,
            });
          }
        },
        onError: () => {
          clearTimeout(timeout);
          finish({ events: [], hasMore: false });
        },
      });
    });
    return result;
  }

  /** 向前翻页加载更早的历史(基于 follow cursor 的 session/page)。 */
  async loadMoreHistory(sessionId: string, mode: "session" | "subagent" = "session"): Promise<{ hasMore: boolean }> {
    if (this.store.isHistoryLoading(sessionId)) return { hasMore: true };
    const throughSeq = this.followCursor.get(sessionId);
    if (throughSeq === undefined) return { hasMore: false };
    const beforeSeq = this.store.historyBeforeSeq(sessionId);
    this.store.setHistoryLoading(sessionId, true);
    try {
      const parent = this.store.sessions.get(sessionId);
      const address =
        mode === "subagent" && parent?.parentSessionId
          ? { kind: "subagent" as const, parentSessionId: parent.parentSessionId, childSessionId: sessionId, mode: "continuable" as const }
          : { kind: "session" as const, sessionId };
      const { records, hasMore } = await this.client.sessionHistory({ address, throughSeq, ...(beforeSeq !== undefined ? { beforeSeq } : {}), maxMessages: HISTORY_PAGE_MESSAGES });
      this.store.mergeHistory(sessionId, records.map((r) => ({ event: r.event })));
      this.store.historyHasMore.set(sessionId, hasMore);
      return { hasMore };
    } catch (error) {
      console.error("[dsh] history page failed:", error);
      return { hasMore: true };
    } finally {
      this.store.setHistoryLoading(sessionId, false);
    }
  }

  async createSession(cwd?: string, agentPreset?: string): Promise<string> {
    // 服务器行为:仅当 session.create 携带 workspaceId 时,会话才会挂入对应工作区;
    // 只传 cwd 的话目录正确但会话落入"未分组"。因此先按 cwd 反查已注册工作区。
    const workspaceId = cwd ? this.resolveWorkspaceId(cwd) : undefined;
    const { sessionId } = await this.client.createSession({
      ...(workspaceId ? { workspaceId } : cwd ? { cwd } : {}),
      ...(agentPreset ? { agentPreset } : {}),
    });
    await this.refreshSessions();
    this.store.selectSession(sessionId);
    return sessionId;
  }

  /** 按 cwd 路径解析已注册工作区(本地清单;未注册时返回 undefined)。 */
  resolveWorkspaceId(cwd: string): string | undefined {
    const norm = (p: string) => p.replace(/[\\/]+$/, "").replace(/\//g, "\\").toLowerCase();
    const target = norm(cwd);
    const local = this.store.listWorkspaces().find((w) => norm(w.path) === target);
    return local?.workspaceId;
  }

  async send(sessionId: string, text: string): Promise<{ accepted: true; command?: { kind: "success"; text?: string } } | undefined> {
    try {
      return await this.client.sendPromptParts(sessionId, "queue", [{ type: "text", text }]);
    } catch (error) {
      const message = this.describeSendError(error);
      this.deps.onNotice?.(this.deps.t?.("hub.sendFailed", { message }) ?? `Send failed: ${message}`, "error");
      throw error;
    }
  }

  /** 发送失败 → 面向用户的文案:图片/模型类错误给可操作说明,其余沿用 code: message。 */
  private describeSendError(error: unknown): string {
    if (error instanceof DshApiError && error.code === "session/attachment-invalid") {
      const reason = (error.details as { reason?: string } | undefined)?.reason;
      if (reason === "MODEL_DOES_NOT_SUPPORT_IMAGES") {
        const matched = error.message.match(/Model "([^"]+)"/);
        const model = matched?.[1] ?? "";
        return (
          this.deps.t?.("hub.modelNoImages", { model: model || error.message }) ??
          `The current model ${model ? `"${model}"` : ""} does not support image input: remove the images, or switch model via the top-right composer button`
        );
      }
      if (reason === "IMAGE_TYPE_MISMATCH") return "Image content does not match its declared type: re-pick or re-copy the image";
      if (reason === "TOO_MANY_IMAGES" || reason === "IMAGES_TOO_LARGE") return "The image batch is too large (count/size limit): remove some images and retry";
      if (reason === "INVALID_IMAGE_BASE64") return "Image data is invalid: re-pick the image";
      if (reason) return error.message;
    }
    return error instanceof DshApiError ? `${error.code}: ${error.message}` : String(error);
  }

  /**
   * 执行一条斜杠命令(网页端 live.command() 同款语义):
   * 1. 走 commands.execute 网关通道(0.1.2 始终提供,images 字段必带);
   * 2. 仅当网关通道在传输层不可用(旧版服务器无命令网关)时,回退 session.prompt
   *    命令路径并监听 command/run 事件确认宿主拦截;网关明确拒绝(会话忙、参数
   *    无效等 DshApiError)直接向上抛出 —— 绝不把命令文本当作普通消息排进对话。
   */
  async runCommandLine(
    sessionId: string,
    line: string,
    images: { mediaType: string; data: string; name?: string }[] = [],
  ): Promise<{ outcome: "executed" | "unmatched" | "unavailable"; execution?: CommandExecutionView }> {
    try {
      const result = await this.client.executeCommand(sessionId, line, images);
      return { outcome: result.matched ? "executed" : "unmatched", ...(result.execution ? { execution: result.execution } : {}) };
    } catch (error) {
      if (error instanceof DshApiError) throw error; // 网关在但拒绝了(忙/无效等):交给上层给用户反馈
      // 传输层失败(网关不可用/旧版服务器):回退官方命令消息路径
      console.error("[dsh] commands.execute transport failure, falling back to session.prompt:", error);
    }
    const wasRunning = this.store.sessions.get(sessionId)?.running === true;
    const intercepted = await this.promptAsCommand(sessionId, images, line, wasRunning);
    if (intercepted === true) return { outcome: "executed" };
    if (intercepted === false) return { outcome: "unavailable" };
    return { outcome: "unmatched" };
  }

  /** 命令回退路径:发送 prompt,短窗口内听 command/run 事件。 */
  private async promptAsCommand(sessionId: string, images: { mediaType: string; data: string; name?: string }[], line: string, wasRunning: boolean): Promise<boolean | undefined> {
    const seen = new Promise<boolean>((resolve) => {
      const off = this.store.on("sessionEvent", (sid: string, stored) => {
        if (sid !== sessionId) return;
        if (stored.event.type === "command/run") {
          off();
          resolve(true);
        }
      });
      setTimeout(() => {
        off();
        resolve(false);
      }, 1500);
    });
    try {
      const content: PromptContentPart[] = [
        ...(images.length > 0 ? images.map((img) => ({ type: "image" as const, mediaType: img.mediaType, data: img.data, ...(img.name ? { name: img.name } : {}) })) : []),
        { type: "text" as const, text: line },
      ];
      await this.client.sendPromptParts(sessionId, "queue", content);
    } catch {
      return false;
    }
    const intercepted = await seen;
    if (!intercepted && !wasRunning) await this.client.cancelSession(sessionId);
    return intercepted;
  }

  /** 宿主命令表缓存(sessionId → 小写命令名 → 是否声明接受附件),供 /token 路由判定。 */
  private readonly commandNames = new Map<string, Map<string, boolean>>();

  /** 读取(并缓存)某会话的宿主命令表。 */
  private async commandTable(sessionId: string): Promise<Map<string, boolean> | undefined> {
    const cached = this.commandNames.get(sessionId);
    if (cached) return cached;
    try {
      const { names, attachmentCommands } = await this.client.listCommands(sessionId);
      const table = new Map<string, boolean>();
      for (const name of names) table.set(name.toLowerCase(), attachmentCommands.has(name.toLowerCase()));
      this.commandNames.set(sessionId, table);
      return table;
    } catch (error) {
      console.error("[dsh] commands/list failed:", error);
      return undefined;
    }
  }

  /** 判断一个(不带斜杠的)名称是否为宿主命令。 */
  async isKnownCommand(sessionId: string, name: string): Promise<boolean> {
    const table = await this.commandTable(sessionId);
    // 无法确认时保守视为命令:走命令通道,失败会取消回合并提示,不会误发给模型
    return table === undefined ? true : table.has(name.toLowerCase());
  }

  /** 该宿主命令是否声明接受附件(0.1.5 input.attachments / 0.1.2 input.images)。 */
  async commandAcceptsAttachments(sessionId: string, name: string): Promise<boolean> {
    const table = await this.commandTable(sessionId);
    if (table === undefined) return this.client.commandImagesSupported();
    return table.get(name.toLowerCase()) === true;
  }

  /** 命令目录中是否存在接受附件的命令(兼容旧调用)。 */
  commandImagesSupported(): boolean {
    return this.client.commandImagesSupported();
  }

  /** 清空命令名缓存(连接重建时调用)。 */
  clearCommandCache() {
    this.commandNames.clear();
  }

  /** 发送带内容块的消息(文本 + 图片)。 */
  async sendParts(sessionId: string, content: PromptContentPart[]) {
    try {
      await this.client.sendPromptParts(sessionId, "queue", content);
    } catch (error) {
      const message = this.describeSendError(error);
      this.deps.onNotice?.(this.deps.t?.("hub.sendFailed", { message }) ?? `Send failed: ${message}`, "error");
      throw error;
    }
  }

  async cancel(sessionId: string) {
    try {
      await this.client.cancelSession(sessionId);
    } catch (error) {
      console.error("[dsh] cancel failed:", error);
    }
  }

  async respondApproval(sessionId: string, approvalId: string, outcome: "allowed-once" | "rejected") {
    const pending = this.store.pendingApprovals.get(approvalId);
    if (!pending) {
      this.deps.onNotice?.(this.deps.t?.("hub.approvalGone") ?? "The approval is no longer pending", "warning");
      return;
    }
    try {
      await this.client.respondApproval(pending.sessionId ?? sessionId, approvalId, outcome, pending.frameRpcId);
      this.store.resolveWaterfall(approvalId, outcome);
    } catch (error) {
      this.deps.onNotice?.(this.deps.t?.("hub.approvalFailed", { error: String(error) }) ?? `Respond to approval failed: ${String(error)}`, "error");
    }
  }

  async respondQuestion(sessionId: string, frameRpcId: string, answers: { id: string; selected: string[]; custom?: string }[]) {
    const pending = this.store.pendingQuestions.get(frameRpcId);
    if (!pending) {
      this.deps.onNotice?.(this.deps.t?.("hub.questionGone") ?? "The question is no longer pending", "warning");
      return;
    }
    try {
      await this.client.respondQuestion(pending.sessionId ?? sessionId, { answers }, frameRpcId);
      this.store.resolveWaterfall(frameRpcId, "answered");
    } catch (error) {
      this.deps.onNotice?.(this.deps.t?.("hub.questionFailed", { error: String(error) }) ?? `Answer question failed: ${String(error)}`, "error");
    }
  }

  /** 取消提问/计划审批(以 rejected + code=cancelled 结束 waterfall)。 */
  async cancelQuestion(_sessionId: string, frameRpcId: string) {
    try {
      await this.client.cancelQuestion(_sessionId, frameRpcId);
      this.store.resolveWaterfall(frameRpcId, "cancelled");
    } catch (error) {
      this.deps.onNotice?.(this.deps.t?.("hub.questionFailed", { error: String(error) }) ?? `Cancel question failed: ${String(error)}`, "error");
    }
  }

  // ---------- 模型 / 预设 / 思考深度 ----------

  /** 模型目录(0.1.2:session/modelCatalog,全局目录)。 */
  getSessionModels(_sessionId: string) {
    return this.client.sessionModels("");
  }

  /** 读取目录默认模型并同步到状态栏。 */
  async updateCurrentModel(sessionId: string) {
    try {
      const catalog = await this.client.sessionModels(sessionId);
      this.statusState.model = catalog.current?.model;
      this.statusState.provider = catalog.current?.provider;
      this.emitStatus();
    } catch {
      // 忽略:状态栏保持原值
    }
  }

  selectModel(sessionId: string, provider: string, model: string, reasoningEffort?: string) {
    return this.client.selectModel(sessionId, provider, model, reasoningEffort);
  }

  listPresets() {
    return this.client.listAgentPresets();
  }

  async selectPreset(sessionId: string, agentPreset: string) {
    const result = await this.client.selectAgentPreset(sessionId, agentPreset);
    await this.refreshSessions();
    return result;
  }

  // ---------- 会话管理:重命名 / 分叉 / 归档 ----------

  renameSession(sessionId: string, title: string) {
    return this.client.renameSession(sessionId, title);
  }

  async forkSession(sessionId: string, atSeq?: number): Promise<string> {
    const { sessionId: forked } = await this.client.forkSession(sessionId, atSeq);
    await this.refreshSessions();
    return forked;
  }

  async archiveSession(sessionId: string) {
    const result = await this.client.archiveSession(sessionId);
    await this.refreshSessions();
    return result;
  }

  // ---------- goal ----------

  async createGoal(sessionId: string, objective: string, maxGoalRounds?: number) {
    const { ref } = await this.client.goalCreate(sessionId, objective, maxGoalRounds);
    await this.refreshSessions();
    return { ref };
  }

  async completeGoal(sessionId: string, ref: { id: string; revision: number }) {
    const result = await this.client.goalComplete(sessionId, ref);
    await this.refreshSessions();
    return result;
  }

  async editGoal(sessionId: string, ref: { id: string; revision: number }, objective?: string) {
    const result = await this.client.goalEdit(sessionId, ref, objective);
    await this.refreshSessions();
    return result;
  }

  async resumeGoal(sessionId: string, ref: { id: string; revision: number }) {
    const result = await this.client.goalResume(sessionId, ref);
    await this.refreshSessions();
    return result;
  }

  async pauseGoal(sessionId: string, ref: { id: string; revision: number }) {
    const result = await this.client.goalPause(sessionId, ref);
    await this.refreshSessions();
    return result;
  }

  async clearGoal(sessionId: string, ref: { id: string; revision: number }) {
    const result = await this.client.goalClear(sessionId, ref);
    await this.refreshSessions();
    return result;
  }

  // ---------- 技能 / 子代理 ----------

  getSkills(sessionId: string) {
    return this.client.listSkills(sessionId);
  }

  listSubagents(sessionId: string) {
    return this.client.listSubagents(sessionId);
  }

  subagentHistoryOld(parentSessionId: string, childSessionId: string, mode: "one-shot" | "continuable", beforeSeq?: number, maxMessages?: number) {
    return this.subagentHistory(parentSessionId, childSessionId, mode, beforeSeq, maxMessages);
  }

  subagentPrompt(parentSessionId: string, childSessionId: string, text: string) {
    return this.client.subagentPrompt(parentSessionId, childSessionId, text);
  }

  subagentInterrupt(parentSessionId: string, childSessionId: string) {
    return this.client.subagentInterrupt(parentSessionId, childSessionId);
  }

  // ---------- 工作区 ----------

  listWorkspaces() {
    return this.store.listWorkspaces();
  }

  async refreshWorkspaces() {
    // 0.1.2 起工作区列表来自 workspace/follow 流;此处仅确保流已打开
    this.client.startStreams();
    return this.store.listWorkspaces();
  }

  createWorkspace(path: string) {
    return this.client.createWorkspace(path);
  }
  renameWorkspace(workspaceId: string, title: string) {
    return this.client.renameWorkspace(workspaceId, title);
  }
  deleteWorkspace(workspaceId: string) {
    return this.client.deleteWorkspace(workspaceId);
  }
  moveWorkspace(workspaceId: string, beforeWorkspaceId?: string) {
    return this.client.moveWorkspace(workspaceId, beforeWorkspaceId);
  }
  moveSessionInWorkspace(workspaceId: string, sessionId: string, beforeSessionId?: string) {
    return this.client.moveSessionInWorkspace(workspaceId, sessionId, beforeSessionId);
  }

  // ---------- 会话搜索 / 图片附件 ----------

  searchSessions(query: string) {
    return this.client.searchSessions(query);
  }

  readAttachment(sessionId: string, attachmentId: string) {
    return this.client.readAttachment(sessionId, attachmentId);
  }

  // ---------- 预设作者 ----------

  readPreset(agentPreset: string) {
    return this.client.readAgentPreset(agentPreset);
  }
  copyPreset(from: string, agentPreset: string, name?: string) {
    return this.client.copyAgentPreset(from, agentPreset, name);
  }
  openPresetDocument(agentPreset: string) {
    return this.client.openAgentPresetDocument(agentPreset);
  }
  removePreset(agentPreset: string) {
    return this.client.removeAgentPreset(agentPreset);
  }

  // ---------- 设置 / 凭据 / LLM ----------

  settingsDescribe() {
    return this.client.settingsDescribe();
  }
  settingsOpenDocument() {
    return this.client.settingsOpenDocument();
  }
  settingsUpdate(ns: string, patch: object, expectedRevision?: number) {
    return this.client.settingsUpdate(ns, patch, expectedRevision);
  }
  settingsReplace(ns: string, section: object, expectedRevision?: number) {
    return this.client.settingsReplace(ns, section, expectedRevision);
  }
  settingsMutate(ns: string, ops: Parameters<DshApiClient["settingsMutate"]>[1], expectedRevision?: number) {
    return this.client.settingsMutate(ns, ops, expectedRevision);
  }
  credentialsDescribe(refs: string[]) {
    return this.client.credentialsDescribe(refs);
  }
  credentialsSet(ref: string, value: string) {
    return this.client.credentialsSet(ref, value);
  }
  credentialsUnset(ref: string) {
    return this.client.credentialsUnset(ref);
  }
  llmProviders() {
    return this.client.llmProviders();
  }
  llmModels() {
    return this.client.llmModels();
  }
  llmDiscoverModels(payload: { settingsNs: string; provider?: string; baseURL?: string; api?: string; apiKey?: string }) {
    return this.client.llmDiscoverModels(payload);
  }

  /** 新建会话后,若配置了默认思考深度且当前模型支持,则自动应用。 */
  async applyDefaultReasoningEffort(sessionId: string): Promise<void> {
    const configured = this.deps.defaultReasoningEffort?.trim();
    if (!configured) return;
    try {
      const catalog = await this.client.sessionModels(sessionId);
      const current = catalog.current;
      const group = catalog.groups.find((g) => g.id === current.provider);
      const model = group?.models.find((m) => m.id === current.model);
      if (model?.reasoning?.efforts.some((e) => e.id === configured)) {
        await this.client.selectModel(sessionId, current.provider, current.model, configured);
      }
    } catch (error) {
      console.error("[dsh] applyDefaultReasoningEffort failed:", error);
    }
  }

  /** 等待会话空闲下来(以 turn/end 或非运行态为准),用于参与者。 */
  waitIdle(sessionId: string, token?: { isCancellationRequested: boolean; onCancellationRequested(cb: () => void): { dispose(): void } }): Promise<void> {
    return new Promise((resolve) => {
      const dispose: (() => void)[] = [];
      const finish = () => {
        for (const d of dispose) d();
        resolve();
      };
      dispose.push(
        this.store.on("turnEnd", (sid: string) => {
          if (sid === sessionId) finish();
        }),
        this.store.on("agentError", (sid: string) => {
          if (sid === sessionId) finish();
        }),
      );
      if (token) {
        const disposable = token.onCancellationRequested(() => finish());
        dispose.push(() => disposable.dispose());
      }
      // 兜底:若会话本就不在运行(例如 prompt 被拒绝或只是排队指令),延迟确认后返回
      const current = this.store.sessions.get(sessionId);
      if (current && !current.running) {
        setTimeout(() => {
          const s = this.store.sessions.get(sessionId);
          if (s && !s.running) finish();
        }, 1500);
      }
    });
  }

  // ---------- @ 引用候选(rc.8 网页端 @ 菜单同款:文件与文件夹 / Session 对话) ----------

  fileReferenceList(agentId: string, query: string) {
    return this.client.fileReferenceList(agentId, query);
  }

  sessionReferenceCandidates(agentId: string, query: string) {
    return this.client.sessionReferenceCandidates(agentId, query);
  }

  // ---------- Cordis 动态插件(网页端 dynamicCordisRunner 同款) ----------

  cordisInventory(): Promise<CordisPluginRow[]> {
    return this.client.cordisInventory();
  }

  /** 宿主远程事件订阅(cordis/request-run 等;返回退订函数)。 */
  onRemoteEvent(fn: (event: string, args: unknown[]) => void): () => void {
    return this.store.on("remoteEvent", fn);
  }

  /**
   * 响应一次审批请求(网页端 runner.approve 同款):
   * 1) runHostHalf(requestId) 应用授权并启动宿主半段;
   * 2) 宿主 activate 的返回**不带 status 字段**,须以权威清单确认运行是否处于
   *    client-pending(含 Client 半段的包)—— 若是,用 resolveRequestRun 以
   *    {ok:true, waitingFor: host 缺失服务} 结算 —— VS Code 无浏览器客户端,
   *    Client 半段不加载,但运行被标记为 running(宿主半段生效)。
   */
  async cordisApprove(request: CordisRequestRun, approveFutureVersions: boolean): Promise<{ ok: boolean; message?: string }> {
    try {
      const started = await this.client.cordisRunHostHalf({
        agentId: request.agentId,
        pluginId: request.pluginId,
        packageId: request.packageId,
        mode: request.mode,
        requestId: request.requestId,
        approveFutureVersions,
      });
      if (!started.ok) return { ok: false, message: (started as any).message };
      if (await this.cordisNeedsClientSettlement(request.pluginId, started.pluginRunId)) {
        const resolved = await this.client.cordisResolveRequestRun(request.requestId, {
          ok: true,
          pluginRunId: started.pluginRunId,
          waitingFor: started.waitingFor ?? [],
        });
        if (!resolved.accepted) return { ok: false, message: "run request was already settled" };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, message: String(error) };
    }
  }

  /** 拒绝一次审批请求(网页端 runner.decline 同款)。 */
  async cordisReject(requestId: string): Promise<{ ok: boolean; message?: string }> {
    try {
      const result = await this.client.cordisResolveRequestRun(requestId, {
        ok: false,
        reason: "rejected",
        message: "declined in VS Code",
      });
      return result.accepted ? { ok: true } : { ok: false, message: "run request was already settled" };
    } catch (error) {
      return { ok: false, message: String(error) };
    }
  }

  /** 面板直接运行/重启/切换版本:runHostHalf 后若 client-pending 则 settleUserRun 结算。 */
  async cordisRun(agentId: string, pluginId: string, packageId: string, mode: "run" | "update"): Promise<{ ok: boolean; message?: string }> {
    try {
      const started = await this.client.cordisRunHostHalf({
        agentId,
        pluginId,
        packageId,
        mode,
        requestId: null,
        approveFutureVersions: false,
      });
      if (!started.ok) return { ok: false, message: (started as any).message };
      if (await this.cordisNeedsClientSettlement(pluginId, started.pluginRunId)) {
        const settled = await this.client.cordisSettleUserRun(agentId, pluginId, {
          ok: true,
          pluginRunId: started.pluginRunId,
          waitingFor: started.waitingFor ?? [],
        });
        if (!settled.ok) return { ok: false, message: (settled as any).message };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, message: String(error) };
    }
  }

  /** 以权威清单确认该运行是否处于 client-pending(需要客户端结算)。 */
  private async cordisNeedsClientSettlement(pluginId: string, pluginRunId: string): Promise<boolean> {
    try {
      const rows = await this.client.cordisInventory();
      const row = rows.find((r) => r.pluginId === pluginId);
      return row?.latestRun?.pluginRunId === pluginRunId && row.latestRun.status === "client-pending";
    } catch {
      // 清单读取失败时保守按需结算:再次确认失败仅提示,不影响已启动的宿主半段
      return true;
    }
  }

  cordisStop(agentId: string, pluginId: string): Promise<CordisStopResult> {
    return this.client.cordisStopFromPanel(agentId, pluginId);
  }

  cordisUndefine(agentId: string, pluginId: string): Promise<CordisUndefineResult> {
    return this.client.cordisUndefineFromPanel(agentId, pluginId);
  }

  dispose() {
    this.client.dispose();
  }
}
