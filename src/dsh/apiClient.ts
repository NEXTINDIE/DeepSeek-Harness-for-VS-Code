import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import type {
  AgentPresetListValue,
  AgentPresetOpenDocumentValue,
  AgentPresetReadValue,
  ApprovalAnswer,
  ClientRequest,
  CommandExecutionView,
  ConfigurableProviderView,
  CredentialView,
  DiscoveredModelView,
  HostFrame,
  HostDescribeValue,
  MuxFrame,
  PromptContentPart,
  QuestionAnswer,
  SessionAttachmentValue,
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
  SubagentEntry,
  SubagentPromptReceipt,
  WorkspaceItem,
  WorkspaceListValue,
} from "./types";

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

interface ServerResponse {
  type: "server-response";
  rpcId: string;
  result: { ok: true; value: any } | { ok: false; error: { code: string; message: string; details?: unknown } };
}

interface ServerRequest {
  type: "server-request";
  rpcId: string;
  method: string;
  payload: any;
}

export interface FrameEnvelope<F> {
  rpcId: string;
  frame: F;
}

export type ConnectionState = "disconnected" | "connecting" | "connected";

/** DSH Web API 客户端:unary RPC + 双 WebSocket 事件流 + 自动重连。 */
export class DshApiClient {
  readonly baseUrl: string;
  private wsMux: WebSocket | undefined;
  private wsHost: WebSocket | undefined;
  private disposed = false;
  private reconnectTimerMux: NodeJS.Timeout | undefined;
  private reconnectTimerHost: NodeJS.Timeout | undefined;
  private retryDelayMux = 1000;
  private retryDelayHost = 1000;
  private muxOnFrame: ((env: FrameEnvelope<MuxFrame>) => void) | undefined;
  private hostOnFrame: ((env: FrameEnvelope<HostFrame>) => void) | undefined;
  private onState: ((which: "mux" | "host", state: ConnectionState) => void) | undefined;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  setFrameHandlers(handlers: {
    onMuxFrame: (env: FrameEnvelope<MuxFrame>) => void;
    onHostFrame: (env: FrameEnvelope<HostFrame>) => void;
    onState?: (which: "mux" | "host", state: ConnectionState) => void;
  }) {
    this.muxOnFrame = handlers.onMuxFrame;
    this.hostOnFrame = handlers.onHostFrame;
    this.onState = handlers.onState;
    this.connectMux();
    this.connectHost();
  }

  // ---------- unary RPC ----------

  private async post<T>(method: string, payload: unknown, timeoutMs = 30_000): Promise<T> {
    const message: ClientRequest = { type: "client-request", rpcId: randomUUID(), method, payload };
    const res = await fetch(`${this.baseUrl}/api/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`DSH transport failure for ${method}: HTTP ${res.status}`);
    const full = (await res.json()) as ServerResponse;
    if (full.rpcId !== message.rpcId) throw new Error(`DSH rpcId mismatch for ${method}`);
    if (!full.result.ok) {
      throw new DshApiError(full.result.error.code, full.result.error.message, full.result.error.details);
    }
    return full.result.value as T;
  }

  async ping(timeoutMs = 3000): Promise<HostDescribeValue | undefined> {
    try {
      return await this.post<HostDescribeValue>("host.describe", {}, timeoutMs);
    } catch {
      return undefined;
    }
  }

  // 会话域
  listSessions() {
    return this.post<SessionListValue>("session.list", {});
  }
  searchSessions(query: string) {
    return this.post<SessionSearchValue>("session.search", { query });
  }
  readAttachment(sessionId: string, attachmentId: string) {
    return this.post<SessionAttachmentValue>("session.attachment", { sessionId, attachmentId });
  }
  createSession(payload: SessionCreateRequest) {
    return this.post<SessionCreateValue>("session.create", payload);
  }
  sessionHistory(payload: SessionHistoryRequest) {
    return this.post<SessionHistoryValue>("session.history", payload);
  }
  sendPrompt(payload: SessionPromptRequest) {
    return this.post<SessionPromptValue>("session.prompt", payload, 60_000);
  }
  sendPromptParts(sessionId: string, mode: "queue" | "steer", content: PromptContentPart[]) {
    return this.post<SessionPromptValue>("session.prompt", { sessionId, mode, content }, 60_000);
  }

  /**
   * 会话级斜杠命令执行(与网页端 live.command() 完全一致的通道):
   * 连接 RPC 端点为斜杠形式 /api/commands/execute(点号形式会 404),
   * 信封 {type:"client-request", rpcId, method:"commands/execute",
   * payload:{args:{agentId, line}}},响应为标准 server-response 信封;
   * result.value === undefined 表示未匹配任何命令。
   * result.value 是 CommandExecution { commandId, result: {kind, text?} } ——
   * 命令的结果文本(如 /rollback 的回退摘要)随返回值透传给界面展示。
   */
  async executeCommand(
    sessionId: string,
    line: string,
  ): Promise<{ matched: boolean; execution?: CommandExecutionView }> {
    const endpoint = "commands/execute";
    const message: ClientRequest = {
      type: "client-request",
      rpcId: randomUUID(),
      method: endpoint,
      payload: { args: { agentId: sessionId, line } },
    };
    const res = await fetch(`${this.baseUrl}/api/${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(30_000),
    });
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
    const value = full.result.value as
      | { commandId?: string; result?: { kind?: string; text?: string } }
      | undefined;
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
  }

