/**
 * DSH Web API 的 wire 类型(与 @deepseek-ai/dsh-host-apiproxy 的 zod schema 对齐)。
 * 协议:POST /api/<method>(四象限 RPC 信封)+ WebSocket /api/events.mux、/api/events.host 事件流。
 */

// ---------- RPC 信封 ----------

export interface RpcError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ClientRequest {
  type: "client-request";
  rpcId: string;
  method: string;
  payload: unknown;
}

export interface ServerRequest {
  type: "server-request";
  rpcId: string;
  method: string;
  payload: unknown;
}

// ---------- 会话事件 ----------

export interface SessionEvent {
  type: string;
  seq: number;
  time: number;
  data: any;
  sourceEventSeqs?: number[];
  surfaceOp?: unknown;
  ignorable?: true;
}

export interface ToolEventView {
  for: "call" | "result";
  view: { card: string; [key: string]: unknown };
}

export interface SessionSummary {
  sessionId: string;
  updatedAt: number;
  running: boolean;
  blank: boolean;
  parentSessionId?: string;
  origin?: "subagent";
  cwd?: string;
  agentPreset?: string;
  projections?: { asOfSeq: number; values: Record<string, any> };
}

export interface HistoryEntry {
  event: SessionEvent;
  view?: ToolEventView;
}

// ---------- Mux 帧(WebSocket /api/events.mux) ----------

export interface AskUserQuestionItem {
  id: string;
  question: string;
  header?: string;
  detail?: string;
  options?: { label: string; description?: string }[];
  multiSelect?: boolean;
  intent?: unknown;
}

export interface QueueItem {
  id: string;
  placement: "queued" | "steering" | "context";
  message: { id: string; role: "system" | "user" | "assistant"; content: unknown[]; source: { kind: string } };
}

export interface JobView {
  id: string;
  kind: string;
  label: string;
  status: "running" | "stopping" | "completed" | "killed" | "failed";
  detail?: string;
  startedAt: number;
  finishedAt?: number;
}

export type MuxFrame =
  | { type: "session/event"; sessionId: string; event: SessionEvent; view?: ToolEventView }
  | { type: "session/subscribed"; sessionId: string; lastSeq: number }
  | { type: "approval/requested"; sessionId: string; approvalId: string; toolName: string; callId?: string; reason?: string }
  | { type: "approval/resolved"; sessionId: string; approvalId: string; outcome: "allowed-once" | "rejected" | "cancelled" | "unavailable" }
  | { type: "question/requested"; sessionId: string; questions: AskUserQuestionItem[] }
  | { type: "question/resolved"; sessionId: string; questionRpcId: string; outcome: "answered" | "cancelled" }
  | { type: "session/queue"; sessionId: string; items: QueueItem[] }
  | { type: "session/jobs"; sessionId: string; jobs: JobView[] }
  | { type: "session/projection"; sessionId: string; key: string; value: unknown; seq: number }
  | { type: "stream/error"; error: RpcError };

// ---------- Host 帧(WebSocket /api/events.host) ----------

export interface WorkspaceView {
  workspaceId: string;
  [key: string]: unknown;
}

export type HostFrame =
  | { type: "host/session-added"; sessionId: string; blank: boolean; parentSessionId?: string; origin?: "subagent"; cwd?: string; agentPreset?: string }
  | { type: "host/session-removed"; sessionId: string }
  | { type: "host/session-status"; sessionId: string; running: boolean }
  | { type: "host/agent-error"; sessionId: string; message: string }
  | { type: "host/workspace-changed"; workspace: WorkspaceView }
  | { type: "host/workspace-removed"; workspaceId: string }
  | { type: "host/workspace-order-changed"; workspaceIds: string[] }
  | { type: "host/archived-sessions-changed"; archivedSessionIds: string[] }
  | { type: "host/remote-event"; event: string; args: unknown[] }
  | { type: "stream/error"; error: RpcError };

// ---------- Unary 方法的请求/响应 ----------

export interface HostDescribeValue {
  version: string;
  cwd: string;
  provider?: string;
  model?: string;
  attachedSessions: number;
  canOpenPath: boolean;
}

export interface SessionCreateRequest {
  workspaceId?: string;
  cwd?: string;
  sessionId?: string;
  agentPreset?: string;
}
export interface SessionCreateValue {
  sessionId: string;
  agentPreset?: string;
}

export interface SessionHistoryRequest {
  sessionId: string;
  beforeSeq?: number;
  maxMessages?: number;
}
export interface SessionHistoryValue {
  events: HistoryEntry[];
  hasMore: boolean;
  projections?: { asOfSeq: number; values: Record<string, any> };
}

export interface SessionPromptRequest {
  sessionId: string;
  mode: "queue" | "steer";
  content: { type: "text"; text: string }[];
  clientTimeZone?: string;
}
export interface SessionPromptValue {
  accepted: true;
  command?: { kind: "success"; text?: string };
}

export interface SessionListValue {
  items: SessionSummary[];
}

export interface ModelSelection {
  provider: string;
  model: string;
  reasoningEffort?: string;
}

export interface ModelReasoningEffort {
  id: string;
  name: string;
  description?: string;
}

export interface ModelReasoning {
  efforts: ModelReasoningEffort[];
  defaultEffort?: string;
}

export interface ModelCatalogModel {
  id: string;
  name: string;
  description?: string;
  reasoning?: ModelReasoning;
}

export interface ModelProviderGroup {
  id: string;
  name: string;
  models: ModelCatalogModel[];
}

export interface ModelCatalogFailure {
  id: string;
  name: string;
  message: string;
}

export interface SessionModelsValue {
  current: ModelSelection;
  routable: boolean;
  groups: ModelProviderGroup[];
  failures: ModelCatalogFailure[];
}

export interface AgentPresetInfo {
  id: string;
  isDefault: boolean;
  name?: string;
  description?: string;
  broken?: string;
}
export interface AgentPresetListValue {
  presets: AgentPresetInfo[];
  authorable: boolean;
  hasDocument: boolean;
}

// ---------- /api/respond ----------

export interface ApprovalAnswer {
  sessionId: string;
  approvalId: string;
  outcome: "allowed-once" | "rejected";
}

export interface QuestionAnswer {
  sessionId: string;
  answer: { answers: { id: string; selected: string[]; custom?: string }[] };
}

// ---------- skills / subagents ----------

export interface SkillEntry {
  name: string;
  description: string;
  whenToUse?: string;
  modelInvocable: boolean;
}

export type SubagentEntry =
  | { kind: "child"; id: string; mode: "one-shot" | "continuable"; activity: "running" | "inactive"; hasChildren: boolean; label?: string }
  | { kind: "diagnostic"; id: string; reason: string };
