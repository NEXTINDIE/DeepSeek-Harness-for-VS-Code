/**
 * DSH Web API 的 wire 类型(对齐 @deepseek-ai/dsh 0.2.1-rc.2 的 Typert Remote 契约,
 * 同时兼容 0.2.1-rc.1 / 0.2.0-rc.2 / 0.1.7-rc.2 / 0.1.5-rc.1 / 0.1.2-rc.1 的参数名与端点差异)。
 *
 * 0.2.1-rc.1 → 0.2.1-rc.2(已按已发布包机械 diff + 真实 rc.2 服务器实机验证):
 * - 契约零变化:173 个 Typert 端点签名、23 条 $events 词表、21 个会话投影、57 种会话事件、
 *   三条 mux 流常量全部一致;信封、认证、remoteAccess 基线也不变;
 * - 只新增两个包,且都不进线协议:dsh-web-deepseek-api(DeepSeek Search/Fetch 提供方,
 *   带来设置命名空间 web 与 web-deepseek-api)与 dsh-client-ui-deepseek-model-label-1017
 *   (网页端模型标签上的 1017 徽标);
 * - 模型目录不变:deepseek-flash / deepseek-v4-pro 仍在,flash 的推理等级仍是 off/low/high/max
 *   (生成提交信息的模型选择依赖这条);
 * - web_search / web_fetch 工具在 rc.1 已存在,rc.2 只是换了 DeepSeek 后端,工具名与形状不变。
 *
 * 0.2.0-rc.2 → 0.2.1-rc.1 与本扩展相关的契约变化(已按已发布包逐一核对端点/流/事件,
 * 并用真实 0.2.1-rc.1 服务器逐项实机验证):
 * - 信封、流派、认证不变:POST /api/<ns>/<method> 仍是恰好一个字段的 { args },
 *   remote.mux 仍是 session/follow / session/control / workspace/follow / $events + $events/result,
 *   浏览器 cookie 仍是 dsh-auth-<hash>(版本 1);
 * - 本扩展使用的 57 个端点无签名变化;新增的 cotTranslation/*、pluginMarket/*、
 *   remoteAccess/follow、terminal/attach 属可选组合包(dsh web 默认未挂载 → 404),
 *   扩展按「端点不可用」降级即可;移除的 terminal/follow|write|resize 本扩展未使用;
 * - $events 词表新增 plugin-market/changed;api-session/* 五条事件增加 resources 子句
 *   (按调用方身份做资源级授权)。owner 连接(本扩展用启动令牌换 cookie)仍全量收到,
 *   实机已确认 api-session/added|status|activity 照常到达;
 * - 新增 remoteAccess/follow:基线帧 {type:"baseline",owner:true} 或 {owner:false,grants};
 *   越权调用以 code "remote-access/denied" 失败(details.action / details.reason);
 * - 会话投影新增 workingDirectory(string|null)与 userQuestions({active,settled});
 *   会话事件新增 working-directory/change({cwd})、job/registered、job/settled,
 *   移除 hook/invoked、hook/result;
 * - session/control 基线仍只携带 projections(没有 queues/jobs 字段):后台任务改由
 *   job/registered|job/settled 会话事件补齐(session/control 的 jobs 帧在 0.2.x 不再下发);
 * - 插件契约:package.json 可用 engines.dsh 声明兼容范围(semver + includePrerelease),
 *   icon 声明图标,locale/*.json 提供 {meta:{title,description}} 多语言显示。
 *
 * 0.1.5-rc.1 → 0.1.7-rc.2 与本扩展相关的契约变化(已按已发布包逐一核对端点/流/事件):
 * - 信封与流派不变:POST /api/<ns>/<method> 仍是 {type:"client-request",rpcId,method,payload},
 *   一元载荷恒为恰好一个字段 { args: {...} };remote.mux 仍是
 *   session/follow / session/control / workspace/follow / $events + $events/result;
 * - 移除 subagents/list:子代理台账改由 session/list 的 subagentCatalog + session/page 地址分页提供;
 * - 移除 settings/openAgentPresetDirectory 与 agentPresets/copy|deletePreset:
 *   预设作者能力只剩 agentPresets/list|read|select(预设文件由客户端自行落盘);
 * - 新增 schedule/*(定时任务:list 按会话、catalog 全局、delete 按会话、history 运行记录)
 *   与 $events 的 schedule/changed 失效通知;
 * - 新增 messageFeedback/*(逐消息点赞/点踩,put 用 ifVersion 做 CAS)、
 *   sessionFeedback/record(会话级反馈,取代 /feedback 命令);
 * - 新增 permissionPresets/catalog(进程级权限预设目录)、goals/get、session/projections|fork|rename
 *   等端点(部分在 0.1.5 已可用);
 * - 会话日志格式升到 V4(宿主在读取时迁移;wire 上的 SessionWireEvent 仍是
 *   {type,seq,time,data} 泛型信封,新增 developer/message 与 tool-addition/removal 块)。
 *
 * 0.1.2-rc.1 → 0.1.5-rc.1 与本扩展相关的契约变化(已按发布包逐一核对端点/流/事件):
 * - commands/execute 第三参数 images → submittedAttachments;commands/list 描述符
 *   input.images → input.attachments(按命令自身声明裁决是否接受附件);
 * - subagents/prompt 新增必填 delivery("queue"|"steer");
 * - session/prompt / updateQueue 的内容块新增 file({receiptId},先经 fileUploads/upload 上传);
 * - session/follow 打开参数新增 assistantStream(逐 token 增量改走瞬态 assistant-stream 帧),
 *   快照 header 的 seedLength → isSeeded,快照新增 assistantStream 基线;
 * - session/page 不再返回压缩的 chunks 记录:V3 日志不保存逐 token 增量,历史即原始事件;
 * - session/list、session/control 结果新增 subagentCatalog(附加字段,忽略即可)。
 *
 * 0.1.1-rc.2 → 0.1.2-rc.1 协议变更(alpha.4 → rc.1 无线协议变化,已按发布的
 * rc.1(0.1.2-rc.1)核对全部端点/流/认证契约):
 * - 一元端点为斜杠形式 <namespace>/<method>(session.list → session/list),
 *   载荷信封 payload 必须是恰好一个字段的 { args: {...} };
 * - host.describe 已移除(版本/主机信息改由 $events 打开帧 + session/modelCatalog 提供);
 * - /api/respond 移除,审批/提问改走 $events waterfall + /api/$events/result;
 * - /api/events.mux 与 /api/events.host 移除,改为 /api/remote.mux 单 WebSocket 多路流:
 *   session/follow(会话事件)、session/control(队列/任务/投影)、workspace/follow(工作区)、$events(主机事件);
 * - /api 需要浏览器认证 cookie(GET /?token=… 交换)。
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
  /** 0.1.2 起 agentPreset 移到 projections.values.agentPreset。 */
  agentPreset?: string;
  projections?: { asOfSeq: number; values: Record<string, any> };
}