  /**
   * 列出某会话可用的宿主命令名(网页端 ui-commands 目录同款通道 /api/commands/list)。
   * 用于区分宿主命令与技能 token(/skill-name 走普通 prompt,由宿主 pre-step 注入)。
   */
  async listCommands(sessionId: string): Promise<string[]> {
    const endpoint = "commands/list";
    const message: ClientRequest = {
      type: "client-request",
      rpcId: randomUUID(),
      method: endpoint,
      payload: { args: { agentId: sessionId } },
    };
    const res = await fetch(`${this.baseUrl}/api/${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
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
    const value = full.result.value as { name?: string }[] | undefined;
    return (value ?? []).map((d) => String(d.name ?? "")).filter(Boolean);
  }
  cancelSession(sessionId: string) {
    return this.post<{ accepted: true }>("session.cancel", { sessionId });
  }
  updateQueue(sessionId: string, itemId: string, action: { kind: "edit"; content: unknown[] } | { kind: "remove" } | { kind: "steer" }) {
    return this.post<{ accepted: true }>("session.updateQueue", { sessionId, itemId, action });
  }
  renameSession(sessionId: string, title: string) {
    return this.post<{ title: string; seq: number }>("session.rename", { sessionId, title });
  }
  forkSession(sessionId: string, atSeq?: number) {
    return this.post<{ sessionId: string }>("session.fork", { sessionId, ...(atSeq === undefined ? {} : { atSeq }) });
  }
  archiveSession(sessionId: string) {
    return this.post<{ archivedSessionIds: string[] }>("workspace.archiveSession", { sessionId });
  }

  // 工作区管理
  listWorkspaces() {
    return this.post<WorkspaceListValue>("workspace.list", {});
  }
  createWorkspace(path: string) {
    return this.post<{ workspace: WorkspaceItem; created: boolean }>("workspace.create", { path });
  }
  renameWorkspace(workspaceId: string, title: string) {
    return this.post<{ workspace: WorkspaceItem }>("workspace.rename", { workspaceId, title });
  }
  deleteWorkspace(workspaceId: string) {
    return this.post<{ deleted: true }>("workspace.delete", { workspaceId });
  }
  moveWorkspace(workspaceId: string, beforeWorkspaceId?: string) {
    return this.post<{ workspaceIds: string[] }>("workspace.insertBefore", {
      workspaceId,
      ...(beforeWorkspaceId ? { beforeWorkspaceId } : {}),
    });
  }
  moveSessionInWorkspace(workspaceId: string, sessionId: string, beforeSessionId?: string) {
    return this.post<{ workspace: WorkspaceItem }>("workspace.insertSessionBefore", {
      workspaceId,
      sessionId,
      ...(beforeSessionId ? { beforeSessionId } : {}),
    });
  }
  sessionModels(sessionId: string) {
    return this.post<SessionModelsValue>("session.models", { sessionId });
  }
  selectModel(sessionId: string, provider: string, model: string, reasoningEffort?: string) {
    return this.post<{ selected: unknown }>("session.selectModel", {
      sessionId,
      provider,
      model,
      ...(reasoningEffort ? { reasoningEffort } : {}),
    });
  }

  listAgentPresets() {
    return this.post<AgentPresetListValue>("agentPreset.list", {});
  }
  selectAgentPreset(sessionId: string, agentPreset: string) {
    return this.post<{ agentPreset: string }>("agentPreset.select", { sessionId, agentPreset });
  }
  // 预设作者:读取组合 / 复制 / 打开目录 / 删除
  readAgentPreset(agentPreset: string) {
    return this.post<AgentPresetReadValue>("agentPreset.read", { agentPreset });
  }
  copyAgentPreset(from: string, agentPreset: string, name?: string) {
    return this.post<{ agentPreset: string }>("agentPreset.copy", { from, agentPreset, ...(name ? { name } : {}) });
  }
  openAgentPresetDocument(agentPreset: string) {
    return this.post<AgentPresetOpenDocumentValue>("agentPreset.openDocument", { agentPreset });
  }
  removeAgentPreset(agentPreset: string) {
    return this.post<Record<string, never>>("agentPreset.remove", { agentPreset });
  }

  // goals
  goalCreate(sessionId: string, objective: string, maxGoalRounds?: number) {
    return this.post<{ ref: { id: string; revision: number } }>("goal.create", {
      sessionId,
      objective,
      ...(maxGoalRounds !== undefined ? { maxGoalRounds } : {}),
    });
  }
  goalEdit(sessionId: string, ref: { id: string; revision: number }, objective?: string) {
    return this.post<unknown>("goal.edit", { sessionId, ref, ...(objective !== undefined ? { objective } : {}) });
  }
  goalResume(sessionId: string, ref: { id: string; revision: number }) {
    return this.post<unknown>("goal.resume", { sessionId, ref });
  }
  goalPause(sessionId: string, ref: { id: string; revision: number }) {
    return this.post<unknown>("goal.pause", { sessionId, ref });
  }
  goalComplete(sessionId: string, ref: { id: string; revision: number }) {
    return this.post<unknown>("goal.complete", { sessionId, ref });
  }
  goalClear(sessionId: string, ref: { id: string; revision: number }) {
    return this.post<{ cleared: true }>("goal.clear", { sessionId, ref });
  }

  // skills / subagents
  listSkills(sessionId: string) {
    return this.post<{ skills: { name: string; description: string; whenToUse?: string; modelInvocable: boolean }[] }>("skill.list", { sessionId });
  }
  listSubagents(parentSessionId: string) {
    return this.post<{ entries: SubagentEntry[]; parentAvailable: boolean }>("subagent.list", { parentSessionId });
  }
  subagentHistory(parentSessionId: string, childSessionId: string, mode: "one-shot" | "continuable", beforeSeq?: number, maxMessages?: number) {
    return this.post<{ events: { event: { type: string; seq: number; time: number; data: any }; view?: unknown }[]; hasMore: boolean }>(
      "subagent.history",
      {
        parentSessionId,
        childSessionId,
        mode,
        ...(beforeSeq !== undefined ? { beforeSeq } : {}),
        ...(maxMessages !== undefined ? { maxMessages } : {}),
      },
    );
  }
  subagentPrompt(parentSessionId: string, childSessionId: string, text: string) {
    return this.post<SubagentPromptReceipt>("subagent.prompt", {
      parentSessionId,
      childSessionId,
      mode: "continuable",
      content: [{ type: "text", text }],
    });
  }
  subagentInterrupt(parentSessionId: string, childSessionId: string) {
    return this.post<{ accepted: true }>("subagent.interrupt", {
      parentSessionId,
      childSessionId,
      mode: "continuable",
    });
  }

  // ---------- 设置 / 凭据 / LLM 目录 ----------

  settingsDescribe() {
    return this.post<SettingsDescribeValue>("settings.describe", {}, 60_000);
  }
  settingsOpenDocument() {
    return this.post<{ opened: true }>("settings.openDocument", {});
  }
  settingsUpdate(ns: string, patch: object, expectedRevision?: number) {
    return this.post<SettingsNamespaceView>("settings.update", { ns, patch, ...(expectedRevision !== undefined ? { expectedRevision } : {}) }, 60_000);
  }
  settingsReplace(ns: string, section: object, expectedRevision?: number) {
    return this.post<SettingsNamespaceView>("settings.replace", { ns, section, ...(expectedRevision !== undefined ? { expectedRevision } : {}) }, 60_000);
  }
  settingsMutate(ns: string, ops: SettingsPathOpView[], expectedRevision?: number) {
    return this.post<SettingsNamespaceView>("settings.mutate", { ns, ops, ...(expectedRevision !== undefined ? { expectedRevision } : {}) }, 60_000);
  }
  credentialsDescribe(refs: string[]) {
    return this.post<{ credentials: Record<string, CredentialView> }>("credentials.describe", { refs });
  }
  credentialsSet(ref: string, value: string) {
    return this.post<Record<string, never>>("credentials.set", { ref, value });
  }
  credentialsUnset(ref: string) {
    return this.post<Record<string, never>>("credentials.unset", { ref });
  }
  llmProviders() {
    return this.post<{ providers: ConfigurableProviderView[] }>("llm.providers", {}, 60_000);
  }
  llmModels() {
    return this.post<{ groups: SessionModelsValue["groups"]; failures: SessionModelsValue["failures"] }>("llm.models", {}, 60_000);
  }
  llmDiscoverModels(payload: { settingsNs: string; provider?: string; baseURL?: string; api?: string; apiKey?: string }) {
    return this.post<{ models: DiscoveredModelView[] }>("llm.discoverModels", payload, 60_000);
  }

  // ---------- /api/respond ----------

  async respond(answer: ApprovalAnswer | QuestionAnswer, frameRpcId: string): Promise<{ accepted: boolean }> {
    const res = await fetch(`${this.baseUrl}/api/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "client-response",
        rpcId: frameRpcId,
        result: { ok: true, value: answer },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`DSH transport failure for /api/respond: HTTP ${res.status}`);
    const receipt = (await res.json()) as { accepted: boolean; reason?: string };
    if (!receipt.accepted) throw new Error(`DSH respond rejected: ${receipt.reason ?? "unknown"}`);
    return receipt;
  }

