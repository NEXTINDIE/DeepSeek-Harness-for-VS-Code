import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import type {
  AgentPresetListValue,
  AgentPresetOpenDocumentValue,
  AgentPresetReadValue,
  AskUserQuestionAnswer,
  ClientRequest,
  CommandExecutionView,
  ConfigurableProviderView,
  CreateGoalResult,
  CredentialView,
  DiscoveredModelView,
  FeedbackCategory,
  GoalRef,
  HostDescribeValue,
  MessageFeedbackDeleteResult,
  MessageFeedbackItem,
  MessageFeedbackListResult,
  MessageFeedbackPutResult,
  MessageFeedbackRating,
  PermissionCatalog,
  PromptContentPart,
  RemoteEventFrame,
  RemoteEventOutcome,
  RemoteMuxServerMessage,
  ScheduleCatalogEntry,
  ScheduleDeleteValue,
  ScheduleHistoryRequest,
  ScheduleHistoryValue,
  ScheduleRecord,
  SessionCreateRequest,
  SessionCreateValue,
  SessionHistoryRequest,
  SessionHistoryValue,
  SessionListValue,
  SessionModelsValue,
  SessionPromptRequest,
  SessionPromptValue,
  SessionSearchValue,
  SettingsDescribeValue,
  SettingsNamespaceView,
  SettingsPathOpView,
  SessionFeedbackRecordResult,
  SubagentEntry,
  SubagentPromptReceipt,
  WorkspaceItem,
} from "./types";
import type {
  CordisPluginRow,
  CordisRunHostHalfResult,
  CordisRunResolution,
  CordisStopResult,
  CordisUndefineResult,
} from "./cordisTypes";

export class DshApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "DshApiError";
  }
}

/** /api 未认证且无法获得 token(外部启动的服务器)时的专用错误。 */
export class DshAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DshAuthError";
  }
}

interface ServerResponse {
  type: "server-response";
  rpcId: string;
  result: { ok: true; value: any } | { ok: false; error: { code: string; message: string; details?: unknown } };
}

export type ConnectionState = "disconnected" | "connecting" | "connected";

/** 一个 remote.mux 逻辑流(打开/取消)。 */
export interface RemoteStreamHandle {
  cancel(): void;
}

/**
 * DSH Web API 客户端(0.1.7-rc.2 线协议,兼容 0.1.5 / 0.1.2 的参数名与端点差异):
 * - 一元:POST /api/<namespace>/<method>,信封 payload 为恰好一个字段的 {args:{...}};
 * - 流:/api/remote.mux 单 WebSocket 多路(session/follow、session/control、workspace/follow、$events);
 * - 认证:GET /?token=<启动 token> 交换签名 cookie,所有请求携带。
 *
 * 0.1.5-rc.1 → 0.1.7-rc.2 与本客户端相关的线协议差异:
 * - 信封、remote.mux 流与 $events 帧形状不变(已按 0.1.7-rc.2 发布包核对);
 * - subagents/list 移除(subagentCatalog + session/page 地址分页取代);
 * - settings/openAgentPresetDirectory 与 agentPresets/copy|deletePreset 移除
 *   (预设作者只剩 list/read/select);
 * - 新增 schedule/list|catalog|delete|history(定时任务)与 schedule/changed 失效事件;
 * - 新增 messageFeedback/list|put|delete(逐消息反馈,CAS 用 ifVersion)与 sessionFeedback/record;
 * - 新增 permissionPresets/catalog(进程级权限预设目录,可选项比 permissions 投影更权威);
 * - 新增 goals/get、session/projections|rename|fork|selectModel|workspacePathApplications 等。
 *
 * 0.1.2-rc.1 → 0.1.5-rc.1 与本客户端相关的线协议差异:
 * - commands/execute 第三参数由 images 改名 submittedAttachments(图片/文件内容块同构);
 * - commands/list 描述符 input.images 改为 input.attachments;
 * - subagents/prompt 新增必填 delivery("queue"|"steer");
 * - session/follow 快照 header 的 seedLength 改为 isSeeded;
 * - session/page 不再返回压缩的 chunks 记录(历史即原始事件;V3 日志不保存逐 token 增量);
 * - 新增 fileUploads/upload(文件先上传取 receiptId,再以 {type:"file",receiptId} 发送)。
 */
export class DshApiClient {
  readonly baseUrl: string;
  /** 服务器版本(0.1.2 起 host.describe 已移除;保留字段仅为兼容展示)。 */
  serverVersion: string | undefined;
  /** $events 打开帧提供的主机信息(home)。 */
  hostInfo: { home: string } | undefined;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private ws: WebSocket | undefined;
  private disposed = false;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private retryDelay = 1000;
  private wsOnState: ((state: ConnectionState) => void) | undefined;

  /** 逻辑流注册表:streamId → 回调。 */
  private streams = new Map<
    string,
    { onItem: (value: unknown) => void; onEnd: () => void; onError: (error: { code: string; message: string; details: unknown }) => void }
  >();
  private pendingOpens: { streamId: string; endpoint: string; args: unknown }[] = [];

  // ---------- auth(0.1.2 新增浏览器认证) ----------

  private launchToken: string | undefined;
  private cookie: string | undefined;
  private authPromise: Promise<void> | undefined;

  /** 设置服务器启动时从日志解析到的启动 token(换取 cookie 用);传 undefined 清除。 */
  setLaunchToken(token: string | undefined) {
    this.launchToken = token;
  }