/**
 * session/page 或 session/follow 的一条历史记录。
 * 0.1.2-rc.1:持久层会把逐 token 增量打包为 `chunkrow/*` 的 chunks 记录;
 * 0.1.5-rc.1:V3 日志不再保存逐 token 增量,历史就是原始事件(仅 event 记录)。
 */
export type SessionHistoryRecord =
  | { type: "event"; event: SessionEvent }
  | { type: "chunks"; event: SessionEvent };

// ---------- session/page / session/follow ----------

/** 会话或子代理会话的持久地址(0.1.2 起 history 改为按地址分页/跟随)。 */
export type SessionAddress =
  | { kind: "session"; sessionId: string }
  | { kind: "subagent"; parentSessionId: string; childSessionId: string; mode: "one-shot" | "continuable" };

export interface SessionPageRequest {
  address: SessionAddress;
  /** 来自对应 session/follow 打开帧的 cursor(含)。 */
  throughSeq: number;
  beforeSeq?: number;
  maxMessages?: number;
}

export interface SessionPageValue {
  records: SessionHistoryRecord[];
  hasMore: boolean;
}

/** session/follow 打开帧:完整基线,随后逐条会话事件,以及(可选开启的)assistant-stream 帧。 */
export type SessionFollowFrame =
  | {
      type: "snapshot";
      header: {
        version: number;
        id: string;
        createdAt: number;
        cwd?: string;
        parentSession?: string;
        /** 0.1.5-rc.1 起快照 header 用 isSeeded 取代旧版的 seedLength。 */
        isSeeded?: boolean;
        seedLength?: number;
        origin?: "subagent";
        delegationDepth?: number;
        agentPreset?: string;
      };
      cursor: number;
      records: SessionHistoryRecord[];
      hasMore: boolean;
      projections: { asOfSeq: number; values: Record<string, any> };
      /** 0.1.5:开启 assistantStream 时的进行中尝试基线(可重建已流出的内容)。 */
      assistantStream?: { revision: number; activeAttempt?: { attemptId: string; startedAfterSeq: number; turn: number; step: number; nextIndex: number; stream: unknown[] } };
    }
  | { type: "event"; event: SessionEvent }
  | { type: "assistant-stream"; frame: AssistantStreamFrame };