  respondApproval(sessionId: string, approvalId: string, outcome: "allowed-once" | "rejected", frameRpcId: string) {
    return this.respond({ sessionId, approvalId, outcome }, frameRpcId);
  }

  respondQuestion(sessionId: string, answer: QuestionAnswer["answer"], frameRpcId: string) {
    return this.respond({ sessionId, answer }, frameRpcId);
  }

  /** 取消提问/计划审批(网页端 pending.cancel 同款:错误信封 code=cancelled)。 */
  async cancelQuestion(frameRpcId: string): Promise<{ accepted: boolean }> {
    const res = await fetch(`${this.baseUrl}/api/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "client-response",
        rpcId: frameRpcId,
        result: { ok: false, error: { code: "cancelled", message: "user cancelled the question" } },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`DSH transport failure for /api/respond: HTTP ${res.status}`);
    const receipt = (await res.json()) as { accepted: boolean; reason?: string };
    if (!receipt.accepted) throw new Error(`DSH respond rejected: ${receipt.reason ?? "unknown"}`);
    return receipt;
  }

  // ---------- WebSocket 事件流 ----------

  private wsUrl(path: string): string {
    const u = new URL(this.baseUrl);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = path;
    return u.toString();
  }

  private connectMux() {
    if (this.disposed || this.wsMux !== undefined || !this.muxOnFrame) return;
    this.onState?.("mux", "connecting");
    const ws = new WebSocket(this.wsUrl("/api/events.mux"), { handshakeTimeout: 5000 });
    this.wsMux = ws;
    ws.on("open", () => {
      this.retryDelayMux = 1000;
      this.onState?.("mux", "connected");
    });
    ws.on("message", (data) => {
      try {
        const full = JSON.parse(data.toString()) as ServerRequest;
        if (full.type === "server-request") this.muxOnFrame?.({ rpcId: full.rpcId, frame: full.payload as MuxFrame });
      } catch {
        // 丢弃损坏帧(与官方客户端行为一致)
      }
    });
    ws.on("error", () => {});
    ws.on("close", () => {
      if (this.wsMux === ws) this.wsMux = undefined;
      if (this.disposed) return;
      this.onState?.("mux", "disconnected");
      const delay = this.retryDelayMux;
      this.retryDelayMux = Math.min(delay * 2, 15_000);
      this.reconnectTimerMux = setTimeout(() => this.connectMux(), delay);
    });
  }

  private connectHost() {
    if (this.disposed || this.wsHost !== undefined || !this.hostOnFrame) return;
    this.onState?.("host", "connecting");
    const ws = new WebSocket(this.wsUrl("/api/events.host"), { handshakeTimeout: 5000 });
    this.wsHost = ws;
    ws.on("open", () => {
      this.retryDelayHost = 1000;
      this.onState?.("host", "connected");
    });
    ws.on("message", (data) => {
      try {
        const full = JSON.parse(data.toString()) as ServerRequest;
        if (full.type === "server-request") this.hostOnFrame?.({ rpcId: full.rpcId, frame: full.payload as HostFrame });
      } catch {
        // 丢弃损坏帧
      }
    });
    ws.on("error", () => {});
    ws.on("close", () => {
      if (this.wsHost === ws) this.wsHost = undefined;
      if (this.disposed) return;
      this.onState?.("host", "disconnected");
      const delay = this.retryDelayHost;
      this.retryDelayHost = Math.min(delay * 2, 15_000);
      this.reconnectTimerHost = setTimeout(() => this.connectHost(), delay);
    });
  }

  dispose() {
    this.disposed = true;
    if (this.reconnectTimerMux) clearTimeout(this.reconnectTimerMux);
    if (this.reconnectTimerHost) clearTimeout(this.reconnectTimerHost);
    try {
      this.wsMux?.removeAllListeners();
      this.wsMux?.close();
    } catch {}
    try {
      this.wsHost?.removeAllListeners();
      this.wsHost?.close();
    } catch {}
    this.wsMux = undefined;
    this.wsHost = undefined;
  }
}