  /** 是否已持有认证 cookie。 */
  get authenticated(): boolean {
    return this.cookie !== undefined;
  }

  private async ensureAuth(force = false): Promise<void> {
    if (this.cookie !== undefined && !force) return;
    if (this.authPromise !== undefined && !force) return this.authPromise;
    this.authPromise = this.doEnsureAuth(force).finally(() => {
      this.authPromise = undefined;
    });
    return this.authPromise;
  }

  private async doEnsureAuth(force: boolean): Promise<void> {
    const token = this.launchToken;
    if (!token) {
      throw new DshAuthError(
        "服务器要求授权(0.1.2 起 /api 需要签名 cookie),但未取得启动 token:请先停止本机运行中的 dsh 服务器,再由本扩展重新启动(会自动获取授权)。",
      );
    }
    const authUrl = new URL("/", new URL(this.baseUrl));
    authUrl.searchParams.set("token", token);
    const res = await fetch(authUrl, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401 || res.status === 403) {
      throw new DshAuthError("服务器拒绝了授权令牌(令牌可能已过期):请重启服务器后重试");
    }
    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) {
      // 旧版服务器(0.1.1-)无认证或已带有效 cookie:视为已认证
      this.cookie = "";
      return;
    }
    this.cookie = setCookie.split(";")[0].trim();
  }

  /** 供外部(非本客户端的启动流程)注入直接可用的 cookie。 */
  setAuthCookie(cookie: string) {
    this.cookie = cookie;
  }

  private async request<T>(method: string, args: unknown, timeoutMs = 30_000): Promise<T> {
    const attempt = async (): Promise<{ status: number; rpcId: string; body?: ServerResponse }> => {
      const message: ClientRequest = { type: "client-request", rpcId: randomUUID(), method, payload: { args } };
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (this.cookie) headers.cookie = this.cookie;
      const res = await fetch(`${this.baseUrl}/api/${method}`, {
        method: "POST",
        headers,
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(timeoutMs),
      });
      return {
        status: res.status,
        rpcId: message.rpcId,
        body: res.ok ? ((await res.json()) as ServerResponse) : undefined,
      };
    };

    let out = await attempt();
    if (out.status === 401 || out.status === 403) {
      // 懒认证:只有服务器拒绝时才交换 cookie(0.1.2 起 /api 需要签名 cookie;
      // 旧版服务器根本不需要认证,不能因为还没拿到 token 就拦住所有请求)
      if (this.cookie !== undefined && this.launchToken) {
        this.cookie = undefined; // cookie 可能过期:强制刷新一次
        await this.ensureAuth(true);
        out = await attempt();
      } else {
        await this.ensureAuth(); // 无 token 时抛 DshAuthError(提示如何解决)
        out = await attempt();
      }
    }
    if (out.status === 401 || out.status === 403) {
      throw new DshAuthError(`服务器要求授权(HTTP ${out.status}):请通过本扩展启动服务器`);
    }
    if (!out.body) {
      // 端点不存在时网关直接 404(无 JSON 信封)。0.1.7 起多个端点被移除,
      // 若只抛「transport failure」调用方无法区分「能力缺失」与「真实故障」,
      // 因此这里统一转成带错误码的 DshApiError(method-unavailable 语义)。
      if (out.status === 404) {
        throw new DshApiError("method-unavailable", `该服务器未提供端点 ${method}(HTTP 404):可能已被当前 DSH 版本移除或未启用对应插件`);
      }
      throw new DshApiError("transport-failure", `DSH transport failure for ${method}: HTTP ${out.status}`);
    }
    if (out.body.rpcId !== out.rpcId) throw new Error(`DSH rpcId mismatch for ${method}`);
    if (!out.body.result.ok) {
      throw new DshApiError(out.body.result.error.code, out.body.result.error.message, out.body.result.error.details);
    }
    return out.body.result.value as T;
  }

  /** 探测服务器:0.1.2 起 host.describe 移除,改用 session/list 作为探测。 */
  async ping(timeoutMs = 3000): Promise<HostDescribeValue | undefined> {
    try {
      await this.request<SessionListValue>("session/list", { _request: {} }, timeoutMs);
      return {
        version: "0.0.1",
        cwd: this.hostInfo?.home ?? "",
        provider: undefined,
        model: undefined,
        attachedSessions: 0,
        canOpenPath: false,
      };
    } catch (error) {
      if (error instanceof DshAuthError) throw error; // 认证问题让调用方明确提示
      // 0.1.2 线协议端点 404:可能是旧版服务器(0.1.1- rc 及更早,点号端点)仍在运行
      if (await this.isLegacyServer()) {
        throw new DshApiError(
          "server-old-version",
          "检测到运行中的旧版 DSH 服务器(0.1.1-rc.2 及更早,无 0.1.2 线协议):请先停止该服务器,再由本扩展重新启动。",
        );
      }
      return undefined;
    }
  }

  /** 旧版服务器探测:0.1.1-及更早的 host.describe 点号端点是否存活。 */
  private async isLegacyServer(timeoutMs = 3000): Promise<boolean> {
    try {
      const message: ClientRequest = { type: "client-request", rpcId: randomUUID(), method: "host.describe", payload: {} };
      const res = await fetch(`${this.baseUrl}/api/host.describe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return false;
      const full = (await res.json()) as ServerResponse;
      return full.type === "server-response" && !!full.result?.ok;
    } catch {
      return false;
    }
  }

  // ---------- remote.mux 流 ----------

  setStreamState(listener: (state: ConnectionState) => void) {
    this.wsOnState = listener;
  }

  private wsUrl(path: string): string {
    const u = new URL(this.baseUrl);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = path;
    return u.toString();
  }

  private connectMux() {
    if (this.disposed || this.ws !== undefined) return;
    this.wsOnState?.("connecting");
    const ws = new WebSocket(this.wsUrl("/api/remote.mux"), {
      handshakeTimeout: 5000,
      headers: this.cookie ? { cookie: this.cookie } : {},
    });
    this.ws = ws;
    ws.on("open", () => {
      this.retryDelay = 1000;
      this.wsOnState?.("connected");
      // 补发连接期间排队的流打开
      const pending = this.pendingOpens;
      this.pendingOpens = [];
      for (const item of pending) this.sendStreamOpen(item.streamId, item.endpoint, item.args);
    });
    ws.on("message", (data) => {
      try {
        const frame = JSON.parse(data.toString()) as RemoteMuxServerMessage;
        const stream = this.streams.get(frame.streamId);
        if (!stream) return;
        if (frame.type === "item") stream.onItem(frame.value);
        else if (frame.type === "end") {
          this.streams.delete(frame.streamId);
          stream.onEnd();
        } else {
          this.streams.delete(frame.streamId);
          stream.onError(frame.error);
        }
      } catch {
        // 丢弃损坏帧
      }
    });
    ws.on("error", () => {});
    ws.on("close", () => {
      if (this.ws !== ws) return;
      this.ws = undefined;
      if (this.disposed) return;
      this.wsOnState?.("disconnected");
      // 所有逻辑流失败;连接重建后需由调用方重新打开
      const streams = [...this.streams];
      this.streams.clear();
      for (const [, stream] of streams) stream.onError({ code: "stream/socket-closed", message: "remote.mux socket closed", details: {} });
      const delay = this.retryDelay;
      this.retryDelay = Math.min(delay * 2, 15_000);
      this.reconnectTimer = setTimeout(() => this.connectMux(), delay);
    });
  }

  /** 确保物理连接已建立。 */
  startStreams() {
    this.connectMux();
  }

  private sendStreamOpen(streamId: string, endpoint: string, args: unknown) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({ type: "open", streamId, endpoint, payload: { args } }));
    return true;
  }

  /**
   * 打开一个 remote.mux 逻辑流。onItem 逐条接收,onEnd 正常结束,
   * onError 收到错误(含连接级失败,需重新 open)。返回取消句柄。
   */
  openStream(
    endpoint: string,
    args: unknown,
    handlers: { onItem: (value: unknown) => void; onEnd?: () => void; onError?: (error: { code: string; message: string; details: unknown }) => void },
  ): RemoteStreamHandle {
    const streamId = randomUUID();
    this.streams.set(streamId, {
      onItem: handlers.onItem,
      onEnd: () => handlers.onEnd?.(),
      onError: (error) => handlers.onError?.(error),
    });
    if (!this.sendStreamOpen(streamId, endpoint, args)) this.pendingOpens.push({ streamId, endpoint, args });
    return {
      cancel: () => {
        this.streams.delete(streamId);
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: "cancel", streamId }));
        }
      },
    };
  }

  // ---------- $events(主机事件流;0.1.2 起审批/提问/Cordis 事件的唯一通道) ----------

  private eventsClientId: string | undefined;
  private eventsReady = false;
  private eventsHandlers:
    | {
        onReady?: (clientId: string, host: { home: string }) => void;
        onEmit?: (event: string, args: unknown[]) => void;
        onWaterfall?: (frame: { event: string; eventId: string; agentId: string; request: unknown }) => void;
        onCancel?: (eventId: string) => void;
      }
    | undefined;

  /** 注册 $events 帧消费(幂等:重复调用只覆盖回调,不重复开流)。 */
  setEventsHandlers(handlers: NonNullable<DshApiClient["eventsHandlers"]>) {
    this.eventsHandlers = handlers;
    if (this.eventsReady) return;
    this.eventsReady = true;
    this.openStream("$events", {}, {
      onItem: (value) => this.handleRemoteEventFrame(value as RemoteEventFrame),
      onError: () => {
        // 重连后重新打开
        this.eventsReady = false;
        this.setEventsHandlers(this.eventsHandlers!);
      },
    });
  }

  private handleRemoteEventFrame(frame: RemoteEventFrame) {
    if (frame.type === "ready") {
      this.eventsClientId = frame.clientId;
      this.hostInfo = frame.host;
      this.eventsHandlers?.onReady?.(frame.clientId, frame.host);
      return;
    }
    if (frame.type === "emit") {
      this.eventsHandlers?.onEmit?.(frame.event, frame.args);
      return;
    }
    if (frame.type === "waterfall") {
      this.eventsHandlers?.onWaterfall?.({ event: frame.event, eventId: frame.eventId, agentId: frame.agentId, request: frame.request });
      return;
    }
    this.eventsHandlers?.onCancel?.(frame.eventId);
  }

  /** 回答一个 $events waterfall 请求(审批 / 提问 / 让渡)。 */
  async respondEvent(clientId: string, eventId: string, outcome: RemoteEventOutcome): Promise<{ accepted: boolean }> {
    return this.request<{ accepted: boolean }>("$events/result", { clientId, eventId, outcome }, 30_000);
  }

  /** 以工具层 API 回答审批(waterfall eventId 即审批 id)。 */
  async respondApproval(agentId: string, approvalId: string, outcome: "allowed-once" | "rejected", frameRpcId: string) {
    return this.respondEvent(this.eventsClientId ?? "", frameRpcId || approvalId, {
      kind: "result",
      value: outcome,
    });
  }

  /** 以工具层 API 回答提问。 */
  async respondQuestion(agentId: string, answer: AskUserQuestionAnswer, frameRpcId: string) {
    return this.respondEvent(this.eventsClientId ?? "", frameRpcId, { kind: "result", value: answer });
  }

  /** 取消提问(网页端取消按钮同款:以 rejected 结束 waterfall)。 */
  async cancelQuestion(agentId: string, frameRpcId: string): Promise<{ accepted: boolean }> {
    return this.respondEvent(this.eventsClientId ?? "", frameRpcId, {
      kind: "rejected",
      error: { name: "Error", message: "user cancelled the question", code: "cancelled" },
    });
  }

  // ---------- 会话域 ----------

  setServerVersion(version: string | undefined) {
    this.serverVersion = version;
  }

  private commandImagesCapability = false;
  /** 已确认可用的 commands/execute 附件参数名(0.1.5=submittedAttachments;0.1.2=images)。 */
  private commandAttachmentsField: "submittedAttachments" | "images" | undefined;

  /** 由 commands/list 描述符探测:命令是否接受附件(input.images / input.attachments)。 */
  setCommandImagesSupported(supported: boolean) {
    this.commandImagesCapability = supported;
  }

  /** commands/execute 是否接受附件参数(0.1.2 网关始终声明,能力探测仅用于描述符一致性)。 */
  commandImagesSupported(): boolean {
    return this.commandImagesCapability;
  }

  /** 该错误是否为"网关按描述符精确校验参数名"导致的失配(可换名重试)。 */
  private isArgumentNameMismatch(error: unknown): boolean {
    return error instanceof DshApiError && (error.code === "gateway/arguments-invalid" || /arguments-invalid/.test(error.code));
  }

  listSessions() {
    // 0.1.2 网关示例:会话域单参数端点的参数名固定为 request(_request),必须包一层
    return this.request<SessionListValue>("session/list", { _request: {} });
  }
  searchSessions(query: string) {
    return this.request<SessionSearchValue>("session/search", { request: { query } });
  }
  readAttachment(sessionId: string, attachmentId: string) {
    return this.request<{ attachment: { id: string; mediaType?: string; name?: string; [key: string]: unknown }; data: string }>(
      "session/attachment",
      { request: { sessionId, attachmentId } },
    );
  }
  createSession(payload: SessionCreateRequest) {
    return this.request<SessionCreateValue>("session/create", { request: payload });
  }
  /** 0.1.2 起历史分页改为 session/page(需要 throughSeq)。 */
  sessionHistory(payload: SessionHistoryRequest) {
    return this.request<SessionHistoryValue>("session/page", { request: payload });
  }
  /**
   * 非激活读取一个会话的完整投影基线(session/projections;0.1.5 起可用)。
   * 用于会话刚打开时补齐 todos / stats / permissions / context / 子代理目录,
   * 不必等某个投影事件到达。
   */
  sessionProjections(sessionId: string) {
    return this.request<{ asOfSeq: number; values: Record<string, unknown> } | null>("session/projections", { request: { sessionId } });
  }
  sendPrompt(payload: SessionPromptRequest) {
    return this.request<SessionPromptValue>("session/prompt", { request: payload }, 60_000);
  }
  sendPromptParts(sessionId: string, mode: "queue" | "steer", content: PromptContentPart[]) {
    return this.request<SessionPromptValue>("session/prompt", { request: { requestId: randomUUID(), sessionId, mode, content } }, 60_000);
  }

  /**
   * 会话级斜杠命令执行(与网页端 live.command() 完全一致的通道):
   * 端点 /api/commands/execute,信封 {type:"client-request", rpcId, method:"commands/execute",
   * payload:{args:{agentId, line, submittedAttachments}}};result.value === undefined 表示未匹配任何命令。
   * 0.1.5-rc.1 契约:第三参数名为 submittedAttachments(图片 + 文件内容块);0.1.2-rc.1 名为 images,
   * 网关按描述符精确校验参数名并按需拒绝,因此这里"新名优先、旧名回退",并记住可用名,避免重复探测。
   */
  async executeCommand(
    sessionId: string,
    line: string,
    attachments: ({ type: "image"; mediaType: string; data: string; name?: string } | { type: "file"; receiptId: string })[] | { mediaType: string; data: string; name?: string }[] = [],
  ): Promise<{ matched: boolean; execution?: CommandExecutionView }> {
    const fields: ("submittedAttachments" | "images")[] = this.commandAttachmentsField
      ? [this.commandAttachmentsField]
      : ["submittedAttachments", "images"];
    // 0.1.2 的 images 参数只接受图片块,调用方传入的裸图片结构在两条通道上都要归一化
    const parts = (attachments as any[]).map((item) =>
      item && typeof item === "object" && typeof item.type === "string"
        ? item
        : { type: "image" as const, mediaType: (item as any).mediaType, data: (item as any).data, ...((item as any).name ? { name: (item as any).name } : {}) },
    );
    let lastError: unknown;
    for (const field of fields) {
      try {
        const value = await this.executeCommandWith(field, sessionId, line, parts);
        this.commandAttachmentsField = field;
        const matched = value !== undefined;
        if (!matched || !value.result || typeof value.result.kind !== "string") return { matched };
        return {
          matched,
          execution: {
            commandId: typeof value.commandId === "string" ? value.commandId : undefined,
            result: {
              kind: value.result.kind === "error" ? "error" : "success",
              ...(typeof value.result.text === "string" ? { text: value.result.text } : {}),
            },
          },
        };
      } catch (error) {
        if (!this.isArgumentNameMismatch(error) || fields.length === 1) throw error;
        console.warn(`[dsh] commands/execute rejected "${field}", retrying with the other attachment parameter name:`, error);
        lastError = error;
      }
    }
    throw lastError ?? new Error("commands/execute failed");
  }

  /** 以指定附件参数名实际发起一次 commands/execute。 */
  private async executeCommandWith(
    field: "submittedAttachments" | "images",
    sessionId: string,
    line: string,
    parts: unknown[],
  ): Promise<{ commandId?: string; result?: { kind?: string; text?: string } } | undefined> {
    const endpoint = "commands/execute";
    const args: Record<string, unknown> = { agentId: sessionId, line, [field]: parts };
    const message: ClientRequest = {
      type: "client-request",
      rpcId: randomUUID(),
      method: endpoint,
      payload: { args },
    };
    const res = await fetch(`${this.baseUrl}/api/${endpoint}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(message),
      // 命令是同步 RPC:handler 结束才返回。/compact 在宿主端跑完整轮摘要
      // (实测 1400 条历史的压缩耗时 ~27s,更大的会话更久),因此给足 10 分钟;
      // 期间进度由 command/run → compaction/* → command/done 事件驱动界面。
      signal: AbortSignal.timeout(600_000),
    });
    if (res.status === 401 || res.status === 403) {
      await this.ensureAuth(true);
      return this.executeCommandWith(field, sessionId, line, parts);
    }
    if (!res.ok) throw new Error(`DSH transport failure for commands/execute: HTTP ${res.status}`);
    const full = (await res.json()) as {
      type?: string;
      rpcId?: string;
      result?: { ok: boolean; value?: unknown; error?: { code: string; message: string } };
    };
    if (full.type !== "server-response" || full.rpcId !== message.rpcId || !full.result) {
      throw new Error(`DSH unexpected envelope for commands/execute`);
    }
    if (!full.result.ok) {
      throw new DshApiError(full.result.error?.code ?? "command-error", full.result.error?.message ?? "commands/execute failed");
    }
    return full.result.value as { commandId?: string; result?: { kind?: string; text?: string } } | undefined;
  }

  /** 列出某会话可用的宿主命令;同时返回声明接受附件的命令集合(0.1.5=attachments / 0.1.2=images)。 */
  async listCommands(sessionId: string): Promise<{ names: string[]; imagesSupported: boolean; attachmentCommands: Set<string> }> {
    const endpoint = "commands/list";
    const message: ClientRequest = {
      type: "client-request",
      rpcId: randomUUID(),
      method: endpoint,
      payload: { args: { agentId: sessionId } },
    };
    const res = await fetch(`${this.baseUrl}/api/${endpoint}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`DSH transport failure for commands/list: HTTP ${res.status}`);
    const full = (await res.json()) as {
      type?: string;
      rpcId?: string;
      result?: { ok: boolean; value?: unknown; error?: { code: string; message: string } };
    };
    if (full.type !== "server-response" || full.rpcId !== message.rpcId || !full.result || !full.result.ok) {
      throw new Error(`DSH unexpected response for commands/list`);
    }
    // 0.1.5-rc.1 描述符为 input.attachments;0.1.2-rc.1 为 input.images(两者含义相同)
    const value = full.result.value as { name?: string; input?: { images?: boolean; attachments?: boolean } }[] | undefined;
    const rows = value ?? [];
    const attachmentCommands = new Set<string>();
    for (const row of rows) {
      const name = String(row.name ?? "").toLowerCase();
      if (name && (row.input?.attachments === true || row.input?.images === true)) attachmentCommands.add(name);
    }
    this.commandImagesCapability = attachmentCommands.size > 0;
    return { names: rows.map((d) => String(d.name ?? "")).filter(Boolean), imagesSupported: this.commandImagesCapability, attachmentCommands };
  }

  cancelSession(sessionId: string) {
    return this.request<{ accepted: true }>("session/cancel", { request: { sessionId } });
  }
  updateQueue(sessionId: string, itemId: string, action: { kind: "edit"; content: unknown[] } | { kind: "remove" } | { kind: "steer" }) {
    return this.request<{ accepted: true }>("session/updateQueue", { request: { sessionId, itemId, action } });
  }
  renameSession(sessionId: string, title: string) {
    return this.request<{ title: string; seq: number }>("session/rename", { request: { sessionId, title } });
  }
  forkSession(sessionId: string, atSeq?: number) {
    return this.request<{ sessionId: string }>("session/fork", { request: { sessionId, ...(atSeq === undefined ? {} : { atSeq }) } });
  }
  archiveSession(sessionId: string) {
    return this.request<{ archivedSessionIds: string[] }>("workspace/archiveSession", { request: { sessionId } });
  }
  /**
   * 取消归档(0.1.7 新增端点;旧宿主不存在 → 调用方忽略错误)。
   * 0.1.7 起「已归档会话」的回合会立刻以 reason.kind = "blocked" 结束,
   * 因此向归档会话发消息前必须先取消归档,否则模型不会被调用。
   */
  unarchiveSession(sessionId: string) {
    return this.request<{ archivedSessionIds: string[] }>("workspace/unarchiveSession", { request: { sessionId } });
  }

  /** 0.1.2 起模型目录统一在 session/modelCatalog(= 旧 session.models + llm.models);
   *  服务器返回 {default, routableProviders, groups, failures},映射回扩展的 {current, routable,…} 视图。 */
  async sessionModels(_sessionId: string) {
    const catalog = await this.request<{
      default: { provider: string; model: string; reasoningEffort?: string };
      routableProviders: string[];
      groups: SessionModelsValue["groups"];
      failures: SessionModelsValue["failures"];
    }>("session/modelCatalog", {});
    return {
      current: catalog.default,
      routable: catalog.routableProviders.length > 0,
      groups: catalog.groups,
      failures: catalog.failures,
    } as SessionModelsValue;
  }

  selectModel(sessionId: string, provider: string, model: string, reasoningEffort?: string) {
    return this.request<{ selected: { provider: string; model: string; reasoningEffort?: string } }>("session/selectModel", {
      request: {
        sessionId,
        provider,
        model,
        ...(reasoningEffort ? { reasoningEffort } : {}),
      },
    });
  }

  // ---------- 工作区(列表改由 workspace/follow 流;此处仅保留变更类端点) ----------

  createWorkspace(path: string) {
    return this.request<{ workspace: WorkspaceItem; created: boolean }>("workspace/create", { request: { path } });
  }
  renameWorkspace(workspaceId: string, title: string) {
    return this.request<{ workspace: WorkspaceItem }>("workspace/rename", { request: { workspaceId, title } });
  }
  deleteWorkspace(workspaceId: string) {
    return this.request<{ deleted: true }>("workspace/delete", { request: { workspaceId } });
  }
  moveWorkspace(workspaceId: string, beforeWorkspaceId?: string) {
    return this.request<{ workspaceIds: string[] }>("workspace/insertBefore", {
      request: {
        workspaceId,
        ...(beforeWorkspaceId ? { beforeWorkspaceId } : {}),
      },
    });
  }
  moveSessionInWorkspace(workspaceId: string, sessionId: string, beforeSessionId?: string) {
    return this.request<{ workspace: WorkspaceItem }>("workspace/insertSessionBefore", {
      request: {
        workspaceId,
        sessionId,
        ...(beforeSessionId ? { beforeSessionId } : {}),
      },
    });
  }

  // ---------- 预设作者(agentPresets.*:0.1.2 端点改名 + 返回类型调整) ----------

  /**
   * 预设作者能力探测:settings/canOpenAgentPresetDirectory 是 0.1.5-rc.1 及更早独有的
   * 作者端点族标志;0.1.7-rc.2 起该族(copy / deletePreset / openAgentPresetDirectory)
   * 整体移除,预设改为由 Cordis 组合声明。失败即视为不支持(缓存,只探一次)。
   */
  private presetAuthoring: boolean | undefined;

  async probePresetAuthoring(): Promise<boolean> {
    if (this.presetAuthoring !== undefined) return this.presetAuthoring;
    try {
      const canOpen = await this.request<boolean>("settings/canOpenAgentPresetDirectory", {}, 10_000);
      this.presetAuthoring = typeof canOpen === "boolean" ? canOpen : false;
    } catch {
      this.presetAuthoring = false;
    }
    return this.presetAuthoring;
  }

  listAgentPresets() {
    return this.request<AgentPresetListValue>("agentPresets/list", {});
  }
  async selectAgentPreset(sessionId: string, agentPreset: string) {
    const picked = await this.request<string>("agentPresets/select", { agentId: sessionId, agentPreset });
    return { agentPreset: picked };
  }
  readAgentPreset(agentPreset: string) {
    return this.request<AgentPresetReadValue>("agentPresets/read", { agentPreset });
  }
  async copyAgentPreset(from: string, agentPreset: string, name?: string) {
    await this.request<void>("agentPresets/copy", { from, id: agentPreset, ...(name ? { name } : {}) });
    return { agentPreset };
  }
  async openAgentPresetDocument(agentPreset: string) {
    return this.request<{ opened: boolean; path?: string }>("settings/openAgentPresetDirectory", { agentPreset });
  }
  async removeAgentPreset(agentPreset: string) {
    await this.request<void>("agentPresets/deletePreset", { id: agentPreset });
    return {};
  }

  // ---------- goals(0.1.2:goals/*,payload {agentId, ref, request}) ----------

  goalCreate(sessionId: string, objective: string, maxGoalRounds?: number) {
    return this.request<CreateGoalResult>("goals/create", {
      agentId: sessionId,
      request: { objective, ...(maxGoalRounds !== undefined ? { maxGoalRounds } : {}) },
    });
  }
  goalEdit(sessionId: string, ref: GoalRef, objective?: string) {
    return this.request<unknown>("goals/edit", {
      agentId: sessionId,
      ref,
      request: { ...(objective !== undefined ? { objective } : {}) },
    });
  }
  goalResume(sessionId: string, ref: GoalRef) {
    return this.request<unknown>("goals/resume", { agentId: sessionId, ref });
  }
  goalPause(sessionId: string, ref: GoalRef) {
    return this.request<unknown>("goals/pause", { agentId: sessionId, ref });
  }
  goalComplete(sessionId: string, ref: GoalRef) {
    return this.request<unknown>("goals/complete", { agentId: sessionId, ref });
  }
  goalClear(sessionId: string, ref: GoalRef) {
    return this.request<{ ref: GoalRef }>("goals/clear", { agentId: sessionId, ref });
  }

  // ---------- skills / subagents(0.1.2 端点改名;history 并入 session/page) ----------

  listSkills(sessionId: string) {
    return this.request<{ skills: { name: string; description: string; whenToUse?: string; modelInvocable: boolean; source?: string }[] }>(
      "skills/list",
      { request: { sessionId } },
    );
  }
  listSubagents(parentSessionId: string) {
    return this.request<{ entries: SubagentEntry[]; parentAvailable: boolean }>("subagents/list", { parentSessionId });
  }
  /** 0.1.2 起子代理历史 = session/page + subagent 地址。 */
  subagentHistory(parentSessionId: string, childSessionId: string, mode: "one-shot" | "continuable", throughSeq: number, beforeSeq?: number, maxMessages?: number) {
    return this.request<SessionHistoryValue>("session/page", {
      request: {
        address: { kind: "subagent", parentSessionId, childSessionId, mode },
        throughSeq,
        ...(beforeSeq !== undefined ? { beforeSeq } : {}),
        ...(maxMessages !== undefined ? { maxMessages } : {}),
      },
    });
  }
  /**
   * 给可继续对话的子代理补发消息。
   * 0.1.5-rc.1 起 delivery 为必填(队列/插话语义);旧版服务器没有该字段,
   * 若网关按描述符拒绝则去掉 delivey 重试一次。
   */
  async subagentPrompt(parentSessionId: string, childSessionId: string, text: string, delivery: "queue" | "steer" = "queue") {
    const payload = {
      requestId: randomUUID(),
      parentSessionId,
      childSessionId,
      mode: "continuable" as const,
      content: [{ type: "text" as const, text }],
    };
    try {
      return await this.request<SubagentPromptReceipt>("subagents/prompt", { request: { ...payload, delivery } });
    } catch (error) {
      if (!this.isArgumentNameMismatch(error)) throw error;
      console.warn("[dsh] subagents/prompt rejected delivery, retrying without it (pre-0.1.5 server):", error);
      return this.request<SubagentPromptReceipt>("subagents/prompt", { request: payload });
    }
  }
  subagentInterrupt(parentSessionId: string, childSessionId: string) {
    return this.request<{ accepted: true }>("subagents/interruptByParent", {
      childSessionId,
      parentSessionId,
      mode: "continuable",
    });
  }

  // ---------- 定时任务(0.1.7 新增 schedule/*;未启用定时任务插件的宿主返回 gateway/method-unavailable) ----------

  /** 某会话内的任务列表(不激活 Agent)。 */
  scheduleList(sessionId: string) {
    return this.request<ScheduleRecord[]>("schedule/list", { sessionId });
  }
  /** 全进程保留任务目录(带绑定会话与状态),对应网页端「自动化任务」页。 */
  scheduleCatalog() {
    return this.request<ScheduleCatalogEntry[]>("schedule/catalog", {});
  }
  /** 删除任务(按原会话绑定);已不存在时返回 deleted:false,不抛错。 */
  scheduleDelete(sessionId: string, id: string) {
    return this.request<ScheduleDeleteValue>("schedule/delete", { sessionId, id });
  }
  /** 某任务的运行记录(新→旧分页,limit 1-100)。 */
  scheduleHistory(request: ScheduleHistoryRequest) {
    return this.request<ScheduleHistoryValue>("schedule/history", { ...request });
  }

  // ---------- 逐消息反馈(0.1.7 新增 messageFeedback/*;put 以 ifVersion 做 CAS) ----------

  /** 读取一个会话当前的逐消息反馈(按首次创建顺序)。 */
  messageFeedbackList(sessionId: string) {
    return this.request<MessageFeedbackListResult>("messageFeedback/list", { request: { sessionId } });
  }
  /** 创建或替换一条消息反馈;ifVersion=null 表示要求当前不存在。 */
  messageFeedbackPut(
    sessionId: string,
    messageId: string,
    rating: MessageFeedbackRating,
    ifVersion: string | null,
    extra?: { note?: string; category?: FeedbackCategory },
  ) {
    return this.request<MessageFeedbackPutResult>("messageFeedback/put", {
      request: {
        sessionId,
        messageId,
        rating,
        ifVersion,
        ...(extra?.note !== undefined ? { note: extra.note } : {}),
        ...(extra?.category !== undefined ? { category: extra.category } : {}),
      },
    });
  }
  /** 删除一条消息反馈(需要观测到的 version;已不存在时幂等成功)。 */
  messageFeedbackDelete(sessionId: string, messageId: string, ifVersion: string) {
    return this.request<MessageFeedbackDeleteResult>("messageFeedback/delete", { request: { sessionId, messageId, ifVersion } });
  }
  /** 会话级反馈(取代 /feedback 命令;文本可为空)。 */
  recordSessionFeedback(sessionId: string, entry: { text?: string; category?: FeedbackCategory } = {}) {
    return this.request<SessionFeedbackRecordResult>("sessionFeedback/record", {
      request: { sessionId, ...(entry.text ? { text: entry.text } : {}), ...(entry.category ? { category: entry.category } : {}) },
    });
  }

  // ---------- 权限预设目录(进程级;0.1.5 起可用) ----------

  /** 进程级权限预设目录(可选项 + 新会话默认值),与 permissions 投影配合使用。 */
  permissionPresetsCatalog() {
    return this.request<PermissionCatalog>("permissionPresets/catalog", {});
  }

  // ---------- 设置 / 凭据 / LLM 目录 ----------

  settingsDescribe() {
    return this.request<SettingsDescribeValue>("settings/describe", {}, 60_000);
  }
  async settingsOpenDocument() {
    await this.request<{ opened: true }>("settings/openSettingsDocument", {}, 60_000);
    return { opened: true as const };
  }
  settingsUpdate(ns: string, patch: object, expectedRevision?: number) {
    return this.request<SettingsNamespaceView>("settings/update", { ns, patch, ...(expectedRevision !== undefined ? { expectedRevision } : {}) }, 60_000);
  }
  settingsReplace(ns: string, section: object, expectedRevision?: number) {
    return this.request<SettingsNamespaceView>("settings/replace", { ns, section, ...(expectedRevision !== undefined ? { expectedRevision } : {}) }, 60_000);
  }
  settingsMutate(ns: string, ops: SettingsPathOpView[], expectedRevision?: number) {
    return this.request<SettingsNamespaceView>("settings/mutate", { ns, ops, ...(expectedRevision !== undefined ? { expectedRevision } : {}) }, 60_000);
  }
  /** 0.1.2 起 credentials/describe 直接返回 {ref: CredentialInfo} 记录(无 credentials 包装)。 */
  credentialsDescribe(refs: string[]) {
    return this.request<Record<string, CredentialView>>("credentials/describe", { refs });
  }
  async credentialsSet(ref: string, value: string) {
    await this.request<void>("credentials/set", { ref, value });
    return {};
  }
  async credentialsUnset(ref: string) {
    await this.request<void>("credentials/unset", { ref });
    return {};
  }
  /** 0.1.2 llm.providers → llm/listProviders(仅活跃路由: {id,name})。 */
  async llmProviders() {
    const rows = await this.request<{ id: string; name: string }[]>("llm/listProviders", {}, 60_000);
    return { providers: rows.map((r) => ({ provider: r.id, displayName: r.name, settingsNs: "", settingsPath: [], active: true } as ConfigurableProviderView)) };
  }
  /** 0.1.2 起 llm.models 并入 session/modelCatalog。 */
  llmModels() {
    return this.request<{ groups: SessionModelsValue["groups"]; failures: SessionModelsValue["failures"] }>("session/modelCatalog", {}, 60_000);
  }
  llmDiscoverModels(payload: { settingsNs: string; provider?: string; baseURL?: string; api?: string; apiKey?: string }) {
    const { settingsNs, ...request } = payload;
    return this.request<{ models: DiscoveredModelView[] }>(
      "llm/discoverModels",
      { settingsNs, request: { ...(request.provider !== undefined ? { provider: request.provider } : {}), ...(request.baseURL !== undefined ? { baseURL: request.baseURL } : {}), ...(request.api !== undefined ? { api: request.api } : {}), ...(request.apiKey !== undefined ? { apiKey: request.apiKey } : {}) } },
      60_000,
    );
  }

  // ---------- @ 引用(rc.8 网页端 @ 菜单同款;0.1.2 契约不变) ----------

  /** @ 文件/文件夹候选(相对会话 cwd;kind: file | directory)。 */
  fileReferenceList(agentId: string, query: string) {
    return this.request<{ path: string; kind: "file" | "directory" }[]>("fileReferences/list", { agentId, query });
  }

  /** @ Session 候选(含可直接插入草稿的 markdown 提及)。 */
  sessionReferenceCandidates(agentId: string, query: string) {
    return this.request<
      { sessionId: string; label: string; cwd?: string; createdAt: number; mention: string }[]
    >("sessionReferenceResolver/candidates", { agentId, query });
  }

  // ---------- Cordis 动态插件(dynamicCordisRunner remote;端点与参数名 0.1.2 不变) ----------

  cordisInventory() {
    return this.request<CordisPluginRow[]>("dynamicCordisRunner/inventory", {});
  }

  cordisRunHostHalf(args: {
    agentId: string;
    pluginId: string;
    packageId: string;
    mode: "run" | "update";
    requestId: string | null;
    approveFutureVersions: boolean;
  }) {
    return this.request<CordisRunHostHalfResult>("dynamicCordisRunner/runHostHalf", args, 60_000);
  }

  cordisResolveRequestRun(requestId: string, resolution: CordisRunResolution) {
    return this.request<{ accepted: boolean }>("dynamicCordisRunner/resolveRequestRun", { requestId, resolution });
  }

  cordisSettleUserRun(agentId: string, pluginId: string, resolution: CordisRunResolution) {
    return this.request<CordisRunHostHalfResult>("dynamicCordisRunner/settleUserRun", { agentId, pluginId, resolution });
  }

  cordisStopFromPanel(agentId: string, pluginId: string) {
    return this.request<CordisStopResult>("dynamicCordisRunner/stopFromPanel", { agentId, pluginId });
  }

  cordisUndefineFromPanel(agentId: string, pluginId: string) {
    return this.request<CordisUndefineResult>("dynamicCordisRunner/undefineFromPanel", { agentId, pluginId });
  }

  // ---------- 旧版帧入口保留(兼容外部调用;0.1.2 不再有 events.mux/host,由 hub 改为新流) ----------

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.cookie) headers.cookie = this.cookie;
    return headers;
  }

  connectLegacyMux() {
    // 0.1.2 起不存在 events.mux:直接启动 remote.mux 以提供等价流
    this.connectMux();
  }

  dispose() {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try {
      const ws = this.ws;
      this.ws = undefined;
      ws?.removeAllListeners();
      ws?.close();
    } catch {}
    this.streams.clear();
  }
}