/**
 * 0.1.5 起逐 token 增量不再作为会话事件下发(V3 日志不保存逐 token 增量),
 * 改为 follow 流上的瞬态帧:仅当打开的 args 带 assistantStream: true 时推送。
 */
export type AssistantStreamFrame =
  | { type: "start"; attemptId: string; revision: number; startedAfterSeq: number; turn: number; step: number }
  | { type: "chunk"; attemptId: string; revision: number; index: number; time: number; chunk: AssistantStreamChunk }
  | {
      type: "end";
      attemptId: string;
      revision: number;
      index: number;
      outcome: { kind: "committed"; eventType: "assistant/message" | "assistant/attempt"; seq: number } | { kind: "abandoned" };
    };

/** 模型流的一次增量(与 0.1.2 assistant/chunk 事件的 data.chunk 同构)。 */
export type AssistantStreamChunk =
  | { type: "block-start"; index: number; blockType: string }
  | { type: "text-delta"; index: number; text: string }
  | { type: "reasoning-delta"; index: number; text: string }
  | { type: "tool-call-delta"; index: number; id: string; name?: string; argumentsDelta: string }
  | { type: "block-end"; index: number; block: unknown }
  | { type: "usage"; usage: unknown }
  | { type: "finish"; reason: unknown };

// ---------- session/control(0.1.2 起队列/任务/投影的单一控制流) ----------

export interface QueueItem {
  id: string;
  placement: "queued" | "steering" | "context";
  rpcId?: string;
  message: { id: string; content: unknown[] };
}

export interface JobView {
  id: string;
  kind: string;
  label: string;
  status: "running" | "stopping" | "completed" | "killed" | "failed";
  detail?: string;
  startedAt: number;
  finishedAt?: number;
  /** 生产者实时进度行(如「3/10」);结算时清空。0.2.1 起随 job 事件下发。 */
  progress?: string;
}

/**
 * `job/registered` 的载荷(0.2.1 新增的日志型 job 事件)。
 * 后台任务此前只有 session/control 帧一条来源,而 0.2.x 的 control 基线只携带
 * projections(没有 jobs 字段),因此面板长期为空;0.2.1 起改由会话事件补齐。
 */
export interface JobRegisteredData {
  jobId: string;
  owner: string;
  kind: string;
  label: string;
  startedAt: number;
}

/** `job/settled` 载荷:注册事实 + 终态。 */
export interface JobSettledData extends JobRegisteredData {
  finishedAt: number;
  status: "completed" | "killed" | "failed";
  cause?: string;
  producerReported?: boolean;
  detail?: string;
}

// ---------- 0.2.1:会话工作目录(dsh-working-directory) ----------

/**
 * `working-directory/change` 会话事件:cwd 变更后的绝对路径。
 * 会话头的 cwd 是创建时的项目目录,不会随之改变;后续目录类操作的基准是这里的值。
 */
export interface WorkingDirectoryChange {
  cwd: string;
}

/**
 * `workingDirectory` 会话投影:当前生效目录,null 表示尚未记录。
 * 宿主同时会把目录切换以 `user/message`(source.kind = "working-directory")注入为
 * 通告消息 —— 本扩展把它渲染成小字提示,而不是用户气泡。
 */
export type WorkingDirectoryProjection = string | null;

// ---------- 0.2.0/0.2.1:限时提问(userQuestions 投影) ----------

export type UserQuestionState = "open" | "continued";

/** 仍可作答的限时提问(按提问顺序)。 */
export interface PendingUserQuestion {
  callId: string;
  questions: AskUserQuestionItem[];
  state: UserQuestionState;
  /** 剩余等待毫秒;投影不携带,由 attachWait 流补充。 */
  remainingMs?: number;
}

/** 已结算的限时提问与其最终答案。 */
export interface SettledUserQuestion {
  callId: string;
  answers: { id: string; selected: string[]; custom?: string }[];
}

/** `userQuestions` 会话投影:活跃提问 + 已结算提问。 */
export interface UserQuestionProjection {
  active: PendingUserQuestion[];
  settled: SettledUserQuestion[];
}

// ---------- 0.2.1:远程访问授权(remoteAccess/follow) ----------

/** 一条授权:某资源上允许调用的端点动作。 */
export interface RemoteAccessGrant {
  /** 资源身份(kind + id),wire 上是可 JSON 化的对象。 */
  resource: unknown;
  actions: string[];
}

/**
 * `remoteAccess/follow` 的帧。
 * 基线帧 `owner: true` 表示本连接是 owner(拥有全部权限);否则只带 grants,
 * 越权调用会以 `remote-access/denied` 失败(细节里有 action 与 reason)。
 */
export type RemoteAccessFrame =
  | { type: "baseline"; owner: true }
  | { type: "baseline"; owner: false; grants: RemoteAccessGrant[] }
  | { type: "upsert"; grant: RemoteAccessGrant }
  | { type: "remove"; resource: unknown };

// ---------- 0.2.x:计划模式与计划审阅(dsh-plan-mode) ----------

/**
 * `plan` 会话投影(dsh-plan-mode 的 PlanProjection)。
 * 网页端 PlanChip 的判定:`pending ? !active : active` —— 切换命令在飞时取目标态,
 * 否则取已记录态。用它而不是只看 `plan/mode` 瞬时事件,切换会话 / 重载后也能还原。
 */
export interface PlanProjection {
  active: boolean;
  pending: boolean;
}

export type SessionControlFrame =
  | {
      type: "baseline";
      value: {
        queues: Record<string, QueueItem[]>;
        jobs: Record<string, JobView[]>;
        projections: Record<string, { asOfSeq: number; values: Record<string, any> }>;
      };
    }
  | { type: "queue"; sessionId: string; items: QueueItem[] }
  | { type: "jobs"; sessionId: string; jobs: JobView[] }
  | { type: "projection"; sessionId: string; key: string; value: unknown; seq: number };

// ---------- workspace/follow(0.1.2 起工作区改走流) ----------

export interface WorkspaceItem {
  workspaceId: string;
  path: string;
  title: string;
  sessionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type WorkspaceFollowFrame =
  | { type: "baseline"; value: { items: WorkspaceItem[]; archivedSessionIds: string[] } }
  | { type: "upsert"; workspace: WorkspaceItem }
  | { type: "remove"; workspaceId: string }
  | { type: "order"; workspaceIds: string[] }
  | { type: "archived"; archivedSessionIds: string[] };

// ---------- $events 主机事件流(0.1.2 起 host.describe / events.mux / events.host / /api/respond 的替代) ----------

/** $events 打开帧(ready)携带的客户端身份与主机信息。 */
export interface RemoteEventReady {
  type: "ready";
  clientId: string;
  host: { home: string };
}

export type RemoteEventFrame =
  | RemoteEventReady
  | { type: "emit"; event: string; args: unknown[] }
  | { type: "waterfall"; event: string; eventId: string; agentId: string; request: unknown }
  | { type: "cancel"; eventId: string };

/** 审批请求(approval/request waterfall 的 request)。 */
export interface ApprovalRequestEvent {
  toolName: string;
  callId?: string;
  reason?: string;
}

/** 提问请求(user-questions/request waterfall 的 request)。 */
export interface AskUserQuestionItem {
  id: string;
  question: string;
  header?: string;
  detail?: string;
  options?: { label: string; description?: string }[];
  multiSelect?: boolean;
  intent?: { kind: string; [key: string]: unknown };
}

export interface AskUserQuestionRequest {
  questions: AskUserQuestionItem[];
}

export interface AskUserQuestionAnswer {
  answers: { id: string; selected: string[]; custom?: string }[];
}

/** $events/result 的 outcome(回答 / 拒绝 / 让给下一个 answerer)。 */
export type RemoteEventOutcome =
  | { kind: "result"; value?: unknown }
  | { kind: "rejected"; error: { name: string; message: string; code?: string; details?: unknown } }
  | { kind: "next" };

// ---------- 一元方法请求/响应 ----------

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
  address: SessionAddress;
  throughSeq: number;
  beforeSeq?: number;
  maxMessages?: number;
}
export interface SessionHistoryValue {
  records: SessionHistoryRecord[];
  hasMore: boolean;
}

export interface SessionPromptRequest {
  /** 客户端预生成的请求标识(0.1.2 起必需)。 */
  requestId: string;
  sessionId: string;
  mode: "queue" | "steer";
  content: PromptContentPart[];
  clientTimeZone?: string;
}
export interface SessionPromptValue {
  accepted: true;
}

/** commands/execute 网关返回的 CommandExecution 视图(命令结果文本透传界面)。 */
export interface CommandExecutionView {
  commandId?: string;
  result: { kind: "success" | "error"; text?: string };
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

/** session/modelCatalog:0.1.2 起代替 session.models + llm.models。 */
export interface SessionModelsValue {
  current: ModelSelection;
  routable: boolean;
  groups: ModelProviderGroup[];
  failures: ModelCatalogFailure[];
}

export interface AgentPresetInfo {
  id: string;
  trust?: "system" | "user";
  isDefault: boolean;
  name?: string;
  description?: string;
  broken?: string;
}
export interface AgentPresetListValue {
  presets: AgentPresetInfo[];
  authorable: boolean;
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

// ---------- 工作区(workspace.* 请求/响应) ----------

export interface WorkspaceListValue {
  items: WorkspaceItem[];
  archivedSessionIds: string[];
}

// ---------- 会话内容搜索(session.search) ----------

export interface SessionSearchItem {
  sessionId: string;
  snippet: string;
}

export interface SessionSearchValue {
  items: SessionSearchItem[];
  hasMore: boolean;
}

// ---------- 图片内容块(session.prompt 的 image 部分) ----------

export interface ImageContentPart {
  type: "image";
  mediaType: string;
  data: string;
  name?: string;
}

export type PromptContentPart = { type: "text"; text: string } | ImageContentPart;

export interface SessionAttachmentValue {
  attachment: { id: string; mediaType?: string; name?: string; [key: string]: unknown };
  data: string;
}

// ---------- Agent 预设作者(agentPresets.*) ----------

export interface AgentPresetReadValue {
  agentPreset: string;
  trust: "system" | "user";
  content: string;
  name?: string;
  description?: string;
}

export interface AgentPresetOpenDocumentValue {
  opened: boolean;
  path?: string;
}

// ---------- 设置(settings.* / credentials.*;字段形状与 0.1.1 一致,端点改斜杠) ----------

export interface SettingsSecretView {
  path: string[];
  set: boolean;
}

export interface SettingsNamespaceView {
  ns: string;
  schema: unknown;
  value: unknown;
  base?: unknown;
  user?: unknown;
  applies: "live" | "restart";
  secrets: SettingsSecretView[];
  revision: number;
}

export interface SettingsDescribeValue {
  writable: boolean;
  hasDocument: boolean;
  namespaces: SettingsNamespaceView[];
}

export type SettingsPathOpView =
  | { op: "set"; path: string[]; value: unknown }
  | { op: "unset"; path: string[] };

export interface CredentialView {
  configured: boolean;
  source?: string;
  writable: boolean;
}

// ---------- LLM 目录(llm.* / session.modelCatalog) ----------

export interface ConfigurableProviderView {
  provider: string;
  displayName: string;
  settingsNs: string;
  settingsPath: string[];
  active: boolean;
  declared?: boolean;
}

export interface DiscoveredModelView {
  id: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
}

// ---------- 子代理追问/打断(subagents.*) ----------

export interface SubagentPromptReceipt {
  messageId: string;
}

// ---------- goal(goals.*:0.1.2 起 payload 为 {agentId, ref, request}) ----------

export interface GoalRef {
  id: string;
  revision: number;
}

export interface CreateGoalRequest {
  objective: string;
  maxGoalRounds?: number;
}

export interface CreateGoalResult {
  ref: GoalRef;
}

// ---------- 定时任务(schedule/*;0.1.7 新增,需宿主启用定时任务插件) ----------

/** 一次性任务的相对延迟规则。 */
export interface ScheduleAfterRecord {
  id: string;
  kind: "after";
  title: string;
  prompt: string;
  afterSeconds: number;
  scheduledAt: string;
}

/** 一次性任务的绝对时刻规则。 */
export interface ScheduleAtRecord {
  id: string;
  kind: "at";
  title: string;
  prompt: string;
  scheduledAt: string;
}

/** 固定间隔重复规则(最短 1 分钟)。 */
export interface ScheduleEveryRecord {
  id: string;
  kind: "every";
  title: string;
  prompt: string;
  everySeconds: number;
  scheduledAt: string;
}

/** 每日墙钟规则(带显式 IANA 时区)。 */
export interface ScheduleDailyRecord {
  id: string;
  kind: "daily";
  title: string;
  prompt: string;
  time: string;
  timeZone: string;
  scheduledAt: string;
}

/** 每周墙钟规则(ISO 星期 1-7)。 */
export interface ScheduleWeeklyRecord {
  id: string;
  kind: "weekly";
  title: string;
  prompt: string;
  time: string;
  timeZone: string;
  weekdays: number[];
  scheduledAt: string;
}

/** 五字段 cron 规则(带显式 IANA 时区)。 */
export interface ScheduleCronRecord {
  id: string;
  kind: "cron";
  title: string;
  prompt: string;
  expression: string;
  timeZone: string;
  scheduledAt: string;
}

export type ScheduleRecord =
  | ScheduleAfterRecord
  | ScheduleAtRecord
  | ScheduleEveryRecord
  | ScheduleDailyRecord
  | ScheduleWeeklyRecord
  | ScheduleCronRecord;

/** 已投递到会话收件箱的一条记录(时间与消息 id)。 */
export interface ScheduleDeliveryReceipt {
  scheduledAt: string;
  deliveredAt: string;
  messageId: string;
}

/** 运行记录(含当次发送的提示词;旧记录可能没有 prompt)。 */
export interface ScheduleDeliveryRecord extends ScheduleDeliveryReceipt {
  prompt?: string;
}

/** 浏览器可见的保留任务:catalog 条目额外带绑定会话与状态。 */
export type ScheduleCatalogEntry = ScheduleRecord & {
  sessionId: string;
  status: "active" | "inactive";
  lastDelivery?: ScheduleDeliveryReceipt;
};

/** schedule/history 请求(limit 1-100;before 为上一页最旧消息 id)。 */
export interface ScheduleHistoryRequest {
  sessionId: string;
  id: string;
  limit: number;
  before?: string;
}

export type ScheduleHistoryValue =
  | {
      id: string;
      records: ScheduleDeliveryRecord[];
      earlierRecordsUnavailable: boolean;
      earlierRecordsPruned: boolean;
      retention: { days: number; records: number };
      nextBefore?: string;
    }
  | { id: string; code: "schedule_not_found" | "delivery_cursor_not_found" };

export interface ScheduleDeleteValue {
  id: string;
  deleted: boolean;
  code?: "schedule_not_found";
}

// ---------- 逐消息反馈(messageFeedback/*;0.1.7 新增) ----------

export type MessageFeedbackRating = "positive" | "negative";

/** 固定反馈分类(与宿主 FEEDBACK_CATEGORIES 一致)。 */
export type FeedbackCategory =
  | "task-result"
  | "instruction-following"
  | "product-interaction"
  | "service-stability"
  | "resource-cost"
  | "security-privacy-permission"
  | "other";

export interface MessageFeedbackItem {
  messageId: string;
  rating: MessageFeedbackRating;
  note?: string;
  category?: FeedbackCategory;
  version: string;
  createdAt: number;
  updatedAt: number;
}

/** 反馈操作的成功/业务失败联合(宿主返回 {ok:true,value} / {ok:false,error})。 */
export type MessageFeedbackListResult =
  | { ok: true; value: { items: MessageFeedbackItem[] } }
  | { ok: false; error: { code: string; [key: string]: unknown } };

export type MessageFeedbackPutResult =
  | { ok: true; value: MessageFeedbackItem }
  | { ok: false; error: { code: string; current?: MessageFeedbackItem | null; [key: string]: unknown } };

export type MessageFeedbackDeleteResult =
  | { ok: true; value: { absent: true } }
  | { ok: false; error: { code: string; [key: string]: unknown } };

/** 会话级反馈(sessionFeedback/record,取代 /feedback 命令)。 */
export type SessionFeedbackRecordResult =
  | { ok: true; value: { recorded: true } }
  | { ok: false; error: { code: string; sessionId: string } };

// ---------- 权限预设目录(permissionPresets/catalog;0.1.5 起可用) ----------

export interface PermissionPresetOption {
  value: string;
  name: string;
  description?: string;
}

export interface PermissionCatalog {
  options: PermissionPresetOption[];
  defaultOptions: PermissionPresetOption[];
  defaultPreset: string;
}

// ---------- 流式传输(remote.mux) ----------

export type RemoteMuxClientMessage =
  | { type: "open"; streamId: string; endpoint: string; payload: { args: unknown } }
  | { type: "cancel"; streamId: string };

export type RemoteMuxServerMessage =
  | { type: "item"; streamId: string; value: unknown }
  | { type: "end"; streamId: string }
  | { type: "error"; streamId: string; error: { code: string; message: string; details: unknown } };
