import "./safety";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { createPanels, type PanelsContext } from "./panels";
import zhTwTexts from "./texts/zh-tw.json";
import jaTexts from "./texts/ja.json";
import koTexts from "./texts/ko.json";
import deTexts from "./texts/de.json";
import frTexts from "./texts/fr.json";
import esTexts from "./texts/es.json";
import ptTexts from "./texts/pt.json";
import thTexts from "./texts/th.json";
import idTexts from "./texts/id.json";
import trTexts from "./texts/tr.json";
import ruTexts from "./texts/ru.json";
import arTexts from "./texts/ar.json";

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void; getState(): any; setState(state: any): void };

const vscode = acquireVsCodeApi();

// ---------- 类型 ----------

interface StoredSession {
  sessionId: string;
  title?: string;
  running: boolean;
  blank: boolean;
  cwd?: string;
  agentPreset?: string;
  parentSessionId?: string;
  origin?: "subagent";
  updatedAt: number;
  /** 等待的用户交互(approval / question / plan-review),由宿主补充 */
  pending?: { kind: "approval" | "question" | "plan-review" };
  /** 有未查看完成的回合(会话列表显示绿点,点击会话后消除) */
  unread?: boolean;
}

interface WorkspaceItem {
  workspaceId: string;
  path: string;
  title: string;
  sessionIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface JobView {
  id: string;
  kind: string;
  label: string;
  status: "running" | "stopping" | "completed" | "killed" | "failed";
  detail?: string;
  startedAt: number;
  finishedAt?: number;
}

interface WireEvent {
  event: { type: string; seq: number; time: number; data: any; surfaceOp?: unknown };
  view?: any;
}

interface HubStatus {
  serverUp: boolean;
  serverStartedByUs: boolean;
  serverStarting: boolean;
  muxConnected: boolean;
  hostConnected: boolean;
  version?: string;
  provider?: string;
  model?: string;
  message?: string;
  /** 宿主是否仍提供预设作者端点(0.1.7-rc.2 起移除) */
  presetAuthoring?: boolean;
}

interface ApprovalInfo {
  sessionId: string;
  approvalId: string;
  toolName: string;
  callId?: string;
  reason?: string;
}

interface QuestionInfo {
  sessionId: string;
  frameRpcId: string;
  questions: { id: string; question: string; detail?: string; options?: { label: string; description?: string }[]; multiSelect?: boolean }[];
  /** 0.2.0 异步问答:限时提问的剩余等待毫秒;null = 等待已到期(仍可作答)。 */
  remainingMs?: number | null;
  /** 限时提问对应的工具调用 id(作答走 userQuestions/answer)。 */
  callId?: string;
  /**
   * 由 userQuestions 投影还原的卡片(刷新/切换会话后重建)。
   * 这类卡片没有 waterfall 的 frameRpcId,只能按 callId 作答,且不参与 $events 的撤回。
   */
  fromProjection?: boolean;
}

/** Cordis 动态插件审批请求(网页端 Cordis 浮窗面板同款)。 */
interface CordisRequestRun {
  requestId: string;
  agentId: string;
  pluginId: string;
  packageId: string;
  mode: "run" | "update";
  name: string;
  purpose: string;
  requiresApproval: boolean;
}

interface ModelEffort {
  id: string;
  name: string;
  description?: string;
}

interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  reasoning?: { efforts: ModelEffort[]; defaultEffort?: string };
}

interface ModelsValue {
  current: { provider: string; model: string; reasoningEffort?: string };
  routable: boolean;
  groups: { id: string; name: string; models: ModelInfo[] }[];
  failures: { id: string; name: string; message: string }[];
}

interface PresetInfo {
  id: string;
  isDefault: boolean;
  trust?: "system" | "user";
  name?: string;
  description?: string;
  /** 无法加载的预设(服务器标记):显示原因并置为危险色。 */
  broken?: string;
}

interface BlockState {
  type: "text" | "reasoning";
  text: string;
  el: HTMLElement | null;
  /** 所属助手节点(首个增量到达整块重绘时定位用) */
  owner?: NodeState;
  /** 用户手动展开/收起过:优先于"流式中自动展开"的默认行为 */
  userOpen?: boolean;
  /** 思考行的一行摘要(流式期间增量刷新) */
  previewEl?: HTMLElement | null;
}

interface NodeState {
  kind: "user" | "assistant" | "tool" | "queued" | "note" | "files" | "attach" | "turn-divider" | "command" | "alert";
  key: string;
  el: HTMLElement | null;
  blocks?: BlockState[];
  callId?: string;
  name?: string;
  args?: string;
  result?: string;
  done?: boolean;
  text?: string;
  // assistant 消息的附加信息
  seq?: number;
  plainText?: string;
  deliverables?: string[];
  feedback?: "positive" | "negative";
  /** 0.1.7 逐消息反馈的目标:assistant/message 的 message.id(缺失时退化为 /feedback 命令) */
  messageId?: string;
  actionsEl?: HTMLElement | null;
  roleEl?: HTMLElement | null;
  /** 助手消息内产物卡容器(位于回答与操作条之间) */
  filesEl?: HTMLElement | null;
  /** 消息头后缀(思考耗时 · token 消耗),模型名变化时重建 */
  roleSuffix?: string;
  /** 所属回合/步骤,用于把流式内容定位到正确的节点 */
  turn?: number;
  step?: number;
  /** 思考耗时:首个推理块开始到首个文本块开始的间隔 */
  reasoningMs?: number;
  reasoningStartMs?: number;
  /** 助手节点内联的工具行(网页端工作流:工具插在所属思考块之后) */
  tools?: NodeState[];
  /** 过程段容器(思考/工具连续段),段尾汇总行按段折叠时使用 */
  groupEls?: { start: number; el: HTMLElement }[];
  /** 段尾汇总行(工具完成时刷新计数) */
  groupSummaries?: { __refresh?: () => void }[];
  /** 用户手动收起的段(按段起始 block index 记录;重绘后保持) */
  groupCollapsed?: Set<number>;
  /** 工具行插入位置:渲染在 blocks[afterBlock] 之后(-1 = 最前) */
  afterBlock?: number;
  // files 卡片节点
  files?: string[];
  /** 附件上下文(注入模型的内容,界面默认折叠) */
  attachContext?: string;
  /** note 节点是否为命令行(斜杠命令执行记录) */
  cmd?: boolean;
  /** 工具调用失败(结果 isError) */
  failed?: boolean;
  // 用户消息 / 工具结果携带的图片引用(官方 image 内容块)
  images?: { attachmentId: string; mediaType?: string }[];
  /** 本回合交付的文件(官方 present 工具:路径 + 描述,渲染为网页端同款文件卡) */
  presented?: { path: string; description?: string }[];
  /** 收尾答案的事件时间(回合尾本地时钟) */
  time?: number;
  /**
   * 节点锚定的会话事件 seq:压缩检查点以 surfaceOp=replace 覆盖历史区间时,
   * 按范围移除已折叠的条目(网页端 surface 语义)。
   */
  anchorSeq?: number;
  /** 命令行的命令 id(command/run ↔ command/done 关联) */
  commandId?: string;
  /** 命令名(压缩上下文为 compact) */
  cmdName?: string;
  /** 压缩事务 id(compaction/start ↔ summary ↔ end ↔ 检查点关联) */
  compactionId?: string;
  /** 命令行状态:running(进行中)→ done / error */
  cmdStatus?: "running" | "done" | "error";
  /** 自动压缩(无来源命令):标题为「上下文已压缩」,手动压缩标题为命令名 */
  autoCompaction?: boolean;
  /** 压缩掉的历史条数 / token 数(compaction/summary 同源,网页端「已压缩 N 条历史记录」) */
  shadowedItems?: number;
  shadowedTokens?: number;
  /** 压缩摘要正文(点击行展开,网页端 compactionSummary 正文同款) */
  summaryText?: string;
  /** 命令结果文本(command/done.text,作为摘要的回退显示) */
  outcomeText?: string;
  /** 摘要展开状态(用户点击切换) */
  expanded?: boolean;
  /** 失败/上下文卡片(alert):标题、正文、危险/警告配色 */
  alertTitle?: string;
  alertMessage?: string;
  tone?: "warn" | "error";
  /** 提供「压缩上下文」动作(上下文超限类失败) */
  actionCompact?: boolean;
  /** 提供「切换模型」动作(窗口不足时换更大窗口的模型) */
  actionModel?: boolean;
  /** 建立时刻:同一回合 live 重复上报失败时的去重窗口(重放不受影响) */
  alertAt?: number;
  /** 卡片属于当前会话的实时回合(为 false 时不提供动作,避免对历史回合执行命令) */
  live?: boolean;
}

// ---------- 状态 ----------

const state = {
  sessions: [] as StoredSession[],
  current: null as string | null,
  running: false,
  status: { serverUp: false, serverStartedByUs: false, serverStarting: false, muxConnected: false, hostConnected: false } as HubStatus,
  nodes: [] as NodeState[],
  seqs: new Set<number>(),
  queuedIds: new Map<string, NodeState>(),
  approvals: new Map<string, ApprovalInfo>(),
  questions: new Map<string, QuestionInfo>(),
  /** Cordis 动态插件审批请求(requestId → 请求;网页端 Cordis 浮窗面板同款) */
  cordisRequests: new Map<string, CordisRequestRun>(),
  hasMore: false,
  streamKey: null as string | null,
  streamBlock: null as BlockState | null,
  models: null as ModelsValue | null,
  presets: null as PresetInfo[] | null,
  goal: undefined as any,
  context: undefined as { pressureTokens?: number; projectedTokens?: number; surfaceTokens?: number; contextWindow?: number } | undefined,
  /** 上下文构成(contextBreakdown 投影,0.1.5:系统提示词 / 工具定义 / 对话消息) */
  breakdown: undefined as { systemTokens: number; toolsTokens: number; messageTokens: number } | undefined,
  permissions: undefined as { options: { value: string; name: string; description?: string }[]; currentValue: string } | undefined,
  /** 各轮 turn/start 的 seq,用于"回退到上一轮" */
  turnStarts: [] as number[],
  /** 回合起止时刻与用量(网页端回合尾「用量 / 用时 / 时间」同源数据) */
  turnStartMs: new Map<number, number>(),
  turnEndMs: new Map<number, number>(),
  turnUsage: new Map<number, TurnUsageBucket>(),
  /** 回合首个 / 末个模型增量的时刻(TTFT 与输出速度的解码窗口) */
  turnFirstTokenMs: new Map<number, number>(),
  turnLastDeltaMs: new Map<number, number>(),
  /** 回合级 Git 回退快照(服务端插件写入 .dsh/rollback,宿主推送可用清单) */
  rollback: undefined as { sessionId: string; available: boolean; checkpoints: { turn: number; time: number }[] } | undefined,
  /** 计划模式状态(plan/mode 事件) */
  planMode: false,
  /**
   * 计划模式投影(dsh-plan-mode 的 `plan`):{active, pending}。
   * 有效目标态 = pending ? !active : active —— 与网页端 PlanChip 同一折算,
   * 这样「刚发送 /plan、命令还在飞」时芯片显示的是目标态而不是旧态。
   */
  plan: undefined as { active: boolean; pending: boolean } | undefined,
  /** 最近一次计划审阅的全文(查看全文 / 关闭审阅后复查都从这里取) */
  planReview: undefined as { text: string; title?: string; frameRpcId?: string } | undefined,
  /** 计划落盘文件(.dsh/plans/plan-*.md,宿主 init 时给出):供「打开计划文件」入口使用 */
  planFile: undefined as string | undefined,
  /** 本轮工具节点(回合结束时折叠为摘要) */
  currentTurnTools: [] as NodeState[],
  /** 附件:自动附加的激活文件 + 手动选择 */
  attachments: [] as { kind: "file" | "folder"; path: string; label: string; auto?: boolean }[],
  autoAttachActive: true,
  activeFile: null as { path: string; label: string; languageId?: string } | null,
  skills: null as { name: string; description: string; whenToUse?: string; modelInvocable: boolean; source?: string }[] | null,
  subagents: null as { kind: string; id: string; mode?: string; activity?: string; label?: string }[] | null,
  /** 会话统计(sessionStats / tokenUsage 投影) */
  stats: undefined as { sessionStats?: any; tokenUsage?: any } | undefined,
  /** 待办事项(todos 投影) */
  todos: undefined as { content: string; status: "pending" | "in_progress" | "completed" }[] | null | undefined,
  /**
   * 当前生效的工作目录(0.2.1 workingDirectory 投影)。
   * 与会话头 cwd 不同:后者是创建时的项目目录,这里是 working_directory 工具切换后的基准。
   */
  workingDirectory: undefined as string | null | undefined,
  /** 限时提问投影(0.2.x userQuestions:active 仍可作答,settled 已结算) */
  userQuestions: undefined as { active: { callId: string; questions: any[]; state?: string }[]; settled: { callId: string; answers: any[] }[] } | undefined,
  /** 逐消息反馈(0.1.7 messageFeedback;messageId → 当前值) */
  feedback: [] as { messageId: string; rating: "positive" | "negative"; version: string; note?: string; updatedAt?: number }[],
  /** 宿主是否仍提供预设作者端点(0.1.7-rc.2 起移除) */
  presetAuthoring: undefined as boolean | undefined,
  /** 显示语言(宿主传入,zh-* 用中文源语言,其余用英文词典) */
  lang: "zh-cn",
  /** 排队消息权威快照(供语言切换时重建排队节点) */
  queueItems: [] as { id: string; placement: string; message?: { content?: unknown[] } }[],
  /** 重放历史期间跳过滚动/流式渲染等增量 DOM 更新,避免长会话切换卡顿 */
  replaying: false,
  /** 用户配置的语言偏好(auto / zh-cn / en) */
  languagePref: "auto" as string,
  /** 模型配置兼容扫描开关(dsh.agentConfigDirs) */
  agentDirs: { claude: true, codex: true, githubCopilot: true, dshUserSkills: true } as { claude: boolean; codex: boolean; githubCopilot: boolean; dshUserSkills: boolean },
  /** 每步开始时间,用于计算每条回答的思考耗时 */
  stepStarts: new Map<string, number>(),
  /** 当前流式回合,用于回合边界切分节点 */
  currentStreamTurn: undefined as number | undefined,
  /** 已流式输出的块键 `${turn}:${step}:${index}`,避免 assistant/message 重复追加 */
  streamedBlockKeys: new Set<string>(),
  /** 每 (turn:step) 的流式块(index → 块对象),结算时由 message content 原位覆盖 */
  streamedBlocks: new Map<string, Map<number, BlockState>>(),
  /** 压缩历史行(chunkrow/text-chunks 等)按 (turn,step) 累积的最终块:index → {kind,text} */
  rowBlocks: new Map<string, Map<number, { kind: "text" | "reasoning"; text: string }>>(),
  /** 本回合的过程(工具调用)折叠组 */
  turnToolGroup: null as HTMLElement | null,
  /** 工作区智能体/技能配置(.claude / .codex / .github Copilot / .dsh) */
  claudeConfig: null as {
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
    dshAgents: { name: string; description?: string; content: string; path?: string }[];
    dshMemory: { name: string; content: string; path?: string }[];
  } | null,
  /** 工作区与归档集合(workspace.list 基线 + host 帧) */
  workspaces: [] as WorkspaceItem[],
  workspaceOrder: [] as string[],
  archivedSessionIds: [] as string[],
  /** 当前工作区文件夹路径(宿主下发;空 = 未打开文件夹) */
  workspaceFolder: null as string | null,
  /** 会话下拉是否显示全部目录(默认 false:仅当前工作目录,Claude Code 同款) */
  showAllSessions: false,
  /** 当前会话的后台任务(session/jobs 帧) */
  jobs: [] as JobView[],
  /** 图片附件(待发送) */
  images: [] as { data: string; mediaType: string; name: string }[],
  /** 轨迹视图用原始事件 */
  rawEvents: [] as WireEvent[],
  /** 设置面板描述(settings.describe) */
  settingsDescribe: null as {
    writable: boolean;
    hasDocument: boolean;
    namespaces: {
      ns: string;
      schema: any;
      value: any;
      base?: any;
      user?: any;
      applies: "live" | "restart";
      secrets: { path: string[]; set: boolean }[];
      revision: number;
    }[];
  } | null,
};

/**
 * 一个回合的用量累计(网页端 TurnUsagePanel 的 usage 同源):
 * 按步累加 assistant/message 的 usage,输出侧含推理 token 明细。
 */
interface TurnUsageBucket {
  uncachedInput: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  reasoning: number;
  /** 本回合实际用到的路由(provider/model) */
  routes: Set<string>;
}

/**
 * 当前回合产出的文件(与网页端 ui-deliverables 一致:由 mutation 工具调用视图的
 * 跟随 locations 推导,turn/start 的 data.deliverables 在本部署上为空,不可依赖)
 */
let turnProduced: string[] = [];
const turnProducedSet = new Set<string>();
/** 当前回合工具调用视图(callId → call view),tool/result 时据此判定哪些调用产生了文件 */
const turnCallViews = new Map<string, any>();

/** 与网页端 producedPaths 一致:仅 diff 卡或 kind=edit 的 generic 卡的 locations 计入产物(读/删/失败不算) */
function producedPathsFromCallView(view: any): string[] {
  if (!view || typeof view !== "object") return [];
  if (view.card !== "diff" && !(view.card === "generic" && view.kind === "edit")) return [];
  if (!Array.isArray(view.locations)) return [];
  return view.locations.map((l: any) => l?.path).filter((p: unknown): p is string => typeof p === "string");
}

/** 输入框上方的回合活动指示(深度思考中… / 执行工具… + 已用时长,与网页版一致) */
let turnStatusStartedAt = 0;
let turnStatusActivity = "思考中…";
let turnStatusTimer: number | null = null;

// ---------- DOM 工具 ----------

const app = document.getElementById("app")!;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function markdownHtml(text: string): string {
  try {
    const raw = marked.parse(text, { async: false, breaks: true }) as string;
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  } catch {
    return "";
  }
}

function setHtml(node: HTMLElement, text: string) {
  node.innerHTML = markdownHtml(text);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * 把 git 统一 diff 文本渲染为「行号 + 新增绿 / 删除红」的代码视图(git 风格)。
 * 识别 +++/---(文件头)、@@ -a,b +c,d @@(hunk 头)、+/-/上下文/反斜杠行,并维护新旧行号。
 */
function renderGitDiffHtml(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let oldNo = 0;
  let newNo = 0;
  const row = (cls: string, oldNum: string, newNum: string, content: string) =>
    `<div class="diff-row ${cls}"><span class="diff-num">${oldNum}</span><span class="diff-num">${newNum}</span><span class="diff-content">${content}</span></div>`;
  for (const line of lines) {
    if (line.startsWith("+++") || line.startsWith("---")) {
      out.push(row("diff-meta", "", "", escapeHtml(line)));
      continue;
    }
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      out.push(row("diff-hunk", "", "", escapeHtml(line)));
      continue;
    }
    if (line.startsWith("+")) {
      out.push(row("diff-add", "", String(newNo || ""), escapeHtml(line)));
      newNo += 1;
      continue;
    }
    if (line.startsWith("-")) {
      out.push(row("diff-del", String(oldNo || ""), "", escapeHtml(line)));
      oldNo += 1;
      continue;
    }
    if (line.startsWith("\\")) {
      out.push(row("diff-note", "", "", escapeHtml(line)));
      continue;
    }
    out.push(row("", String(oldNo || ""), String(newNo || ""), escapeHtml(line)));
    oldNo += 1;
    newNo += 1;
  }
  return out.join("\n");
}

// ---------- 简约线条图标(统一 stroke 风格) ----------

const ICONS = {
  // 复制
  copy: "M9 11a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z|M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  // 点赞 / 点踩
  up: "M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z|M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3",
  down: "M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17",
  // 产物(盒子)
  box: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z|M3.27 6.96 12 12.01l8.73-5.05|M12 22.08V12",
  // 时钟(回合用时)
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 6v6l4 2",
  // 闹钟(定时任务 / 自动化任务)
  alarmClock:
    "M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z|M12 10v3.6l2.4 1.4|M5 3 2 6|M19 3l3 3|M6.5 22 4 20.5|M17.5 22 20 20.5",
  // 仪表盘(会话统计胶囊,网页端 IconGaugeOutline16 同款语义)
  gauge: "M4.6 19.5a9 9 0 1 1 14.8 0|M12 13.8l4.2-4.2|M12 18h.01",
  // 终端(命令类工具)
  terminal: "M4 17l6-5-6-5|M12 19h8",
  // 文件(读取 / 写入类工具)
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6",
  // 星芒(思考过程)
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  // 机器人(子代理 / 工作流)
  robot: "M4 10a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z|M12 4v4|M9 13v2|M15 13v2",
  // 清单(任务类工具)
  checklist: "M4 6h2v2H4z|M4 11h2v2H4z|M4 16h2v2H4z|M10 7h10|M10 12h10|M10 17h10",
  // 数据库(回合用量)
  database: "M12 2C7.58 2 4 3.34 4 5s3.58 3 8 3 8-1.34 8-3-3.58-3-8-3z|M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5|M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6",
  // 右上箭头(用默认应用打开)
  rightUp: "M7 17 17 7|M7 7h10v10",
  // 分支(↪)
  branch: "M6 3v12|M18 9a9 9 0 0 1-9 9|M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6z|M18 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  // 回退(逆时针)
  rewind: "M1 4v6h6|M3.51 15a9 9 0 1 0 2.13-9.36L1 10",
  // 分支并回退(向左上)
  corner: "M9 14 4 9l5-5|M20 20v-7a4 4 0 0 0-4-4H4",
  // 回到主线(左上箭头)
  backMain: "M17 17 7 7|M7 17V7h10",
  // 斜杠(命令输入)
  slash: "M7 17 17 7",
  // 加号 / 更多 / 地球 / 发送 / 停止
  plus: "M12 5v14|M5 12h14",
  more: "M12 12h.01|M19 12h.01|M5 12h.01",
  globe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z|M2 12h20|M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
  send: "M22 2 11 13|M22 2 15 22l-4-9-9-4z",
  stop: "M6 6h12v12H6z",
  // 工作区 / 任务 / 轨迹 / 设置 / 搜索
  list: "M8 6h13|M8 12h13|M8 18h13|M3 6h.01|M3 12h.01|M3 18h.01",
  ledger: "M4 4h16v16H4z|M8 8h8|M8 12h8|M8 16h5",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  search: "M21 21l-4.35-4.35|M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z",
  up2: "M12 19V5|M5 12l7-7 7 7",
  down2: "M12 5v14|M19 12l-7 7-7-7",
  x: "M18 6 6 18|M6 6l12 12",
  edit: "M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  trash: "M3 6h18|M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2|M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
  folder: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
  back: "M19 12H5|M12 19l-7-7 7-7",
  image: "M3 5h18v14H3z|M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z|M21 15l-5-5L5 21",
  // 提问(帮助圆圈)
  help: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3|M12 17h.01",
  // 勾选(多选复选框选中态)
  check: "M20 6 9 17l-5-5",
  // 信息(圆圈 i,系统提示词卡片)
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 16v-4|M12 8h.01",
  // 闪电(模型+思考胶囊)
  bolt: "M13 2 3 14h7l-1 8 10-12h-7z",
  // 右箭头(胶囊展开指示)
  chevronRight: "M9 18 15 12 9 6",
  // 警告三角(回合失败 / 上下文超限卡片)
  alert: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z|M12 9v4|M12 17h.01",
};

/** 创建简约线条 SVG 图标;paths 用 | 分隔多个 path d。 */
function lineIcon(paths: string, size = 14): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const d of paths.split("|")) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}

// ---------- 侧栏大面板(工作区 / 任务 / 轨迹 / 设置 / 子代理) ----------

const panels = createPanels({
  state,
  post: (msg) => vscode.postMessage(msg),
  el: (tag, cls, text) => el(tag as keyof HTMLElementTagNameMap, cls, text),
  t,
  setHtml,
  lineIcon,
  ICONS,
  showDialog,
  basename,
  fmtDuration,
  fmtClock,
  fmtTokens,
  selectSession: (sessionId) => vscode.postMessage({ kind: "select", sessionId }),
  openFile: (path) => vscode.postMessage({ kind: "openFile", path }),
  reveal: (path) => vscode.postMessage({ kind: "revealInExplorer", path }),
  requestAttachment: (_sessionId, attachmentId, messageId) => vscode.postMessage({ kind: "attachmentRead", attachmentId, messageId }),
  presetDisplayText,
  presetName,
  // 能力随 status 更新,经 getter 读取实时值(面板渲染时总取最新)
  get presetAuthoring() {
    return state.presetAuthoring;
  },
  // 输入区偏好:设置面板「发送与输入」读写同一份状态
  composerPrefs: {
    get sendKey() {
      return sendKeyMode;
    },
    get fontFamily() {
      return composerFontFamily;
    },
    get autoCollapseProducedFiles() {
      return autoCollapseProducedFiles;
    },
  },
} as PanelsContext);

/** 权限预设的中文名称(经 t() 翻译)。 */
const PERMISSION_LABELS: Record<string, string> = {
  "read-only": "只读",
  "workspace-write": "工作区可写",
  "danger-full-access": "完全访问(危险)",
  custom: "自定义",
};

/** 权限预设图标:只读 🔒 / 工作区可写 🖊️ / 完全访问 ⚠️(红色三角形警告)。 */
const PERMISSION_ICONS: Record<string, { icon: string; danger?: boolean }> = {
  "read-only": { icon: "🔒" },
  "workspace-write": { icon: "🖊️" },
  "danger-full-access": { icon: "⚠️", danger: true },
  custom: { icon: "🔓" },
};

function permissionIcon(value: string): string {
  return PERMISSION_ICONS[value]?.icon ?? "🔒";
}

function permissionLabel(value: string, fallback?: string): string {
  return t(PERMISSION_LABELS[value] ?? fallback ?? value);
}

// ---------- Agent 预设展示文案(与网页端 ui-agent-preset 一致) ----------

/**
 * 内置预设 id → 本地化键(源文案 = 中文,其余语言查词典)。
 * trust=system 时按 id 翻译名称与描述;用户预设保留文件元数据(不翻译)。
 */
const BUILT_IN_PRESET_TEXTS: Record<string, { name: string; description: string }> = {
  standard: {
    name: "标准模式",
    description: "处理代码、文件和资料,适合大多数任务。Agent 会按需使用检索、编辑和终端等工具。",
  },
  // DSH 0.2.0 起内置预设由 code 改名为 ptc(PTC = 批量工具调用派发):
  // 宿主 agentPresets/list 对内置预设只下发 id/order/isDefault(无 name/description),
  // 文案由客户端词典提供 —— 缺这一项时下拉里只剩一个光秃秃的「ptc」。
  ptc: {
    name: "PTC 模式",
    description: "包含标准模式的所有能力,更适合批量调用工具,并对结果进行筛选、整理、去重、统计或汇总的任务。",
  },
  // 0.1.x 的内置 id(更名前的部署仍可能出现)
  code: {
    name: "PTC 模式",
    description: "包含标准模式的所有能力,更适合批量调用工具,并对结果进行筛选、整理、去重、统计或汇总的任务。",
  },
  minimal: {
    name: "极简模式",
    description: "Agent 仅使用终端工具完成任务,适合测试和对比其基础表现。",
  },
  cordis: {
    name: "创造模式",
    description: "用对话定制 DSH:让 Agent 编写插件,添加新功能或界面;也能组合工具和提示词,创建自己的模式。",
  },
};

/** 与网页端 presetDisplayText 同款:内置(system)预设按 id 本地化,用户预设用文件元数据。 */
function presetDisplayText(preset: { id: string; name?: string; description?: string; trust?: string }): { name: string; description?: string } {
  // 内置 id(标准/编码/极简/创造)按当前语言词典本地化 —— 不依赖 trust 字段:
  // 部分部署/入口可能不提供 trust,或内置元数据本身是中文;按 id 命中即本地化,
  // 用户预设(file 元数据)除外。
  let keys: { name: string; description: string } | undefined;
  if (preset.trust !== "user") keys = BUILT_IN_PRESET_TEXTS[preset.id];
  if (keys !== undefined) return { name: t(keys.name), description: t(keys.description) };
  return { name: preset.name ?? preset.id, ...(preset.description === undefined ? {} : { description: preset.description }) };
}

/** 会话/列表等仅需名称的场景:本地化后的预设名,查不到回退 id。 */
function presetName(id: string): string {
  const p = state.presets?.find((x) => x.id === id);
  return p ? presetDisplayText(p).name : id;
}

// ---------- 国际化(中文为源语言,英文词典翻译;宿主传入显示语言) ----------

const EN_TEXT: Record<string, string> = {
  "向 DeepSeek Harness 发送消息…": "Message DeepSeek Harness…",
  "Enter 发送 · Shift+Enter 换行": "Enter to send · Shift+Enter for newline",
  "运行中 · 消息将排队发送": "Running · message will be queued",
  "运行中 · ⏹ 停止": "Running · ⏹ stop",
  "新建会话": "New session",
  "会话操作:分叉 / 重命名 / 归档": "Session actions: fork / rename / archive",
  "在浏览器中打开": "Open in browser",
  "— 选择会话 —": "— Select session —",
  "思考深度(推理强度)": "Thinking depth (reasoning effort)",
  "模型与思考(推理强度)": "Model & thinking effort",
  "模型": "Model",
  "应如何批准操作?": "How should operations be approved?",
  "了解更多": "Learn more",
  "会话已开始,预设不可切换(新会话可选)": "This session has started: the preset is fixed (choose it for new sessions)",
  "选择 Agent 预设(新会话生效)": "Choose an Agent preset (applies to new sessions)",
  "只读访问:不能修改文件或执行命令;外部文件与网络访问按策略询问": "Read-only: cannot modify files or run commands; external files and network access are asked per policy",
  "可修改工作区内的文件;外部文件与网络访问按策略询问": "Can modify files inside the workspace; external files and network access are asked per policy",
  "可不受限制地访问互联网和你电脑上的任何文件": "Unrestricted access to the internet and any file on your computer",
  "自定义组合(在设置中编辑)": "Custom combination (edit in settings)",
  "Agent 预设": "Agent preset",
  "读写权限(沙箱模式 + 审批策略)": "Read/write permission (sandbox + approval policy)",
  "输入命令(/plan、/compact、.claude 命令…)": "Enter command (/plan, /compact, .claude commands…)",
  "添加文件或文件夹到对话": "Add file or folder to the conversation",
  "停止回复": "Stop response",
  "发送(Enter)": "Send (Enter)",
  "发送(运行中,消息将排队)": "Send (running, message will be queued)",
  "未连接": "Not connected",
  "已连接": "Connected",
  "启动中…": "Starting…",
  "连接中…": "Connecting…",
  "未连接 · 点击重试": "Not connected · click to retry",
  "深度思考中…": "Deep diving…",
  "执行工具…": "Running tools…",
  "生成回答…": "Writing…",
  "思考中…": "Thinking…",
  "复制回答": "Copy answer",
  "好的回答(记录反馈)": "Good answer (record feedback)",
  "差的回答(记录反馈)": "Bad answer (record feedback)",
  "分支 / 回退": "Branch / rewind",
  "回退到此处": "Rewind to here",
  "撤销本回合文件改动": "Undo this turn's file changes",
  "撤销本回合改动并新建分支": "Undo this turn's changes and branch from here",
  "对比": "Compare",
  "查看检查点": "View checkpoints",
  "还原检查点": "Restore checkpoint",
  "仅撤销本回合产生的文件改动;你自己的提交与 HEAD 不受影响": "Only reverts the files changed by this turn; your own commits and HEAD stay untouched",
  "切换权限": "Switch permission",
  "回退回合改动": "Undo this turn's changes",
  "重做回退": "Redo rollback",
  "回退确认": "Rollback confirmation",
  "确认回退": "Confirm rollback",
  "正在计算差异…": "Computing diff…",
  "回退到回合 {turn} 之前": "Rollback to before turn {turn}",
  "将撤销自该检查点以来的以下改动:": "The following changes since this checkpoint will be reverted:",
  "无文件差异": "No file differences",
  "二进制文件": "Binary file",
  "加载差异…": "Loading diff…",
  "未跟踪文件清单不可用(检查点记录截断),回退后请手动检查工作区": "Untracked-file list unavailable (checkpoint record truncated); check the workspace manually after rollback",
  "将删除新建的未跟踪文件({count} 个)": "Will delete {count} untracked file(s) created after the checkpoint",
  "共 {files} 个文件,+{added} 行,−{deleted} 行": "{files} files, +{added} −{deleted} lines",
  "差异过大,仅显示前 300 个文件": "Diff too large; showing the first 300 files only",
  "回退前状态会先存入保存点,/redo 可恢复;忽略文件不受影响": "The pre-rollback state is saved first (/redo restores it); ignored files are never touched",
  "「撤销该回合改动」只回退该回合自身产生的文件改动,不动你自己提交的内容;「回退到此回合前」为整体回退。/undo 与 /redo 命令同样可用。清理 refs/dsh/checkpoints|saves/<会话ID> 与 .dsh/rollback 记录": "\"Undo this turn\" only reverts file changes produced by that turn, never your own commits; \"Rollback to before this turn\" reverts everything. /undo and /redo work too. Clean up refs/dsh/checkpoints|saves/<sessionId> and .dsh/rollback records",
  "检查点": "Checkpoints",
  "会话共 {count} 个检查点 · HEAD {head} · 未提交改动 {dirty} 项": "{count} checkpoints · HEAD {head} · {dirty} uncommitted changes",
  "回合 {turn}": "Turn {turn}",
  "个文件": "files",
  "回退到此回合前": "Rollback to before this turn",
  "暂无检查点。检查点会在每个回合开始前自动创建(turn/start 时快照工作区)": "No checkpoints yet. Checkpoints are created automatically when each turn starts (workspace snapshot at turn/start)",
  "/rollback [N] 直接回退;/redo 恢复最近回退;清理 refs/dsh/checkpoints|saves/<会话ID> 与 .dsh/rollback 记录": "/rollback [N] rolls back directly; /redo restores the last rollback; cleanup: git update-ref -d refs/dsh/checkpoints|saves/<sessionId> plus the .dsh/rollback record",
  "差异不可用": "Diff unavailable",
  "撤销回合改动": "Undo turn's changes",
  "将撤销该回合产生的以下改动(你的提交与 HEAD 不受影响):": "The following changes produced by that turn will be reverted (your commits and HEAD are untouched):",
  "该回合没有文件改动": "That turn changed no files",
  "确认撤销": "Confirm undo",
  "撤销仅反向应用该回合自身的改动;你自己提交的内容与 HEAD 保持不变。": "The undo only reverses that turn's own changes; your commits and HEAD stay untouched.",
  "撤销该回合改动": "Undo this turn's changes",
  "该回合没有可精确撤销的快照;可用「回退到此回合前」整体回退": "No undoable snapshot for that turn; use \"Rollback to before this turn\" instead",
  "从此处新建分支": "Branch from here",
  "回到主线(父会话)": "Back to main line (parent session)",
  "重命名会话": "Rename session",
  // ---- 顶部改版:新建对话按钮与会话菜单(去 emoji) ----
  "新建对话": "New chat",
  "分叉会话": "Fork session",
  "复制会话 ID": "Copy session ID",
  "新会话": "New session",
  "修改会话标题(已填入当前标题):": "Edit the session title (current title pre-filled):",
  "重命名": "Rename",
  "取消": "Cancel",
  "确定": "OK",
  "归档会话": "Archive session",
  "归档后该会话将从列表隐藏(仍保留在 DSH 服务器,可在浏览器 GUI 中恢复)。确定归档?": "The session will be hidden from the list (kept on the DSH server, restorable in the browser GUI). Archive it?",
  "归档": "Archive",
  "✏️ 重命名会话": "✏️ Rename session",
  "🔀 分叉会话": "🔀 Fork session",
  "🗄️ 归档会话": "🗄️ Archive session",
  // ---- 0.2.1:会话工作目录 / 复制会话 ID ----
  "📋 复制会话 ID": "📋 Copy session ID",
  "已复制会话 ID": "Session ID copied",
  "工作目录:{name}": "Working directory: {name}",
  "当前生效的工作目录:{path}\n点击在资源管理器中显示": "Effective working directory: {path}\nClick to reveal in the file explorer",
  "工作目录已切换为 {path}": "Working directory changed to {path}",
  // ---- 0.2.1-rc.2:设置命名空间(动态键,见 panels.ts 的 NAMESPACE_TITLES) ----
  "网页能力": "Web capability",
  "网页搜索(DeepSeek API)": "Web search (DeepSeek API)",
  // ---- 计划审阅(对齐网页端 PlanReviewPanel / PlanPreview) ----
  "查看全文": "View full text",
  "在整页预览中查看完整计划": "Read the complete plan in a full-page preview",
  "计划预览": "Plan preview",
  "打开计划文件": "Open plan file",
  "没有可显示的计划内容": "No plan content to show",
  "关闭审阅,去补充意见": "Close review and add comments",
  "关闭本次计划审阅;Agent 会结束本轮并等待你直接输入修改意见":
    "Close this plan review; the agent will end the turn and wait for your comments",
  "已关闭计划审阅:请直接输入修改意见,Agent 正在等待你的反馈":
    "Plan review closed: type your changes and the agent, which is waiting, will pick them up",
  "📝 计划模式(切换中…)": "📝 Plan mode (switching…)",
  "📝 计划模式": "📝 Plan mode",
  "点击退出计划模式(发送 /plan off)": "Click to exit plan mode (sends /plan off)",
  "🎯 目标模式": "🎯 Goal mode",
  "点击管理目标(修改 / 完成 / 清除)": "Click to manage the goal (edit / complete / clear)",
  "✏️ 修改目标": "✏️ Edit goal",
  "修改目标描述(已填入当前目标):": "Edit the goal description (current goal pre-filled):",
  "保存": "Save",
  "✅ 完成目标": "✅ Complete goal",
  "🗑️ 清除目标(取消)": "🗑️ Clear goal (cancel)",
  "计划模式": "Plan mode",
  "压缩上下文": "Compact context",
  "立即执行 /compact;压缩进度显示在对话中": "Run /compact immediately; progress appears in the conversation",
  "命令": "Command",
  "压缩摘要不可用": "Compaction summary unavailable",
  "点击展开压缩摘要": "Click to view the compaction summary",
  "上下文已压缩": "Context compacted",
  "已压缩 {items} 条历史记录(约 {tokens} tokens)": "Compacted {items} history items (~{tokens} tokens)",
  "正在压缩上下文…": "Compacting context…",
  "上下文接近上限": "Context near its limit",
  "上下文接近模型上限,建议先压缩": "The context is near the model's limit — compact it before continuing",
  "上下文接近模型上限,建议压缩后再继续": "The context is near the model's limit; compact it before continuing",
  "接近模型上限,建议先压缩上下文": "Near the model limit — compact the context first",
  "上下文接近上限,可考虑压缩": "The context is near its limit — consider compacting",
  "上下文已用 {p},可考虑压缩": "{p} of the context is used — consider compacting",
  "切换模型": "Switch model",
  "打开模型列表,换用上下文窗口更大的模型": "Open the model list and pick a model with a larger context window",
  "回合失败": "Turn failed",
  "已达模型输出上限": "Output token limit reached",
  "模型在本回合达到最大输出 token 数,回答可能被截断;可让它继续,或改用更小的任务重试。": "The model hit its maximum output tokens this turn, so the answer may be truncated; ask it to continue, or retry with a smaller task.",
  "上下文已超出模型窗口": "Context exceeded the model window",
  "当前上下文约 {used} / {limit} tokens,已超出该模型的上下文窗口:{message}": "The context is about {used} / {limit} tokens, past this model's context window: {message}",
  "当前上下文已超出该模型的上下文窗口:{message}": "The context is past this model's context window: {message}",
  "本次输入预计使上下文达到约 {used} / {limit} tokens,已超出该模型窗口;宿主会自动压缩或重试,若失败请手动压缩或换用更大窗口的模型。": "This input brings the context to about {used} / {limit} tokens, past this model's window; the host compacts and retries automatically — if that fails, compact manually or switch to a model with a larger window.",
  "本次输入预计使上下文达到约 {used} / {limit} tokens,接近该模型窗口上限;建议先压缩上下文再继续。": "This input brings the context to about {used} / {limit} tokens, near this model's window limit; compact the context before continuing.",
  "宿主未提供失败详情(旧版宿主或运行中止)": "The host provided no failure detail (older host, or the run was interrupted)",
  "{code}: {message}": "{code}: {message}",
  "设置目标": "Set goal",
  "记录反馈": "Record feedback",
  "切换权限(插入命令)": "Switch permission (inserts command)",
  "切换权限(直接应用)": "Switch permission (apply directly)",
  "技能(插入提示词)": "Skills (insert prompt)",
  ".claude 配置": ".claude configuration",
  "✅ CLAUDE.md · DSH 已自动读取": "✅ CLAUDE.md · auto-loaded by DSH",
  "插入 .claude 命令模板": "Insert .claude command template",
  "插入 .claude 技能说明(SKILL.md)": "Insert .claude skill description (SKILL.md)",
  "本轮调用 {n} 个工具": "Called {n} tools this turn",
  "本轮生成的文件 ({n})": "Files produced this turn ({n})",
  "完整历史请到 DSH 网页版查看": "See the full history in the DSH web GUI",
  "子代理最近回复": "Subagent recent reply",
  "上下文 {pct}%": "Context {pct}%",
  "LLM {llm} · 工具 {tool}": "LLM {llm} · tools {tool}",
  "首 token 平均 {avg}s": "Avg first token {avg}s",
  "{tps} tok/s": "{tps} tok/s",
  "缓存命中 {pct}%": "Cache hit {pct}%",
  "输入 {in} tok · 输出 {out} tok": "Input {in} tok · output {out} tok",
  "⚠️ 尚未选择会话,点击 ＋ 新建一个会话": "⚠️ No session selected; click ＋ to create one",
  "⚠️ 当前会话还没有可回退的回合": "⚠️ This session has no turns to rewind",
  "⚠️ 还没有可选择的回退点": "⚠️ No rewind point available yet",
  "📎 附件上下文(已注入模型,点击展开)": "📎 Attachment context (injected into the model, click to expand)",
  "激活文件 · ": "Active file · ",
  "⬆ 加载更早的消息": "⬆ Load earlier messages",
  "📄 添加文件": "📄 Add file",
  "📁 添加文件夹": "📁 Add folder",
  "只读": "Read only",
  "工作区可写": "Workspace write",
  "完全访问(危险)": "Full access (danger)",
  "自定义": "Custom",
  "进行中": "active",
  "已完成": "completed",
  "已阻塞": "blocked",
  "已暂停": "paused",
  "更新于": "updated",
  "第 {n}/{m} 轮": "round {n}/{m}",
  "请使用技能「{name}」处理:": "Use the skill \"{name}\" for:",
  "命令 / 技能": "Commands / skills",
  "命令 {name}": "Command {name}",
  "插入 /名称 调用技能(发送时自动展开技能正文)": "Insert /name to invoke the skill (the body is expanded when sending)",
  "子代理 {label}({state}) · 点击查看最近回复": "Subagent {label} ({state}) · click to view recent reply",
  "运行中": "running",
  "已结束": "finished",
  "ℹ️ 系统提示词": "ℹ️ System note",
  "插入 .codex 技能说明(SKILL.md)": "Insert .codex skill description (SKILL.md)",
  "插入 Copilot 工作区指令": "Insert Copilot workspace instructions",
  "插入 Copilot 指令文件": "Insert Copilot instruction file",
  "插入 Copilot 智能体定义": "Insert Copilot agent definition",
  "插入 Copilot 提示词": "Insert Copilot prompt",
  "插入 .dsh 技能说明(SKILL.md)": "Insert .dsh skill description (SKILL.md)",
  "插入 /名称 调用技能(宿主自动展开技能正文)": "Insert /name to invoke (the host expands the skill body)",
  "在 VS Code 中打开智能体定义文件": "Open the agent definition file in VS Code",
  "在 VS Code 中打开记忆文件": "Open the memory file in VS Code",
  "插入 .dsh 智能体定义": "Insert .dsh agent definition",
  "记忆 {name}": "Memory {name}",
  "插入 .dsh 记忆内容": "Insert .dsh memory content",
  "提问": "Question",
  "放弃整组问题": "Dismiss all questions",
  "第 {i} 题 / 共 {n} 题": "Question {i} of {n}",
  "下一题": "Next",
  "上一题": "Previous question",
  "输入你的答案(填写即视为自定义回答)": "Type your answer (typing counts as a custom answer)",
  "去聊天里说": "Chat about it",
  "输入修改意见,回车发送": "Type feedback, press Enter to send",
  "拒绝": "Refuse",
  "确认执行": "Approve",
  "会话": "Sessions",
  "会话(当前目录)": "Sessions (current folder)",
  "显示全部会话": "Show all sessions",
  "仅显示当前目录会话": "Show current-folder sessions only",
  "显示其他目录的会话": "Show sessions from other folders",
  "默认只显示当前工作目录的会话": "By default only sessions in the current workspace folder are shown",
  "暂无会话": "No sessions",
  "智能体": "Agents",
  "系统提示词": "System prompt",
  "任务": "To-dos",
  "{n} 已完成": "{n} completed",
  "{n} 进行中": "{n} in progress",
  "{n} 待处理": "{n} pending",
  "本轮用量": "Turn usage",
  "用量 {total}": "Usage {total}",
  "提供方 / 模型": "Provider / model",
  "缓存命中": "Cache hit",
  "未缓存输入": "Uncached input",
  "缓存读取": "Cache read",
  "缓存写入": "Cache write",
  "输出": "Output",
  "（其中推理 {tokens}）": " ({tokens} reasoning)",
  "本轮用时和速度": "Turn time and speed",
  "本轮总用时": "Total turn time",
  "输出速度（TPS）": "Tokens per second (TPS)",
  "首 token 用时（TTFT）": "Time to first token (TTFT)",
  "用时 {duration}": "Ran for {duration}",
  "{minutes}分{seconds}秒": "{minutes}m {seconds}s",
  "{seconds}秒": "{seconds}s",
  "{m}月{d}日": "{m}/{d}",
  "{y}年{m}月{d}日": "{y}-{m}-{d}",
  "用默认应用打开": "Open with default app",
  "更多操作": "More actions",
  "读取": "Read",
  "写入": "Write",
  "搜索": "Search",
  "工具调用": "Tool call",
  "技能": "Skill",
  "网页搜索": "Web search",
  "网页获取": "Web fetch",
  "读取图片": "Read image",
  "失败": "Failed",
  "产物": "Deliverable",
  "代码": "Code",
  "工具定义": "Tool definitions",
  "对话消息": "Messages",
  "上下文已用 {p}": "{p} of context used",
  "⚠️ 最多一次添加 8 张图片": "⚠️ Up to 8 images can be added at once",
  "⚠️ 非图片附件请从资源管理器复制(未提供本地路径)": "⚠️ Copy non-image attachments from the file explorer (no local path was provided)",
  "⚠️ 图片超过 6MB 已跳过:{name}": "⚠️ Image larger than 6 MB skipped: {name}",
  "⚠️ 无法识别的图片格式:{name}(支持 PNG/JPEG/GIF/WebP)": "⚠️ Unrecognized image format: {name} (PNG/JPEG/GIF/WebP supported)",
  "⚠️ 粘贴图片失败:{error}": "⚠️ Pasting the image failed: {error}",
  "✅ 已添加 {n} 张图片": "✅ Added {n} image(s)",
  "已注入模型 · 点击展开": "Injected into the model · click to expand",
  "提交回答": "Submit answer",
  "🔧 过程": "🔧 Process",
  "🎯 目标": "🎯 Goal",
  "⏸ 暂停目标": "⏸ Pause goal",
  "▶ 继续目标": "▶ Resume goal",
  "🗑️ 取消目标": "🗑️ Cancel goal",
  "修改目标": "Edit goal",
  "暂停目标": "Pause goal",
  "继续目标": "Resume goal",
  "完成目标": "Complete goal",
  "取消目标": "Cancel goal",
  "共 {n} 轮": "{n} rounds total",
  "等待推进": "awaiting progression",
  "第 {n} 轮": "round {n}",
  "插件(Cordis)": "Plugins (Cordis)",
  "列出插件状态": "List plugin status",
  "运行插件 <id>": "Run plugin <id>",
  "更新插件 <id>": "Update plugin <id>",
  "停止插件 <id>": "Stop plugin <id>",
  "删除插件 <id>": "Remove plugin <id>",
  "点击管理目标(暂停 / 修改 / 完成 / 取消)": "Manage goal (pause / edit / complete / cancel)",
  "跳过本题": "Skip this question",
  "推荐": "Recommended",
  "📋 计划审批": "📋 Plan review",
  "✅ 批准计划并开始执行": "✅ Approve plan and start",
  "✏️ 继续修改计划": "✏️ Keep editing the plan",
  "⚠️ 请选择一个选项或填写自定义回答": "⚠️ Select an option or type a custom answer",
  "收起提问卡片": "Collapse question card",
  "展开提问卡片": "Expand question card",
  // ---- 头部按钮与图片附件 ----
  "工作区(分组 / 搜索 / 归档)": "Workspaces (groups / search / archive)",
  "后台任务": "Background jobs",
  "自动化任务": "Automation tasks",
  // ---- 发送快捷键(设置面板 + 输入框提示胶囊) ----
  "⌨️ 发送与输入": "⌨️ Sending & input",
  "按 Enter 是发送还是换行由此决定;输入框左下角的胶囊也能一键切换,设置会全局保存(dsh.sendKey)。":
    "This decides whether Enter sends or inserts a newline. The pill at the bottom-left of the composer switches it too; the choice is stored globally (dsh.sendKey).",
  "输入区字体(留空跟随 VS Code 界面字体)": "Composer font (empty = follow the VS Code UI font)",
  "产物文件列表默认折叠": "Collapse produced-file lists by default",
  "默认把每轮的产物文件折叠为一行摘要,避免长对话被文件卡占满":
    "Collapse each turn's produced files into a one-line summary by default, so long conversations are not filled with file cards.",
  "旧会话无法撤销反馈": "Older sessions cannot revoke feedback",
  // ---- 定时任务(0.1.7 自动化任务面板) ----
  "一次性": "Once",
  "周一,周二,周三,周四,周五,周六,周日": "Mon,Tue,Wed,Thu,Fri,Sat,Sun",
  "搜索任务": "Search tasks",
  "全部": "All",
  "已开启": "Enabled",
  "重新读取任务列表": "Reload the task list",
  "正在加载任务…": "Loading tasks…",
  "当前宿主未提供定时任务能力:请在宿主设置中启用定时任务插件后重试(0.1.7 起默认为关闭)。":
    "This host does not provide scheduled tasks: enable the scheduled-task plugin in the host settings and retry (off by default since 0.1.7).",
  "还没有自动化任务,在会话中创建的任务会显示在这里": "No automation tasks yet. Tasks created in your sessions appear here.",
  "没有匹配的自动化任务": "No matching automation tasks",
  "下次计划时间:": "Next scheduled time: ",
  "关联会话": "Linked session",
  "状态": "Status",
  "下次计划时间": "Next scheduled time",
  "提醒频率": "Frequency",
  "时区": "Time zone",
  "最近一次投递": "Last delivery",
  "任务 ID": "Task ID",
  "确认删除": "Confirm deletion",
  "删除任务": "Delete task",
  "删除此任务?": "Delete this task?",
  "重新读取运行记录": "Reload delivery records",
  "关闭详情": "Close details",
  "收起任务详情": "Collapse task details",
  "任务运行记录": "Delivery records",
  "正在加载任务运行记录…": "Loading delivery records…",
  "暂无任务运行记录": "No delivery record available",
  "无法加载任务运行记录": "Could not load delivery records.",
  "更早的运行记录已清理": "Earlier delivery records have been cleared",
  "加载更多": "Load more",
  "加载更早的运行记录": "Load earlier delivery records",
  "无法删除任务": "Could not delete the task.",
  "任务可能已不存在": "The task may no longer exist.",
  "当前宿主的预设由 Cordis 组合声明,不再提供本地预设作者端点(复制 / 打开目录 / 删除);此处只能查看组合文本。":
    "This host declares presets through Cordis composition and no longer provides local preset authoring (copy / open folder / delete); only the composition text can be viewed here.",
  "展开 / 收起这一段过程": "Expand / collapse this run of steps",
  "暂无工具调用": "No tool calls yet",
  // ---- 0.2.0 异步问答(限时提问) ----
  "{seconds}s 后继续": "Continues in {seconds}s",
  "等待已结束 · 可稍后回答": "Wait ended · you can still answer later",
  "等待已到期,Agent 已继续工作;你的回答会作为后续消息送达":
    "The wait expired and the agent carried on; your answer is delivered as a follow-up message.",
  "限时提问:等待到期后 Agent 会先继续工作,你仍可稍后回答":
    "Timed question: when the wait expires the agent carries on, and you can still answer later.",
  // ---- 输入历史(↑/↓ 调回,issue #20) ----
  "历史 {index}/{total}": "History {index}/{total}",
  // ---- 输入历史:↑/↓ 召回时机(dsh.historyKey) ----
  "输入历史:↑/↓ 调回之前发送过的内容": "Input history: ↑/↓ recall what you sent before",
  "↑/↓ 到边界才召回历史": "↑/↓ recall only at the edge",
  "光标还能上下移动时只移动光标;已经到首行 / 末行时,那一次按键立即调回历史(推荐:不会抢走光标移动)":
    "Move the caret while it can still move; once it is on the first/last line, that press recalls history (recommended: never steals caret movement)",
  "↑/↓ 一按就召回历史": "↑/↓ recall on every press",
  "普通 ↑/↓ 不再移动光标,按下即调回上一条 / 下一条输入;要移动光标请用鼠标或 ←/→":
    "Plain ↑/↓ no longer move the caret and recall the previous/next input immediately; move the caret with the mouse or ←/→",
  "关闭 ↑/↓ 召回": "Disable ↑/↓ recall",
  "普通方向键只移动光标;仍可用 Ctrl/Alt + ↑/↓ 调回历史":
    "Plain arrow keys only move the caret; Ctrl/Alt + ↑/↓ still recall history",
  "Ctrl/Alt + ↑/↓ 在任何模式下都能立即调回历史;模式保存在 dsh.historyKey。":
    "Ctrl/Alt + ↑/↓ recall history immediately in every mode; the mode is stored in dsh.historyKey.",
  "已是最早的输入": "Already at the earliest input",
  // ---- 会话被其他 DSH 实例占用(session/writer-held) ----
  "当前会话已被其他 DSH 实例占用(桌面端 / 另一个 dsh web),不能切换模型、重命名或发送消息;换一个会话或退出该实例后重试":
    "Another running DSH instance (the desktop app or another dsh web) holds this session, so switching the model, renaming or sending is refused. Switch to another session, or quit that instance and retry.",
  // ---- 发送快捷键提示(issue #21 第 1 条) ----
  "Ctrl+Enter 发送 · Enter 换行": "Ctrl+Enter sends · Enter inserts a newline",
  "Shift+Enter 发送 · Enter 换行": "Shift+Enter sends · Enter inserts a newline",
  "Shift/Ctrl+Enter 确认 · Esc 取消": "Shift/Ctrl+Enter confirms · Esc cancels",
  "执行了 {n} 条命令": "{n} command(s)",
  "读取了 {n} 个文件": "{n} file(s) read",
  "修改了 {n} 个文件": "{n} file(s) changed",
  "搜索了 {n} 次": "{n} search(es)",
  "访问了 {n} 个网页": "{n} page(s) fetched",
  "调用了 {n} 个工具": "{n} tool call(s)",
  "{n} 小时": "{n} hours",
  "{n} 分钟": "{n} minutes",
  "{n} 秒": "{n} seconds",
  "一次性(创建后 {d})": "Once (after {d})",
  "每 {d}": "Every {d}",
  "每天 {time}": "Daily at {time}",
  "每周 {days} {time}": "Weekly {days} at {time}",
  "Cron {expr}": "Cron {expr}",
  "{absolute}(已到期)": "{absolute} (due)",
  "{absolute}({relative}后)": "{absolute} (in {relative})",
  "{m}月{d}日 {clock}": "{m}/{d} {clock}",
  "{y}年{m}月{d}日 {clock}": "{y}/{m}/{d} {clock}",
  "、": ", ",
  "轨迹(事件台账)": "Trajectory (event ledger)",
  "设置(常规 / 模型 / 预设)": "Settings (general / models / presets)",
  "🖼️ 添加图片": "🖼️ Add image",
  // ---- 排队消息 ----
  "⏳ 排队中(运行结束后自动发送)": "⏳ Queued (sent automatically when the run finishes)",
  "编辑": "Edit",
  "插队": "Steer now",
  "移除": "Remove",
  "编辑排队消息": "Edit queued message",
  "修改后立即生效": "Applies immediately",
  "当前回合已结束,无法插队;消息将在下一轮自动处理": "The current turn has ended and no longer accepts steering; the message will be sent automatically in the next turn",
  // ---- Cordis 插件审批(网页端 Cordis 浮窗面板同款) ----
  "Cordis 插件": "Cordis plugins",
  "Cordis 插件({n} 个待审批)": "Cordis plugins ({n} awaiting approval)",
  "Cordis 插件审批": "Cordis plugin approval",
  "(未填写用途)": "(no purpose given)",
  "仅允许此版本": "Allow this version only",
  "允许后续版本": "Allow future versions of this plugin",
  "仅授权当前版本运行,后续版本更新时需再次审批": "Allows only the current version to run; future updates will ask again",
  "授权此插件的所有后续版本自动运行,无需再次审批": "Allows all future versions of this plugin to run automatically without asking again",
  "更新": "Update",
  "运行": "Run",
  // ---- @ 引用菜单(rc.8 网页端同款:文件与文件夹 / Session 对话) ----
  "文件与文件夹": "Files & folders",
  "Session 对话": "Session conversations",
  "Session": "Session",
  "（无工作目录）": "(no cwd)",
  "正在加载文件资源…": "Loading files…",
  "正在加载会话列表…": "Loading sessions…",
  // ---- 目标创建 ----
  "🎯 设置目标": "🎯 Set goal",
  "创建一个长期目标(agent 自动多轮推进直至完成)": "Create a long-running goal (the agent keeps pushing until done)",
  "目标描述(agent 将自动多轮推进直至完成):": "Goal description (the agent auto-advances rounds until done):",
  "最大轮数(留空不限制):": "Max rounds (leave empty for unlimited):",
  "创建": "Create",
  // ---- 工作区面板 ----
  "关闭": "Close",
  "等待审批": "Waiting for approval",
  "计划待审": "Plan awaiting review",
  "等待回答": "Waiting for answer",
  "📁 工作区": "📁 Workspaces",
  "搜索会话(标题 / 内容)…": "Search sessions (title / content)…",
  "＋ 添加工作区": "＋ Add workspace",
  "选择现有文件夹作为工作区": "Pick an existing folder as a workspace",
  "搜索中…": "Searching…",
  "没有匹配的会话": "No matching sessions",
  "搜索失败": "Search failed",
  "上移工作区": "Move workspace up",
  "下移工作区": "Move workspace down",
  "重命名工作区": "Rename workspace",
  "新标题(仅显示名,不影响目录)": "New title (display only; the directory is untouched)",
  "移除工作区(会话保留为未分组)": "Remove workspace (sessions become ungrouped)",
  "移除工作区": "Remove workspace",
  "确定移除工作区": "Remove workspace",
  "目录与会话日志都保留,会话变为未分组。": "The directory and session logs are kept; sessions become ungrouped.",
  "未分组": "Ungrouped",
  "🗄️ 已归档": "🗄️ Archived",
  "打开": "Open",
  "归档会话仍保留在服务器,可继续查看": "Archived sessions stay on the server and can still be opened",
  "在组内上移": "Move up in group",
  "在组内下移": "Move down in group",
  // ---- 任务面板 ----
  "⚙️ 后台任务": "⚙️ Background jobs",
  "当前会话没有后台任务。agent 启动的 bash/pwsh/子代理等任务会出现在这里。": "No background jobs for this session. Bash/pwsh/subagent jobs started by the agent appear here.",
  "提示:后台任务的启动与终止由 agent 的 job 工具完成;若需终止,可让 agent 执行 job_kill。": "Note: background jobs are started/stopped by the agent's job tools; ask the agent to run job_kill to stop one.",
  // ---- 轨迹面板 ----
  "🧭 事件轨迹": "🧭 Event trajectory",
  "筛选事件类型(如 tool/call)…": "Filter by event type (e.g. tool/call)…",
  "(空)没有匹配的事件。轨迹来自当前会话的已加载历史。": "(empty) No matching events. The trajectory covers the loaded history of the current session.",
  "事件序号(seq)": "Event sequence (seq)",
  "点击展开完整 JSON": "Click to expand the full JSON",
  // ---- 设置面板 ----
  "⚙️ 设置": "⚙️ Settings",
  "常规": "General",
  "模型与供应商": "Models & providers",
  "加载设置中…": "Loading settings…",
  "⚠️ 设置存储为只读,表单仅可查看。": "⚠️ The settings store is read-only; the form is view-only.",
  "没有可配置的常规设置项。": "No configurable general settings.",
  "供应商路由": "Provider routes",
  "加载供应商目录中…": "Loading provider directory…",
  "已注册(可请求)": "Registered (requestable)",
  "未激活(配置后可用)": "Inactive (usable once configured)",
  "模型目录": "Model catalog",
  "发现模型(探测端点)": "Discover models (probe endpoint)",
  "适配器(namespace)": "Adapter (namespace)",
  "路由名(可选)": "Route name (optional)",
  "API 端点": "API endpoint",
  "API Key(临时,不保存)": "API key (temporary, never stored)",
  "🔍 发现模型": "🔍 Discover models",
  "询问端点可用的模型,不写入任何设置": "Ask the endpoint which models it serves; nothing is written",
  "探测中…": "Probing…",
  "探测失败": "Discovery failed",
  "需重启": "restart required",
  "清除": "Clear",
  "从凭据存储删除该密钥": "Delete this secret from credential storage",
  "该变体无可用字段,使用 JSON 编辑器:": "This variant has no form fields; use the JSON editor:",
  "💾 保存": "💾 Save",
  "仅提交修改过的字段": "Only changed fields are submitted",
  "↺ 重置命名空间": "↺ Reset namespace",
  "清空该命名空间的用户层设置,恢复默认": "Clear this namespace's user layer and restore defaults",
  "重置命名空间": "Reset namespace",
  "确定清除": "Reset",
  "的全部自定义设置并恢复默认值?": " custom settings and restore defaults?",
  "部署未组合任何 Agent 预设,所有会话共享宿主组合。": "This deployment composes no agent presets; every session shares the host composition.",
  "默认": "default",
  "用户预设": "user preset",
  "查看组合文本": "View composition text",
  "复制为新预设(本地作者)": "Copy as a new preset (local authoring)",
  "新预设 id(小写字母数字与连字符)": "New preset id (lowercase letters, digits, hyphens)",
  "复制预设": "Copy preset",
  "显示名(可留空)": "Display name (optional)",
  "打开预设目录": "Open preset directory",
  "删除预设": "Delete preset",
  "确定删除预设": "Delete preset",
  "提示:预设组合文本是唯一编辑器。复制后通过\"打开预设目录\"在 VS Code 中编辑 cordis.yml;新会话创建时可选自定义预设。": "Note: the composition text is the only editor. Copy a preset, then \"Open preset directory\" to edit cordis.yml in VS Code; custom presets are selectable for new sessions.",
  "读取预设失败": "Failed to read preset",
  "未知错误": "Unknown error",
  "组合": "Composition",
  "读取设置失败": "Failed to read settings",
  "保存失败": "Save failed",
  "读取模型信息失败": "Failed to read model info",
  // ---- 子代理面板 ----
  "🤖 子代理": "🤖 Subagent",
  "⏹ 打断": "⏹ Interrupt",
  "终止该子代理当前回合": "Interrupt this subagent's current turn",
  "向子代理发送消息(仅 continuable)…": "Message the subagent (continuable only)…",
  "发送": "Send",
  "Enter 发送": "Enter to send",
  "Ctrl+Enter 发送": "Ctrl+Enter to send",
  "Shift+Enter 发送": "Shift+Enter to send",
  "加载子代理记录中…": "Loading subagent transcript…",
  "执行中…": "Running…",
  "加载更早的记录": "Load earlier records",
  "向前翻页": "Page back",
  "读取子代理记录失败": "Failed to read subagent transcript",
  // ---- 语言切换 ----
  "思考": "Thinking",
  "预设": "Preset",
  "权限": "Permission",
  "搜索会话…": "Search sessions…",
  "筛选事件类型…": "Filter by event type…",
  "设置描述未加载;关闭再打开面板重试。": "Settings description not loaded; close and reopen the panel to retry.",
  "该命名空间的根不是对象,暂不支持表单编辑。": "This namespace's root is not an object; form editing is not supported yet.",
  "🌐 语言 / Language": "🌐 Language",
  "跟随 VS Code": "Follow VS Code",
  "跟随 VS Code 显示语言": "Follow the VS Code display language",
  "切换后界面就地重渲染;默认跟随 VS Code 显示语言。": "The UI re-renders in place after switching; by default it follows the VS Code display language.",
  // ---- / 命令菜单(补齐新增提示) ----
  "插入 /plan 到输入框,回车后进入计划模式": "Insert /plan into the input; press Enter to enter plan mode",
  "插入 /plan off 到输入框,回车后退出计划模式": "Insert /plan off into the input; press Enter to leave plan mode",
  "退出计划模式": "Exit plan mode",
  "插入 /goal 命令,补全目标描述后回车": "Insert /goal, complete the objective, then press Enter",
  "插入 /feedback 命令记录会话反馈": "Insert /feedback to record session feedback",
  "请列出当前所有动态 Cordis 插件及其运行状态(cordis_inspect)": "List all dynamic Cordis plugins and their run states (cordis_inspect)",
  "让 agent 用 cordis_inspect 汇报插件清单": "Asks the agent to report the plugin roster with cordis_inspect",
  "请运行插件 rbak-1(cordis_run)": "Run plugin rbak-1 (cordis_run)",
  "请更新插件 rbak-1 并运行(cordis_define + cordis_run update)": "Update plugin rbak-1 and run it (cordis_define + cordis_run update)",
  "请停止插件 rbak-1(cordis_stop)": "Stop plugin rbak-1 (cordis_stop)",
  "请删除插件 rbak-1(cordis_undefine)": "Remove plugin rbak-1 (cordis_undefine)",
  "把 rbak-1 换成目标插件 ID": "Replace rbak-1 with the target plugin id",
  "工作区根目录的 CLAUDE.md / AGENTS.md 已由 DeepSeek Harness 核心自动加载到上下文,无需手动处理": "CLAUDE.md / AGENTS.md at the workspace root are auto-loaded into context by the DeepSeek Harness core; no manual action needed",
  "技能 {name}": "Skill {name}",
  "✅ .codex/config.toml 已存在": "✅ .codex/config.toml exists",
  ".codex/config.toml 由 Codex CLI 使用;DSH 不读取该配置,可通过 AGENTS.md(已自动加载)承载共享指令": ".codex/config.toml is used by the Codex CLI; DSH does not read it — shared instructions go through AGENTS.md (auto-loaded)",
  "指令 {name}": "Instruction {name}",
  "智能体 {name}": "Agent {name}",
  "提示词 {name}": "Prompt {name}",
  // ---- 消息渲染(补齐) ----
  "💭 思考过程": "💭 Reasoning",
  "参数": "Arguments",
  "结果": "Result",
  "(无文本)": "(no text)",
  "思考 {d}": "thought {d}",
  "入 {n} tok": "in {n} tok",
  "出 {n} tok": "out {n} tok",
  "…(已截断,共 {n} 字符)": "…(truncated, {n} chars total)",
  " · 默认": " · default",
  "已用 {a} / {b} tokens": "{a} / {b} tokens used",
  "(预计本轮后 {n})": "(projected {n} after this turn)",
  "上下文 {p}%": "Context {p}%",
  "缓存命中 {p}%": "cache hit {p}%",
  "Token 用量": "Token usage",
  "首 token 平均（TTFT）": "Avg time to first token (TTFT)",
  "工具调用用时": "Tool time",
  "模型用时": "LLM time",
  "会话统计": "Session statistics",
  "{turns} 轮 {steps} 步": "{turns} turns {steps} steps",
  "文件夹": "Folder",
  "文件": "File",
  "移除附件": "Remove attachment",
  // ---- 附件芯片:点击查看(文件/文件夹/图片) ----
  "点击查看文件": "Click to view the file",
  "点击在资源管理器中显示": "Click to reveal in the file explorer",
  "点击查看图片": "Click to view the image",
  "查看文件": "View file",
  "先把图片保存为临时文件,再交给系统默认应用": "Saves the image to a temporary file, then opens it with the system default app",
  "加载失败": "Load failed",
  "子代理 {name}({status}) · 点击打开对话(可追问 / 打断)": "Subagent {name} ({status}) · click to open its conversation (prompt / interrupt)",
  "已连接 · {model}": "Connected · {model}",
  "⏸️ 等待审批:{name}": "⏸️ Waiting for approval: {name}",
  "允许一次": "Allow once",
  "工具 {toolName} 请求越权执行": "Tool {toolName} requests privileged execution",
  "✅ 允许": "✅ Allow",
  "❌ 拒绝": "❌ Reject",
  "子代理": "Subagent",
  "(暂无)": "(none yet)",
  // ---- 权限预设(标签本身在下方权限词表,此处只补提示文案) ----
  "危险:放开全部沙箱与审批限制": "Danger: lifts all sandbox and approval restrictions",
  "默认权限预设": "Default permission preset",
  "切换到完全访问(危险)": "Switch to full access (dangerous)",
  "完全访问会放开全部沙箱与审批限制,agent 可读取并修改任意文件。确定将其设为新会话的默认权限?": "Full access lifts all sandbox and approval restrictions; the agent can read and modify any file. Set it as the default for new sessions?",
  "确认切换": "Confirm switch",
  "该设置对新会话生效;当前会话的权限用输入框旁的权限下拉切换。": "Applies to new sessions; the current session's permission switches via the dropdown next to the composer.",
  "当前部署未提供会话内权限切换通道,会话权限未变更。可为新会话设定默认权限。": "This deployment provides no in-session permission channel; the session's permission was not changed. You can set the default permission for new sessions instead.",
  "默认权限设置": "Default permission",
  // ---- 子代理目录 ----
  "子代理目录": "Subagent catalog",
  "子代理目录({n} 个运行中)": "Subagent catalog ({n} running)",
  "重新读取子代理目录": "Re-read the subagent catalog",
  "(暂无子代理)": "(no subagents yet)",
  "one-shot 子代理 · 点击查看记录": "One-shot subagent · click to view its record",
  "continuable 子代理 · 点击打开对话(可追问 / 打断)": "Continuable subagent · click to open its conversation (prompt / interrupt)",
  "刷新": "Refresh",
  "技能(选中插入 /名称 调用)": "Skills (pick inserts /name to invoke)",
  "▾ 展开全部技能 ({n})": "▾ Expand all skills ({n})",
  // ---- 产物 ----
  "产物 ({n})": "Deliverables ({n})",
  "在文件夹中显示": "Show in folder",
  "在系统资源管理器中显示产物目录": "Reveal the deliverables folder in the system file explorer",
  "＋ 其余 {n} 个文件": "+ {n} more files",
  "收起": "Collapse",
  "在资源管理器中显示": "Reveal in File Explorer",
  // ---- 内置 Agent 预设(按 id 本地化,与网页端一致;文案随 DSH 0.2.0 更新) ----
  "标准模式": "Standard mode",
  "处理代码、文件和资料,适合大多数任务。Agent 会按需使用检索、编辑和终端等工具。":
    "Works on code, files and documents; suits most tasks. The agent uses search, editing and terminal tools as needed.",
  "PTC 模式": "PTC mode",
  "包含标准模式的所有能力,更适合批量调用工具,并对结果进行筛选、整理、去重、统计或汇总的任务。":
    "All Standard mode capabilities, better suited to tasks that call tools in batches and then filter, organize, deduplicate, count or summarize the results.",
  "极简模式": "Minimal mode",
  "Agent 仅使用终端工具完成任务,适合测试和对比其基础表现。": "The agent works using only a terminal tool; useful for testing and comparing its basic performance.",
  "创造模式": "Creator mode",
  "用对话定制 DSH:让 Agent 编写插件,添加新功能或界面;也能组合工具和提示词,创建自己的模式。":
    "Customize DSH by conversation: have the agent write plugins to add features or UI, or compose tools and prompts into your own mode.",
  // ---- 设置命名空间与字段本地化 ----
  "引导设置": "Onboarding",
  "网页搜索(DeepSeek)": "Web search (DeepSeek)",
  "DeepSeek 供应商": "DeepSeek provider",
  "其他模型供应商": "Other model providers",
  "界面主题": "UI theme",
  "网页端语言": "Web language",
  "对话行为": "Conversation behavior",
  "Agent 预设(默认)": "Agent presets (default)",
  "Agent 循环": "Agent loop",
  "Shell 执行": "Shell execution",
  "欢迎提示版本": "Welcome notice version",
  "API Key": "API Key",
  "API Key 环境变量": "API key env var",
  "Base URL": "Base URL",
  "API 版本": "API version",
  "最大 Token 数": "Max tokens",
  "最大使用次数": "Max uses",
  "偏好": "Preference",
  "忙碌时回车行为": "Busy Enter behavior",
  "最大并行工具调用": "Max parallel tool calls",
  "工作目录": "Working directory",
  "超时(毫秒)": "Timeout (ms)",
  "最大超时(毫秒)": "Max timeout (ms)",
  "最大输出字节": "Max output bytes",
  "最大溢出字节": "Max spill bytes",
  "宽限(毫秒)": "Grace (ms)",
  "pwsh 路径": "pwsh path",
  "初始延迟(毫秒)": "Initial delay (ms)",
  "最大延迟(毫秒)": "Max delay (ms)",
  "抖动比例": "Jitter ratio",
  "模式": "Mode",
  "最大重试次数": "Max retries",
  "可重试错误码": "Retryable codes",
  "退避": "Backoff",
  "供应商": "Providers",
  // ---- 模型配置兼容 ----
  "模型配置兼容": "Model config compatibility",
  "兼容 Claude:扫描工作区与用户主目录(~/.claude)下的 .claude(命令、技能),并报告 CLAUDE.md / AGENTS.md": "Compatible with Claude — scan .claude (commands, skills) in the workspace and your user home (~/.claude), and report CLAUDE.md / AGENTS.md",
  "兼容 Codex:扫描工作区与用户主目录(~/.codex)下的 .codex(config.toml、技能)": "Compatible with Codex — scan .codex (config.toml, skills) in the workspace and your user home (~/.codex)",
  "DSH 用户技能": "DSH user skills",
  "显示 / 隐藏 DSH 用户全局技能(~/.dsh/skills、~/.agents/skills)": "Show / hide DSH user-global skills (~/.dsh/skills, ~/.agents/skills)",
  "全局": "global",
  "兼容 GitHub Copilot:扫描工作区与用户主目录(~/.github)下的 .github 文件(指令、智能体、提示词)": "Compatible with GitHub Copilot — scan .github (instructions, agents, prompts) in the workspace and your user home (~/.github)",
  "启用与各工具配置目录(工作区文件夹和用户主目录)的兼容;勾选后 DSH 即可读取对应模型/工具的用户目录配置。": "Enable compatibility with each tool's config directories (workspace folder and user home); when checked, DSH can read the corresponding model/tool user-directory config.",
};

/** 多语言词典:简体中文为源语言;缺失的条目按 当前语言 → 英文 → 中文 依次回退。 */
const UI_TEXTS: Record<string, Record<string, string>> = {
  "zh-tw": zhTwTexts as Record<string, string>,
  en: EN_TEXT,
  ja: jaTexts as Record<string, string>,
  ko: koTexts as Record<string, string>,
  de: deTexts as Record<string, string>,
  fr: frTexts as Record<string, string>,
  es: esTexts as Record<string, string>,
  pt: ptTexts as Record<string, string>,
  th: thTexts as Record<string, string>,
  id: idTexts as Record<string, string>,
  tr: trTexts as Record<string, string>,
  ru: ruTexts as Record<string, string>,
  ar: arTexts as Record<string, string>,
};

function t(zh: string, params?: Record<string, string | number>): string {
  const lang = (state.lang ?? "zh-cn").toLowerCase();
  // zh-cn / zh 使用中文源文本;zh-tw 及其他语言查各自词典,缺失回退英文再回退中文。
  const dict = UI_TEXTS[lang] ?? (lang.startsWith("zh") ? undefined : EN_TEXT);
  let text = dict === undefined ? zh : dict[zh] ?? EN_TEXT[zh] ?? zh;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.split(`{${k}}`).join(String(v));
    }
  }
  return text;
}

// ---------- 页面骨架 ----------

const root = el("div", "app-root");

// 头部(两行):第一行 = 会话下拉 + 会话操作(⋯)+ 新建会话;第二行 = 工具面板按钮 + 状态
const header = el("div", "header");
const headerSessionRow = el("div", "header-row header-session-row");
const headerToolRow = el("div", "header-row header-tool-row");
const sessionSelectWrap = el("div", "session-select-wrap");
// 自定义会话下拉:按钮 = 当前会话 + 徽标(待审批/等待回答/运行中)+ 通知点;弹层 = 富文本会话列表
const sessionBtn = el("button", "session-dropdown-btn");
const sessionBtnLabel = el("span", "session-dropdown-label", t("— 选择会话 —"));
const sessionBtnBadges = el("span", "session-dropdown-badges");
const sessionBtnDot = el("span", "session-btn-dot");
sessionBtnDot.hidden = true;
const sessionBtnChevron = el("span", "session-dropdown-chevron", "▾");
sessionBtn.append(sessionBtnLabel, sessionBtnBadges, sessionBtnDot, sessionBtnChevron);
const sessionList = el("div", "session-dropdown-menu");
sessionList.hidden = true;
sessionSelectWrap.append(sessionBtn, sessionList);
// 新建会话:文字按钮(＋ 图标 + 「新建对话」),比纯图标更容易发现
const btnNew = el("button", "btn btn-new-session");
btnNew.title = t("新建对话");
btnNew.append(lineIcon(ICONS.plus, 13), el("span", "btn-new-label", t("新建对话")));
const btnMore = el("button", "btn btn-icon");
btnMore.title = t("会话操作:分叉 / 重命名 / 归档");
btnMore.append(lineIcon(ICONS.more));
const btnWorkspaces = el("button", "btn btn-icon");
btnWorkspaces.title = t("工作区(分组 / 搜索 / 归档)");
btnWorkspaces.append(lineIcon(ICONS.box, 15));
const btnJobs = el("button", "btn btn-icon");
btnJobs.title = t("后台任务");
btnJobs.append(lineIcon(ICONS.list, 15));
// 定时任务(0.1.7 自动化任务:网页端「自动化任务」页同款目录 + 运行记录)
const btnSchedule = el("button", "btn btn-icon");
btnSchedule.title = t("自动化任务");
btnSchedule.append(lineIcon(ICONS.alarmClock, 15));
/** 发送键快捷入口的文案与提示(设置面板与输入框胶囊共用同一份描述)。 */
const SEND_KEY_LABELS: Record<"enter" | "ctrl-enter" | "shift-enter", string> = {
  enter: "Enter 发送",
  "ctrl-enter": "Ctrl+Enter 发送",
  "shift-enter": "Shift+Enter 发送",
};
const SEND_KEY_DESCRIPTIONS: Record<"enter" | "ctrl-enter" | "shift-enter", string> = {
  enter: "Enter 发送,Shift+Enter 换行",
  "ctrl-enter": "Ctrl+Enter 发送,Enter 换行(习惯用 Enter 换行时选它)",
  "shift-enter": "Shift+Enter 发送,Enter 换行",
};

const SEND_KEY_ORDER: ("enter" | "ctrl-enter" | "shift-enter")[] = ["enter", "ctrl-enter", "shift-enter"];

// 发送快捷键不再占据头部按钮:入口保留在「设置 → ⌨️ 发送与输入」,
// 输入框提示行旁的胶囊(dsh.sendKey 的可视状态)可一键切换。
const btnTrajectory = el("button", "btn btn-icon");
btnTrajectory.title = t("轨迹(事件台账)");
btnTrajectory.append(lineIcon(ICONS.ledger, 15));
const btnSettings = el("button", "btn btn-icon");
btnSettings.title = t("设置(常规 / 模型 / 预设)");
btnSettings.append(lineIcon(ICONS.gear, 15));
const btnBrowser = el("button", "btn btn-icon");
btnBrowser.title = t("在浏览器中打开");
btnBrowser.append(lineIcon(ICONS.globe));
// Cordis 动态插件面板(网页端 Cordis 浮窗面板同款:插件清单 / 审批 / 运行 / 停止 / 移除)
const btnCordis = el("button", "btn btn-icon");
btnCordis.title = t("Cordis 插件");
btnCordis.append(el("span", "btn-emoji", "🧩"));
const cordisBadge = el("span", "btn-badge");
cordisBadge.hidden = true;
btnCordis.append(cordisBadge);
const statusDot = el("span", "status-dot");
const statusText = el("span", "status-text", "未连接");

// 会话操作菜单(挂在 ⋯ 按钮的锚点上,随按钮位置展开)。
// 条目用线性图标 + 文字,不再用 emoji 前缀:emoji 在不同平台渲染差异大,和其余按钮的图标语言也不一致。
const sessionMenu = el("div", "session-menu");
sessionMenu.hidden = true;
function sessionMenuItem(icon: string, label: string): HTMLButtonElement {
  const btn = el("button", "session-menu-item") as HTMLButtonElement;
  btn.append(lineIcon(icon, 13), el("span", "session-menu-label", label));
  return btn;
}
const menuRename = sessionMenuItem(ICONS.edit, t("重命名会话"));
const menuFork = sessionMenuItem(ICONS.branch, t("分叉会话"));
// 0.2.1:会话菜单支持复制会话 ID(网页端同款;排查 / 报告问题时可直接粘贴)
const menuCopyId = sessionMenuItem(ICONS.copy, t("复制会话 ID"));
const menuArchive = sessionMenuItem(ICONS.box, t("归档会话"));
sessionMenu.append(menuRename, menuFork, menuCopyId, menuArchive);
const moreAnchor = el("div", "session-menu-anchor");
moreAnchor.append(btnMore, sessionMenu);

headerSessionRow.append(sessionSelectWrap, moreAnchor, btnNew);
const toolLeft = el("div", "header-tools");
// 子代理目录按钮(网页端 session.header.actions 目录树同款定位:单个按钮 + 展开目录,不占对话空间)
const btnSubagents = el("button", "btn btn-icon");
btnSubagents.title = t("子代理目录");
btnSubagents.append(lineIcon(ICONS.robot, 15));
const subagentsBadge = el("span", "btn-badge");
subagentsBadge.hidden = true;
btnSubagents.append(subagentsBadge);
toolLeft.append(btnWorkspaces, btnJobs, btnSchedule, btnTrajectory, btnSettings, btnSubagents);
const toolRight = el("div", "header-tools header-tools-right");
toolRight.append(btnBrowser, btnCordis, statusDot, statusText);
headerToolRow.append(toolLeft, toolRight);
header.append(headerSessionRow, headerToolRow);

// 通用对话框(重命名输入 / 归档确认)
const dialogOverlay = el("div", "dialog-overlay");
dialogOverlay.hidden = true;

// 浮动提示(toast):操作反馈显示在界面顶部,不再进入对话流
const toastBox = el("div", "toast-box");
root.append(toastBox);
const dialogBox = el("div", "dialog-box");
const dialogTitle = el("div", "dialog-title");
const dialogText = el("div", "dialog-text");
const dialogInput = el("input", "dialog-input");
// issue #21 第 11 条:多行编辑(排队消息等)用 textarea,默认 6 行高、可拖拽调整
const dialogTextarea = el("textarea", "dialog-input dialog-textarea");
dialogTextarea.rows = 6;
const dialogRow = el("div", "dialog-actions");
const dialogCancel = el("button", "btn dialog-cancel", t("取消"));
const dialogConfirm2 = el("button", "btn dialog-confirm2", t("清除"));
const dialogConfirm = el("button", "btn dialog-confirm", t("确定"));
dialogRow.append(dialogCancel, dialogConfirm2, dialogConfirm);
dialogBox.append(dialogTitle, dialogText, dialogInput, dialogTextarea, dialogRow);
dialogOverlay.append(dialogBox);
root.append(dialogOverlay);

/**
 * 显示对话框;input=true 时返回输入内容(空串视为取消),否则确认返回 "yes"、第二确认返回 "alt"、取消返回 null。
 * multiline=true 时使用多行编辑框(Enter 换行、Ctrl/Cmd+Enter 或 Shift+Enter 确认、Esc 取消)。
 */
function showDialog(opts: {
  title: string;
  text: string;
  input?: boolean;
  multiline?: boolean;
  confirmLabel?: string;
  confirm2Label?: string;
  value?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    dialogTitle.textContent = opts.title;
    dialogText.textContent = opts.text;
    dialogConfirm.textContent = opts.confirmLabel ?? t("确定");
    dialogConfirm2.textContent = opts.confirm2Label ?? t("清除");
    dialogConfirm2.hidden = !opts.confirm2Label || !!opts.input;
    const multiline = opts.input === true && opts.multiline === true;
    const field: HTMLInputElement | HTMLTextAreaElement = multiline ? dialogTextarea : dialogInput;
    dialogInput.value = multiline ? "" : opts.value ?? "";
    dialogTextarea.value = multiline ? opts.value ?? "" : "";
    dialogInput.hidden = !opts.input || multiline;
    dialogTextarea.hidden = !multiline;
    dialogOverlay.hidden = false;
    if (opts.input) {
      field.focus();
      field.select();
    } else {
      dialogConfirm.focus();
    }
    const finish = (value: string | null) => {
      dialogOverlay.hidden = true;
      dialogCancel.onclick = null;
      dialogConfirm.onclick = null;
      dialogConfirm2.onclick = null;
      dialogInput.onkeydown = null;
      dialogTextarea.onkeydown = null;
      resolve(value);
    };
    dialogCancel.onclick = () => finish(null);
    dialogConfirm.onclick = () => finish(opts.input ? field.value : "yes");
    dialogConfirm2.onclick = () => finish("alt");
    dialogInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish(opts.input ? dialogInput.value : "yes");
      } else if (e.key === "Escape") {
        finish(null);
      }
    };
    // 多行:Enter 换行,Shift/Ctrl/Cmd+Enter 确认(与主输入框的发送习惯区分开,避免误提交)
    dialogTextarea.onkeydown = (e) => {
      if (e.key === "Escape") {
        finish(null);
        return;
      }
      if (e.key === "Enter" && (e.shiftKey || e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        finish(dialogTextarea.value);
      }
    };
  });
}

// ---------- 回合级 Git 回退:回退确认(代码审核)与检查点清单弹窗 ----------

interface RbPreviewFile {
  path: string;
  added: number;
  deleted: number;
  binary: boolean;
  /** A=新增 D=删除(来自 numstat 推断或 --name-status,二进制文件必备)。 */
  status?: "A" | "D" | "M";
}

interface RbPreview {
  turn: number;
  time: number;
  commit: string;
  files: RbPreviewFile[];
  addedTotal: number;
  deletedTotal: number;
  removedUntracked: string[];
  untrackedUnknown: boolean;
  truncated: boolean;
}

interface RbCheckpointRow {
  turn: number;
  time: number;
  commit: string;
  files: RbPreviewFile[];
  addedTotal: number;
  deletedTotal: number;
  truncated: boolean;
  /** 是否有回合结束快照(/undo 精确撤销可用)。 */
  hasAfter: boolean;
}

interface RbUndoPreview {
  turn: number;
  time: number;
  before: string;
  after: string;
  files: RbPreviewFile[];
  addedTotal: number;
  deletedTotal: number;
  truncated: boolean;
}

const rbOverlay = el("div", "dialog-overlay");
rbOverlay.hidden = true;
const rbBox = el("div", "rb-box");
const rbTitle = el("div", "rb-title");
const rbMeta = el("div", "rb-meta");
const rbBody = el("div", "rb-body");
const rbFooter = el("div", "rb-footer");
const rbCancel = el("button", "btn dialog-cancel", t("取消"));
const rbConfirm = el("button", "btn dialog-confirm", t("确认回退"));
rbConfirm.hidden = true;
const rbActions = el("div", "rb-actions");
rbActions.append(rbCancel, rbConfirm);
rbBox.append(rbTitle, rbMeta, rbBody, rbFooter, rbActions);
rbOverlay.append(rbBox);
root.append(rbOverlay);

/** 回退弹窗状态:当前模式与期望的 requestId(过滤过期回复)。 */
const rbState: {
  mode: "review" | "checkpoints" | "undo";
  requestId: string;
  confirmTurn?: number;
  afterConfirm?: () => void;
  /** 「还原检查点」执行目标:与本会话不同时(兜底走父会话快照)由宿主下发 */
  targetSessionId?: string;
  /** 「还原检查点」直接按检查点提交恢复(分叉兜底路径,经 /rollback <sha>) */
  targetCommit?: string;
} = { mode: "review", requestId: "" };
/** diff 请求 id → 目标 diff 容器元素(多文件展开互不串扰)。 */
const rbDiffTargets = new Map<string, HTMLDivElement>();

function rbClose() {
  rbOverlay.hidden = true;
  rbConfirm.hidden = true;
  rbCancel.textContent = t("取消");
  rbConfirm.onclick = null;
  rbCancel.onclick = null;
  rbBody.innerHTML = "";
  rbFooter.innerHTML = "";
  rbDiffTargets.clear();
  rbState.requestId = "";
  rbState.confirmTurn = undefined;
  rbState.afterConfirm = undefined;
  rbState.targetSessionId = undefined;
  rbState.targetCommit = undefined;
}

function fmtRbTime(time: number): string {
  return new Date(time).toLocaleString();
}

/** 文件行状态样式:新增(A)→ 绿色;删除(D)→ 红色 + 删除线;修改/未知 → 无。 */
function rbFilePathClass(f: RbPreviewFile): string {
  if (f.status === "A") return "rb-file-path rb-file-added";
  if (f.status === "D") return "rb-file-path rb-file-removed";
  return "rb-file-path";
}

/** 请求回退预览(代码审核)数据;turn 缺省 = 最近检查点;afterConfirm 在确认回退后执行(如「回退+新建分支」)。 */
function openRollbackReview(turn?: number, afterConfirm?: () => void) {
  const requestId = `rb:${Date.now()}`;
  rbState.mode = "review";
  rbState.requestId = requestId;
  rbState.afterConfirm = afterConfirm;
  rbTitle.textContent = t("回退确认");
  rbMeta.textContent = t("正在计算差异…");
  rbBody.innerHTML = "";
  rbFooter.innerHTML = "";
  rbConfirm.hidden = true;
  rbCancel.textContent = t("取消");
  rbCancel.onclick = () => rbClose();
  rbConfirm.onclick = null;
  rbOverlay.hidden = false;
  vscode.postMessage({ kind: "rollbackPreview", requestId, sessionId: state.current, ...(typeof turn === "number" ? { turn } : {}) });
}

/** 渲染回退确认弹窗:逐文件增删行数、点击展开完整差异、未跟踪删除清单。 */
function renderRollbackReview(preview: RbPreview) {
  const short = preview.commit.slice(0, 8);
  rbTitle.textContent = t("回退确认");
  rbMeta.textContent = t("回退到回合 {turn} 之前", { turn: preview.turn }) + ` · ${short} · ${fmtRbTime(preview.time)}`;
  rbBody.innerHTML = "";
  rbFooter.innerHTML = "";

  rbBody.append(el("div", "rb-hint", t("将撤销自该检查点以来的以下改动:")));

  if (preview.files.length === 0 && preview.removedUntracked.length === 0) {
    rbBody.append(el("div", "rb-empty", t("无文件差异")));
  }

  // 逐文件行:summary 显示 +N/−M,展开时按需加载完整 diff;
  // 新增文件(A)文件名绿色,删除文件(D)红色 + 删除线
  preview.files.forEach((f, index) => {
    const details = el("details", "rb-file");
    const summary = el("summary", "rb-file-head");
    summary.append(el("span", rbFilePathClass(f), f.path));
    if (f.binary) {
      summary.append(el("span", "rb-bin", t("二进制文件")));
    } else {
      if (f.added > 0) summary.append(el("span", "rb-add", `+${f.added}`));
      if (f.deleted > 0) summary.append(el("span", "rb-del", `−${f.deleted}`));
      if (f.added === 0 && f.deleted === 0) summary.append(el("span", "rb-zero", "0"));
      // 「对比」:在 VS Code 内置 diff 视图打开 检查点版本 ↔ 工作区当前版本(不触发展开)
      const compareBtn = el("button", "mini-btn rb-compare", t("对比"));
      compareBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        vscode.postMessage({ kind: "rollbackCompare", sessionId: state.current, turn: preview.turn, path: f.path });
      });
      summary.append(compareBtn);
    }
    details.append(summary);
    const pre = el("div", "rb-diff");
    details.append(pre);
    details.addEventListener("toggle", () => {
      if (!details.open || pre.dataset.loaded) return;
      pre.dataset.loaded = "1";
      pre.textContent = t("加载差异…");
      const diffId = `d:${preview.turn}:${index}`;
      rbDiffTargets.set(diffId, pre);
      vscode.postMessage({ kind: "rollbackDiff", requestId: diffId, sessionId: state.current, turn: preview.turn, path: f.path });
    });
    rbBody.append(details);
  });

  // 将删除的新建未跟踪文件清单
  if (preview.untrackedUnknown) {
    rbBody.append(el("div", "rb-note", t("未跟踪文件清单不可用(检查点记录截断),回退后请手动检查工作区")));
  } else if (preview.removedUntracked.length > 0) {
    const ud = el("details", "rb-untracked");
    ud.append(el("summary", "rb-untracked-head", t("将删除新建的未跟踪文件({count} 个)", { count: preview.removedUntracked.length })));
    const list = el("div", "rb-untracked-list");
    for (const name of preview.removedUntracked) list.append(el("div", "rb-untracked-item", name));
    ud.append(list);
    rbBody.append(ud);
  }

  // 汇总与提示
  rbFooter.append(
    el(
      "div",
      "rb-stats",
      t("共 {files} 个文件,+{added} 行,−{deleted} 行", {
        files: preview.files.length,
        added: preview.addedTotal,
        deleted: preview.deletedTotal,
      }),
    ),
  );
  if (preview.truncated) rbFooter.append(el("div", "rb-note", t("差异过大,仅显示前 300 个文件")));
  rbFooter.append(el("div", "rb-note", t("回退前状态会先存入保存点,/redo 可恢复;忽略文件不受影响")));

  rbState.confirmTurn = preview.turn;
  rbConfirm.hidden = false;
  rbConfirm.textContent = t("确认回退");
  rbConfirm.onclick = () => {
    const turn = rbState.confirmTurn;
    const after = rbState.afterConfirm;
    const commit = rbState.targetCommit;
    const sessionId = rbState.targetSessionId ?? state.current;
    rbClose();
    if (commit) {
      // 分叉兜底:直接按检查点提交恢复(/rollback <sha>)
      vscode.postMessage({ kind: "rollbackApply", sessionId, commit });
    } else if (typeof turn === "number") {
      vscode.postMessage({ kind: "rollbackApply", sessionId, turn });
    }
    after?.();
  };
}

/** 请求 /undo 精确撤销的预览(该回合自身产生的改动);turn 缺省 = 最近有结束快照的回合。 */
function openRollbackUndo(turn?: number, afterConfirm?: () => void) {
  const requestId = `rb:${Date.now()}`;
  rbState.mode = "undo";
  rbState.requestId = requestId;
  rbState.afterConfirm = afterConfirm;
  rbTitle.textContent = t("撤销回合改动");
  rbMeta.textContent = t("正在计算差异…");
  rbBody.innerHTML = "";
  rbFooter.innerHTML = "";
  rbConfirm.hidden = true;
  rbCancel.textContent = t("取消");
  rbCancel.onclick = () => rbClose();
  rbConfirm.onclick = null;
  rbOverlay.hidden = false;
  vscode.postMessage({ kind: "rollbackUndoPreview", requestId, sessionId: state.current, ...(typeof turn === "number" ? { turn } : {}) });
}

/** 渲染 /undo 精确撤销弹窗:只撤销该回合自身产生的改动,你的提交与 HEAD 不受影响。 */
function renderUndoReview(preview: RbUndoPreview) {
  rbTitle.textContent = t("撤销回合改动");
  rbMeta.textContent = t("回合 {turn}", { turn: preview.turn }) + ` · ${preview.after.slice(0, 8)} · ${fmtRbTime(preview.time)}`;
  rbBody.innerHTML = "";
  rbFooter.innerHTML = "";
  rbBody.append(el("div", "rb-hint", t("将撤销该回合产生的以下改动(你的提交与 HEAD 不受影响):")));

  if (preview.files.length === 0) {
    rbBody.append(el("div", "rb-empty", t("该回合没有文件改动")));
  }

  preview.files.forEach((f, index) => {
    const details = el("details", "rb-file");
    const summary = el("summary", "rb-file-head");
    summary.append(el("span", rbFilePathClass(f), f.path));
    if (f.binary) summary.append(el("span", "rb-bin", t("二进制文件")));
    else {
      if (f.added > 0) summary.append(el("span", "rb-add", `+${f.added}`));
      if (f.deleted > 0) summary.append(el("span", "rb-del", `−${f.deleted}`));
      if (f.added === 0 && f.deleted === 0) summary.append(el("span", "rb-zero", "0"));
    }
    details.append(summary);
    const pre = el("div", "rb-diff");
    details.append(pre);
    details.addEventListener("toggle", () => {
      if (!details.open || pre.dataset.loaded) return;
      pre.dataset.loaded = "1";
      pre.textContent = t("加载差异…");
      const diffId = `u:${preview.turn}:${index}`;
      rbDiffTargets.set(diffId, pre);
      vscode.postMessage({ kind: "rollbackUndoDiff", requestId: diffId, sessionId: state.current, turn: preview.turn, path: f.path });
    });
    rbBody.append(details);
  });

  rbFooter.append(
    el(
      "div",
      "rb-stats",
      t("共 {files} 个文件,+{added} 行,−{deleted} 行", {
        files: preview.files.length,
        added: preview.addedTotal,
        deleted: preview.deletedTotal,
      }),
    ),
  );
  if (preview.truncated) rbFooter.append(el("div", "rb-note", t("差异过大,仅显示前 300 个文件")));
  rbFooter.append(el("div", "rb-note", t("撤销仅反向应用该回合自身的改动;你自己提交的内容与 HEAD 保持不变。")));

  rbState.confirmTurn = preview.turn;
  rbConfirm.hidden = false;
  rbConfirm.textContent = t("确认撤销");
  rbConfirm.onclick = () => {
    const turn = rbState.confirmTurn;
    const after = rbState.afterConfirm;
    rbClose();
    if (typeof turn === "number") {
      vscode.postMessage({ kind: "rollbackUndoApply", sessionId: state.current, turn });
    }
    after?.();
  };
}

/** 请求检查点清单数据并打开弹窗。 */
function openCheckpointsDialog() {
  const requestId = `rcp:${Date.now()}`;
  rbState.mode = "checkpoints";
  rbState.requestId = requestId;
  rbTitle.textContent = t("检查点");
  rbMeta.textContent = t("正在计算差异…");
  rbBody.innerHTML = "";
  rbFooter.innerHTML = "";
  rbConfirm.hidden = true;
  rbCancel.textContent = t("关闭");
  rbCancel.onclick = () => rbClose();
  rbOverlay.hidden = false;
  vscode.postMessage({ kind: "rollbackCheckpoints", requestId, sessionId: state.current });
}

/** 渲染检查点清单弹窗:跨会话分组,每行可展开查看逐文件差异;支持「撤销该回合改动」与「回退到此回合前」。 */
function renderCheckpointsDialog(data: { head: string; dirty: number; sessions: { sessionId: string; checkpoints: RbCheckpointRow[] }[] }) {
  rbTitle.textContent = t("检查点");
  const total = data.sessions.reduce((n, s) => n + s.checkpoints.length, 0);
  rbMeta.textContent = t("会话共 {count} 个检查点 · HEAD {head} · 未提交改动 {dirty} 项", {
    count: total,
    head: data.head,
    dirty: data.dirty,
  });
  rbBody.innerHTML = "";
  rbFooter.innerHTML = "";

  if (total === 0) {
    rbBody.append(el("div", "rb-empty", t("暂无检查点。检查点会在每个回合开始前自动创建(turn/start 时快照工作区)")));
  }

  for (const session of data.sessions) {
    const groupLabel = el("div", "rb-cp-group", `▣ ${session.sessionId.slice(0, 8)}`);
    rbBody.append(groupLabel);
    for (const cp of session.checkpoints) {
      const row = el("div", "rb-cp");
      const head = el("div", "rb-cp-head");
      const toggle = el("button", "rb-cp-toggle", "▸");
      head.append(toggle);
      head.append(el("span", "rb-cp-title", t("回合 {turn}", { turn: cp.turn })));
      head.append(el("span", "rb-cp-meta", `${cp.commit.slice(0, 8)} · ${fmtRbTime(cp.time)}`));
      head.append(el("span", "rb-cp-stats", `${cp.files.length} ${t("个文件")} `));
      if (cp.addedTotal > 0) head.append(el("span", "rb-add", `+${cp.addedTotal}`));
      if (cp.deletedTotal > 0) head.append(el("span", "rb-del", `−${cp.deletedTotal}`));
      if (cp.hasAfter) {
        // 精确撤销:只撤销该回合自身改动(不动用户提交内容)
        const undoBtn = el("button", "mini-btn rb-cp-rollback", t("撤销该回合改动"));
        undoBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          rbClose();
          openRollbackUndo(cp.turn, () => {
            vscode.postMessage({ kind: "select", sessionId: session.sessionId });
          });
        });
        head.append(undoBtn);
      }
      const rollbackBtn = el("button", "mini-btn rb-cp-rollback", t("回退到此回合前"));
      rollbackBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        rbClose();
        openRollbackReview(cp.turn, () => {
          vscode.postMessage({ kind: "select", sessionId: session.sessionId });
        });
      });
      head.append(rollbackBtn);
      row.append(head);
      const body = el("div", "rb-cp-body");
      body.hidden = true;
      if (cp.files.length === 0) {
        body.append(el("div", "rb-empty", t("无文件差异")));
      }
      for (const f of cp.files) {
        const line = el("div", "rb-cp-file");
        line.append(el("span", rbFilePathClass(f), f.path));
        if (f.binary) line.append(el("span", "rb-bin", t("二进制文件")));
        else {
          if (f.added > 0) line.append(el("span", "rb-add", `+${f.added}`));
          if (f.deleted > 0) line.append(el("span", "rb-del", `−${f.deleted}`));
          // 「对比」:VS Code 内置 diff 视图打开 检查点版本 ↔ 工作区当前版本
          const compareBtn = el("button", "mini-btn rb-compare", t("对比"));
          compareBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            vscode.postMessage({ kind: "rollbackCompare", sessionId: state.current, turn: cp.turn, path: f.path });
          });
          line.append(compareBtn);
        }
        body.append(line);
      }
      if (cp.truncated) body.append(el("div", "rb-note", t("差异过大,仅显示前 300 个文件")));
      row.append(body);
      toggle.addEventListener("click", () => {
        body.hidden = !body.hidden;
        toggle.textContent = body.hidden ? "▸" : "▾";
      });
      rbBody.append(row);
    }
  }

  rbFooter.append(
    el("div", "rb-note", t("「撤销该回合改动」只回退该回合自身产生的文件改动,不动你自己提交的内容;「回退到此回合前」为整体回退。/undo 与 /redo 命令同样可用。清理 refs/dsh/checkpoints|saves/<会话ID> 与 .dsh/rollback 记录")),
  );
  rbConfirm.hidden = true;
}

// goal 进度卡
const goalArea = el("div", "goal-area");
goalArea.hidden = true;

const messages = el("div", "messages");
const pendingArea = el("div", "pending-area");

// 回合活动指示(输入框上方:深度思考中… / 执行工具… + 计时)
const turnStatus = el("div", "turn-status");
turnStatus.hidden = true;
const turnStatusDot = el("span", "turn-status-dot");
const turnStatusText = el("span", "turn-status-text");
turnStatus.append(turnStatusDot, turnStatusText);

// 输入区(Codex 风格:左上角添加文件 + 大输入框 + 底部操作行)
const composer = el("div", "composer");

// 附件行:左上角 + 添加文件/图片按钮 + 附件芯片(自动附加激活文件 / 手动选择 / 图片,均在同一行,+ 号右侧)
const attachmentsRow = el("div", "attachments-row");

function toolSelect(label: string, title: string): { wrap: HTMLElement; select: HTMLSelectElement; label: HTMLElement } {
  const wrap = el("label", "tool-item");
  wrap.title = title;
  const labelEl = el("span", "tool-label", label);
  wrap.append(labelEl);
  const select = el("select", "tool-select");
  wrap.append(select);
  return { wrap, select, label: labelEl };
}

// 预设:输入框右上角(仅新会话)
// 预设:收起为「预设 · 名称 ▾」胶囊(仅新会话);弹层:标题 + 选项(名称/描述/✓,参考网页端样式)
const presetPill = el("div", "preset-pill");
const presetPillHead = el("button", "preset-pill-head");
presetPillHead.type = "button";
presetPillHead.title = t("Agent 预设");
const presetPillText = el("span", "preset-pill-text");
const presetPillChevron = el("span", "preset-pill-chevron");
presetPillChevron.append(lineIcon(ICONS.down2, 12));
presetPillHead.append(presetPillText, presetPillChevron);
const presetPillPop = el("div", "preset-pill-pop");
presetPillPop.hidden = true;
const ppPresetHeader = el("div", "pp-header");
const ppPresetTitle = el("span", "pp-title", t("选择 Agent 预设(新会话生效)"));
ppPresetHeader.append(ppPresetTitle);
const presetPillList = el("div", "preset-pill-list");
presetPillPop.append(ppPresetHeader, presetPillList);
presetPill.append(presetPillHead, presetPillPop);

// 模型 + 思考:收起为单个细长按钮(模型名可省略,推理强度始终可见:如 deepseek-v4-Fl... · Max),
// 位于输入框右下角;点击弹出面板,在面板内分别选择模型与推理等级。
const modelPill = el("div", "model-pill");
const modelPillHead = el("button", "model-pill-head");
modelPillHead.type = "button";
modelPillHead.title = t("模型与思考(推理强度)");
const modelPillLabel = el("span", "model-pill-label");
const modelPillModel = el("span", "model-pill-model");
const modelPillSep = el("span", "model-pill-sep", " · ");
const modelPillEffort = el("span", "model-pill-effort");
modelPillLabel.append(modelPillModel, modelPillSep, modelPillEffort);
const modelPillChevron = el("span", "model-pill-chevron");
modelPillChevron.append(lineIcon(ICONS.down2, 12));
modelPillHead.append(modelPillLabel, modelPillChevron);
const modelPillPop = el("div", "model-pill-pop");
modelPillPop.hidden = true;
// 弹层第 1 节:模型列表(可滚动,宽度受限)
const modelPillList = el("div", "model-pill-list");
modelPillPop.append(modelPillList);
// 弹层第 2 节:推理等级(仅当前模型声明了 efforts 时显示)
const mppThink = el("div", "mpp-think");
mppThink.hidden = true;
const mppThinkLabel = el("div", "mpp-think-label");
mppThinkLabel.textContent = t("思考深度(推理强度)");
const thinkSeg = el("div", "think-seg");
thinkSeg.title = t("思考深度(推理强度)");
mppThink.append(mppThinkLabel, thinkSeg);
modelPillPop.append(mppThink);
modelPill.append(modelPillHead, modelPillPop);

const inputWrap = el("div", "input-wrap");
const input = el("textarea", "input");
input.placeholder = t("向 DeepSeek Harness 发送消息…");
const sendCol = el("div", "send-col");

// 上下文进度环(网页端 composer 的 ContextMeter 同款):圆环显示占用百分比,
// 点击弹出面板查看"上下文已用"读数与 系统提示词 / 工具定义 / 对话消息 的分类构成。
const CTX_RING_RADIUS = 5.5;
const CTX_RING_CIRCUMFERENCE = 2 * Math.PI * CTX_RING_RADIUS;
const SVG_NS = "http://www.w3.org/2000/svg";
const contextMeter = el("div", "context-meter");
contextMeter.hidden = true;
const contextMeterBtn = el("button", "context-meter-trigger");
contextMeterBtn.type = "button";
const contextMeterSvg = document.createElementNS(SVG_NS, "svg");
contextMeterSvg.setAttribute("viewBox", "0 0 14 14");
contextMeterSvg.setAttribute("width", "14");
contextMeterSvg.setAttribute("height", "14");
contextMeterSvg.setAttribute("aria-hidden", "true");
const contextMeterTrack = document.createElementNS(SVG_NS, "circle");
contextMeterTrack.setAttribute("class", "context-meter-track");
contextMeterTrack.setAttribute("cx", "7");
contextMeterTrack.setAttribute("cy", "7");
contextMeterTrack.setAttribute("r", String(CTX_RING_RADIUS));
const contextMeterFill = document.createElementNS(SVG_NS, "circle");
contextMeterFill.setAttribute("class", "context-meter-fill");
contextMeterFill.setAttribute("cx", "7");
contextMeterFill.setAttribute("cy", "7");
contextMeterFill.setAttribute("r", String(CTX_RING_RADIUS));
contextMeterFill.setAttribute("transform", "rotate(-90 7 7)");
contextMeterSvg.append(contextMeterTrack, contextMeterFill);
contextMeterBtn.append(contextMeterSvg);
const contextMeterPanel = el("div", "context-meter-panel");
contextMeterPanel.hidden = true;
contextMeterPanel.setAttribute("role", "dialog");
contextMeter.append(contextMeterBtn, contextMeterPanel);

// 发送/停止共用一个按钮:空闲显示 ➤ 发送;运行中且无输入显示 ⏹ 停止;运行中输入文字变回 ➤(消息将排队)
const btnSendStop = el("button", "btn-icon-btn send-btn");
btnSendStop.append(lineIcon(ICONS.send, 16));
btnSendStop.title = "发送(Enter)";
sendCol.append(btnSendStop);
inputWrap.append(input, sendCol);

// 对话底部操作行(对话左下方):模式指示芯片 + 回到主线 + 上下文进度
const conversationBottom = el("div", "conversation-bottom");
const btnBackToMain = el("button", "conv-action-btn");
btnBackToMain.title = t("回到主线(父会话)");
btnBackToMain.append(lineIcon(ICONS.backMain));
btnBackToMain.hidden = true;
const modeChips = el("div", "mode-chips");
// 任务清单(网页端 TodoPanel 同款:内容由 renderTodos 构建)
const todoPanel = el("section", "todo-panel");
todoPanel.hidden = true;
/** 会话统计行:位于输入框最底部(网页端 composer.dock 同款),始终可见 */
const statsLine = el("div", "stats-line");
statsLine.hidden = true;
conversationBottom.append(btnBackToMain, todoPanel);

// 状态行:回合活动指示(深度思考中… 3秒)与 计划模式/目标 芯片同行(位于输入框上方)
const statusRow = el("div", "status-row");
statusRow.append(turnStatus, modeChips);

// 输入历史提示(issue #20):↑/↓ 调出历史输入时在状态行右侧显示位置,短暂驻留后自动淡出
const historyHint = el("span", "history-hint");
historyHint.hidden = true;
statusRow.append(historyHint);

// 会话被其他 DSH 实例占用(session/writer-held):输入框上方常驻提示条,直到该会话写操作恢复
const lockNotice = el("div", "lock-notice");
lockNotice.hidden = true;
const lockNoticeText = el("span", "lock-notice-text");
lockNotice.append(lockNoticeText);

// 输入框底部行:左下角 / 命令菜单、权限;右下角 模型 + 思考按钮
const composerBottom = el("div", "composer-bottom");
const btnPlus = el("button", "btn-icon-btn plus-btn");
btnPlus.title = t("输入命令(/plan、/compact、.claude 命令…)");
btnPlus.append(lineIcon(ICONS.slash, 12));
const btnAddAttach = el("button", "attach-add-btn");
btnAddAttach.title = t("添加文件或文件夹到对话");
btnAddAttach.append(lineIcon(ICONS.plus, 12));
// 权限:收起为「⚠ 图标 + 名称 ▾」胶囊(参考截图样式);点开弹层:标题 + 了解更多 + 选项(名称/说明/✓)
const permissionPill = el("div", "permission-pill");
const permissionPillHead = el("button", "permission-pill-head");
permissionPillHead.type = "button";
permissionPillHead.title = t("读写权限(沙箱模式 + 审批策略)");
const permissionPillIcon = el("span", "permission-pill-icon");
const permissionPillText = el("span", "permission-pill-text");
const permissionPillChevron = el("span", "permission-pill-chevron");
permissionPillChevron.append(lineIcon(ICONS.down2, 12));
permissionPillHead.append(permissionPillIcon, permissionPillText, permissionPillChevron);
const permissionPillPop = el("div", "permission-pill-pop");
permissionPillPop.hidden = true;
const ppHeader = el("div", "pp-header");
const ppTitle = el("span", "pp-title", t("应如何批准操作?"));
const ppMore = el("button", "pp-more");
ppMore.type = "button";
ppMore.textContent = t("了解更多");
const permissionPillList = el("div", "permission-pill-list");
ppHeader.append(ppTitle, ppMore);
permissionPillPop.append(ppHeader, permissionPillList);
permissionPill.append(permissionPillHead, permissionPillPop);
// 底部行:左下角 / 命令菜单、权限;右下角 模型 + 思考按钮
composerBottom.append(btnPlus, permissionPill, modelPill);
// 发送提示:独占一行,位于输入框左下角;文案按 dsh.sendKey 动态生成(issue #21 第 1 条)
const hint = el("div", "hint", t("Enter 发送 · Shift+Enter 换行"));
const composerHintText = hint;
// 发送键切换胶囊:紧跟提示文案,点一下即切换(Enter 发送 ⇄ Ctrl+Enter 发送),无需进设置
const sendKeyChip = el("button", "hint-sendkey") as HTMLButtonElement;
sendKeyChip.type = "button";
/**
 * 会话工作目录芯片(0.2.1):显示 working_directory 工具切换后的**生效**目录。
 * 会话头的 cwd 是创建时的项目目录、不随工具变化,因此两者可能不同;这里只显示生效值,
 * 悬停给出完整路径,点击在资源管理器中定位。未发生过切换时整个芯片隐藏(不制造噪音)。
 */
const cwdChip = el("button", "hint-cwd") as HTMLButtonElement;
cwdChip.type = "button";
cwdChip.hidden = true;
const cwdChipIcon = lineIcon(ICONS.folder, 11);
const cwdChipText = el("span", "hint-cwd-text");
cwdChip.append(cwdChipIcon, cwdChipText);
cwdChip.addEventListener("click", () => {
  const cwd = state.workingDirectory;
  if (typeof cwd === "string" && cwd) vscode.postMessage({ kind: "revealInExplorer", path: cwd });
});
const hintRow = el("div", "hint-row");
hintRow.append(hint, sendKeyChip, cwdChip);
// 对话框顶部行:左上角 ＋ 添加文件 + 附件芯片;右上角 预设(新会话下拉 / 已开始会话纯文本标签)
const composerTop = el("div", "composer-top");
attachmentsRow.append(btnAddAttach);
const presetTag = el("span", "preset-tag");
presetTag.hidden = true;
// 上下文进度环固定在输入框右上角、预设胶囊右侧(弹层向上展开到对话区)
composerTop.append(attachmentsRow, presetPill, presetTag, contextMeter);
composer.append(lockNotice, composerTop, inputWrap, composerBottom, hintRow);

// 添加文件/文件夹选择菜单(挂在 composer 内)
const attachMenu = el("div", "plus-menu attach-menu");
attachMenu.hidden = true;
composer.append(attachMenu);

// + 命令菜单(挂在 composer 内,绝对定位基于 composer)
const plusMenu = el("div", "plus-menu");
plusMenu.hidden = true;
composer.append(plusMenu);

root.append(header, goalArea, messages, conversationBottom, pendingArea, statusRow, composer, statsLine);
app.append(root);

// ---------- 事件 ----------

// ---------- @ 智能体提及(输入 @ 自动展示可用智能体,选择后插入 @名称 ) ----------

/** 提及弹层(挂在输入框内,绝对定位在输入区上方)。 */
const mentionMenu = el("div", "mention-menu");
mentionMenu.hidden = true;
composer.append(mentionMenu);

/** @ 候选类型:智能体(本地扫描)/ 文件与文件夹 / Session 对话(rc.8 网页端同款)。 */
type MentionItem =
  | { kind: "agent"; name: string; description?: string }
  | { kind: "file"; name: string; description?: string; path: string }
  | { kind: "directory"; name: string; description?: string; path: string }
  | { kind: "session"; name: string; description?: string; mention: string };

/** 当前提及状态:替换起点、查询串、是否引号路径、候选与选中下标。 */
let mentionState: { start: number; query: string; quoted: boolean; items: MentionItem[]; selected: number } | null = null;

/** 待合并的远端候选(文件/会话),按查询串标记防过期。 */
let mentionRemote: { query: string; files: { path: string; kind: "file" | "directory" }[]; sessions: { label: string; cwd?: string; mention: string }[] } | null = null;

/** 远端候选(文件/会话)加载中(网页端 pending 分组同款:先显示加载行,候选到达后替换)。 */
let mentionRemoteLoading = false;

/** 可用智能体 = .dsh/agent + .github/agents(Copilot),按 front matter 名称去重。 */
function availableAgents(): { name: string; description?: string }[] {
  const cfg = state.claudeConfig;
  const out: { name: string; description?: string }[] = [];
  const seen = new Set<string>();
  for (const a of cfg?.dshAgents ?? []) {
    if (seen.has(a.name)) continue;
    seen.add(a.name);
    out.push({ name: a.name, description: a.description });
  }
  for (const a of cfg?.copilotAgents ?? []) {
    if (seen.has(a.name)) continue;
    seen.add(a.name);
    out.push({ name: a.name });
  }
  return out;
}

/** 组装候选:智能体(本地)在前,文件与文件夹 / Session 对话(远端)随后。 */
function mentionItems(): MentionItem[] {
  const q = mentionState?.query.toLowerCase() ?? "";
  const out: MentionItem[] = [];
  for (const a of availableAgents()) {
    if (a.name.toLowerCase().includes(q)) out.push({ kind: "agent", name: a.name, description: a.description });
  }
  if (mentionRemote && mentionRemote.query === mentionState?.query) {
    for (const f of mentionRemote.files) {
      if (f.path.toLowerCase().includes(q)) {
        const base = f.path.slice(f.path.lastIndexOf("/") + 1);
        out.push({
          kind: f.kind,
          name: `${t(f.kind === "directory" ? "文件夹" : "文件")} · ${base}${f.kind === "directory" ? "/" : ""}`,
          description: f.path,
          path: f.path,
        });
      }
    }
    for (const s of mentionRemote.sessions) {
      if (s.label.toLowerCase().includes(q)) {
        out.push({
          kind: "session",
          name: `${t("Session")} · ${s.label}`,
          description: s.cwd ?? t("（无工作目录）"),
          mention: s.mention,
        });
      }
    }
  }
  return out.slice(0, 12);
}

function closeMention() {
  mentionState = null;
  mentionRemote = null;
  mentionRemoteLoading = false;
  mentionMenu.hidden = true;
}

function renderMentionMenu() {
  if (!mentionState) return;
  mentionMenu.innerHTML = "";
  const items = mentionState.items;
  // 分组渲染:智能体 → 文件与文件夹 → Session 对话(网页端分组菜单同款,无 emoji 图标)
  let lastKind = "";
  const sectionFor = (kind: string) =>
    kind === "agent" ? t("智能体") : kind === "session" ? t("Session 对话") : t("文件与文件夹");
  const pushSection = (kind: string) => {
    if (kind !== lastKind) {
      mentionMenu.append(el("div", "plus-menu-label", sectionFor(kind)));
      lastKind = kind;
    }
  };
  const groupOf = (item: MentionItem) => (item.kind === "agent" ? "agent" : item.kind === "session" ? "session" : "file");
  const hasGroup = (g: string) => items.some((item) => groupOf(item) === g);
  items.forEach((item, i) => {
    pushSection(groupOf(item));
    const row = el("button", "plus-menu-item" + (i === mentionState!.selected ? " mention-selected" : ""));
    const main = el("span", "mention-item-main");
    main.append(el("span", "mention-item-name", item.name));
    if (item.description) main.append(el("span", "mention-item-desc", item.description));
    row.append(main);
    // 防止点击弹层时输入框先失焦(blur 会先关闭弹层)
    row.addEventListener("mousedown", (e) => e.preventDefault());
    row.addEventListener("click", () => selectMention(item));
    mentionMenu.append(row);
  });
  // 加载占位(网页端 pending 分组同款):已选会话且远端候选未返回时,为缺失的远端分组显示加载行
  if (mentionRemoteLoading) {
    if (!hasGroup("file")) {
      pushSection("file");
      mentionMenu.append(loadingMentionRow(t("正在加载文件资源…")));
    }
    if (!hasGroup("session")) {
      pushSection("session");
      mentionMenu.append(loadingMentionRow(t("正在加载会话列表…")));
    }
  }
  mentionMenu.hidden = items.length === 0 && !mentionRemoteLoading;
}

/** 加载行:纯 CSS 旋转小圆点 + 文案(无 emoji,保持简洁)。 */
function loadingMentionRow(text: string): HTMLElement {
  const row = el("div", "mention-loading");
  const spinner = el("span", "mention-spinner");
  row.append(spinner, el("span", undefined, text));
  return row;
}

/** @ 文件提及文本(网页端 dsh-file-reference grammar 同款):空白路径用 @"引号" 形式,目录保持斜杠并保留开引号以便继续输入。 */
function formatFileMention(path: string, kind: "file" | "directory", preserveQuote: boolean): string | undefined {
  const p = kind === "directory" ? `${path}/` : path;
  if (/[\u0000-\u001f\u007f-\u009f"]/u.test(p)) return undefined;
  const quoted = preserveQuote || /\s/u.test(p);
  if (!quoted) return `@${p}`;
  if (kind === "directory") return `@"${p}`;
  return `@"${p}"`;
}

/** 用所选候选替换当前部分 @token(智能体/文件/会话)。 */
function selectMention(item: MentionItem) {
  if (!mentionState) return;
  const pos = input.selectionStart ?? input.value.length;
  if (item.kind === "agent") {
    input.value = input.value.slice(0, mentionState.start) + `@${item.name} ` + input.value.slice(pos);
    closeMention();
  } else if (item.kind === "file" || item.kind === "directory") {
    const mention = formatFileMention(item.path, item.kind, mentionState.quoted);
    if (!mention) {
      closeMention();
      return;
    }
    input.value = input.value.slice(0, mentionState.start) + mention + input.value.slice(pos);
    const caret = mentionState.start + mention.length;
    input.setSelectionRange(caret, caret);
    if (item.kind === "directory") {
      // 目录:保留菜单继续输入下一级(网页端 continue 同款)
      autoResize();
      updateSendButton();
      updateMention();
      return;
    }
    closeMention();
  } else {
    input.value = input.value.slice(0, mentionState.start) + item.mention + input.value.slice(pos);
    closeMention();
  }
  input.focus();
  autoResize();
  updateSendButton();
}

/** 按光标前的 @partial 更新提及候选(网页端 grammar 同款:支持 @"引号路径")。 */
function updateMention() {
  const pos = input.selectionStart ?? input.value.length;
  const before = input.value.slice(0, pos);
  const quoted = before.match(/(?:^|\s)(@"([^"]*))$/);
  const plain = before.match(/(?:^|\s)(@([^\s]*))$/);
  const hit = quoted ? { query: quoted[2] ?? "", quoted: true, len: quoted[1].length } : plain ? { query: plain[2] ?? "", quoted: false, len: plain[1].length } : undefined;
  if (!hit) {
    closeMention();
    return;
  }
  const query = hit.query;
  closeSlash(); // @ 提及优先
  mentionState = { start: pos - hit.len, query, quoted: hit.quoted, items: [], selected: 0 };
  mentionRemote = null;
  // 智能体本地立即可用;文件/会话候选向宿主并行拉取(仅已选会话时),
  // 期间显示加载行(网页端 pending 分组同款)
  mentionRemoteLoading = !!state.current;
  if (state.current) {
    vscode.postMessage({ kind: "getMentionCandidates", sessionId: state.current, query });
  }
  mentionState.items = mentionItems();
  renderMentionMenu();
}

// ---------- / 命令与技能自动补全(输入 / 自动展示计划模式、技能等) ----------

/** 斜杠补全弹层(与提及弹层同款外观)。 */
const slashMenu = el("div", "mention-menu slash-menu");
slashMenu.hidden = true;
composer.append(slashMenu);

let slashState: { start: number; query: string; items: { token: string; label: string }[]; selected: number } | null = null;

function closeSlash() {
  slashState = null;
  slashMenu.hidden = true;
}

/** 斜杠候选:主要命令优先展示;输入过滤词后追加技能与 .claude 命令。 */
function slashCandidates(query: string): { token: string; label: string }[] {
  const fixed: { token: string; label: string }[] = [
    { token: "/plan", label: t("计划模式") },
    { token: "/plan off", label: t("退出计划模式") },
    { token: "/goal ", label: t("设置目标") },
    { token: "/compact", label: t("压缩上下文") },
    { token: "/feedback ", label: t("记录反馈") },
    { token: "/permission ", label: t("切换权限") },
    { token: "/rollback ", label: t("回退回合改动") },
    { token: "/redo", label: t("重做回退") },
    { token: "/checkpoints", label: t("查看检查点") },
  ];
  // 刚输入 /(无过滤词)时:只展示主要命令列表,技能等展开到列表后段
  const out = query === "" ? [...fixed] : fixed.filter((c) => c.token.slice(1).toLowerCase().startsWith(query));
  let skills = state.skills ?? [];
  if (state.agentDirs.dshUserSkills === false) {
    skills = skills.filter((s) => s.source !== "user-dsh" && s.source !== "user-agents" && s.source !== "custom");
  }
  for (const s of skills) out.push({ token: `/${s.name} `, label: t("技能 {name}", { name: s.name }) });
  const cfg = state.claudeConfig;
  for (const s of cfg?.skills ?? []) out.push({ token: `/${s.name} `, label: t("技能 {name}", { name: s.name }) });
  for (const s of cfg?.codexSkills ?? []) out.push({ token: `/${s.name} `, label: t("技能 {name}", { name: s.name }) });
  for (const c of cfg?.commands ?? []) out.push({ token: `/${c.name} `, label: t("命令 {name}", { name: c.name }) });
  // 有过滤词时,技能/命令也参与过滤
  return query === "" ? out : out.filter((c) => c.token.slice(1).toLowerCase().startsWith(query));
}

function renderSlashMenu() {
  if (!slashState) return;
  slashMenu.innerHTML = "";
  slashMenu.append(el("div", "plus-menu-label", t("命令 / 技能")));
  slashState.items.forEach((item, i) => {
    const row = el("button", "plus-menu-item" + (i === slashState!.selected ? " mention-selected" : ""));
    const main = el("span", "mention-item-main");
    main.append(el("span", "mention-item-name", item.token.trim()));
    main.append(el("span", "mention-item-desc", item.label));
    row.append(main);
    row.addEventListener("mousedown", (e) => e.preventDefault());
    row.addEventListener("click", () => selectSlash(item.token));
    slashMenu.append(row);
  });
  slashMenu.hidden = false;
}

/** 用所选命令/技能替换当前部分 /token。 */
function selectSlash(token: string) {
  if (!slashState) return;
  // 压缩上下文是无参数命令:与网页端菜单项一致 —— 选中即执行,
  // 不再插入文本等待回车(进度由对话内的压缩命令行呈现实时状态)
  if (token.trim() === "/compact") {
    closeSlash();
    input.focus();
    vscode.postMessage({ kind: "command", line: "/compact" });
    return;
  }
  const pos = input.selectionStart ?? input.value.length;
  input.value = input.value.slice(0, slashState.start) + token + input.value.slice(pos);
  closeSlash();
  input.focus();
  autoResize();
  updateSendButton();
}

/** 按光标前的 /partial 更新命令/技能候选(斜杠前需是行首或空白,避免误伤路径)。 */
function updateSlash() {
  if (mentionState) {
    closeSlash();
    return;
  }
  const pos = input.selectionStart ?? input.value.length;
  const before = input.value.slice(0, pos);
  const m = before.match(/(?:^|\s)\/([a-zA-Z][\w-]*)?$/);
  if (!m) {
    closeSlash();
    return;
  }
  const query = (m[1] ?? "").toLowerCase();
  const items = slashCandidates(query).slice(0, 8);
  if (items.length === 0) {
    closeSlash();
    return;
  }
  slashState = { start: pos - m[0].length, query: m[1] ?? "", items, selected: 0 };
  renderSlashMenu();
}

input.rows = 1;
// 主输入框标记(自动化夹具用它精确定位,避免与子代理/对话框输入框混淆)
input.dataset.role = "composer";
input.addEventListener("input", () => {
  autoResize();
  updateSendButton();
  updateMention();
  updateSlash();
  // 用户手动编辑历史调回的文本 = 放弃历史浏览并保留当前文本(避免 ↓ 把编辑内容顶掉)
  if (historyCursor !== -1 && !writingHistoryText) {
    historyDraft = input.value;
    historyCursor = -1;
    hideHistoryHint();
  }
});
input.addEventListener("keydown", (e) => {
  // 提及弹层打开时:方向键导航、Enter 选择、Esc 关闭(不触发发送)
  if (mentionState) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      mentionState.selected = Math.min(mentionState.items.length - 1, mentionState.selected + 1);
      renderMentionMenu();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      mentionState.selected = Math.max(0, mentionState.selected - 1);
      renderMentionMenu();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeMention();
      return;
    }
    if (e.key === "Enter" && isPopupAcceptEnter(e)) {
      e.preventDefault();
      const item = mentionState.items[mentionState.selected];
      if (item) selectMention(item);
      return;
    }
  }
  // 斜杠补全弹层打开时:同样支持方向键 / Enter / Esc
  if (slashState) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      slashState.selected = Math.min(slashState.items.length - 1, slashState.selected + 1);
      renderSlashMenu();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      slashState.selected = Math.max(0, slashState.selected - 1);
      renderSlashMenu();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeSlash();
      return;
    }
    if (e.key === "Enter" && isPopupAcceptEnter(e)) {
      e.preventDefault();
      selectSlash(slashState.items[slashState.selected].token);
      return;
    }
  }
  // 输入历史(issue #20):↑/↓ 调回之前发送的内容。
  //
  // 触发时机(0.13.41 重做):旧实现用「光标是否在绝对首字符 / 文本末字符」判断边界,
  // 于是有两个反直觉:
  //   ① 自动折行的长单行文本:光标在末尾时按 ↑ 会立刻召回历史 —— 但用户只是想往上挪一行;
  //   ② 多行文本:必须先按若干次 ↑ 把光标挪到首行,再按一次才会召回 —— 感觉「怎么按都不切」。
  // 现在改为**看光标到底还能不能动**:先让浏览器处理默认行为,松开键时若光标没动(已在视觉首/末行),
  // 那一次按键就立即召回;光标动了就只是移动光标。既不会劫持折行文本,又不需要多按一次。
  // Ctrl/Alt + ↑/↓ 永远立即召回;`dsh.historyKey` 可把普通方向键改成 always(一按就召回)或 off。
  if (!e.isComposing && !mentionState && !slashState) {
    const plainArrow = (e.key === "ArrowUp" || e.key === "ArrowDown") && !e.shiftKey && !e.metaKey;
    const withModifier = (e.key === "ArrowUp" || e.key === "ArrowDown") && (e.ctrlKey || e.altKey);
    if (withModifier) {
      // 显式召回组合键:不涉及光标移动语义,立即生效
      e.preventDefault();
      if (e.key === "ArrowUp") historyBackward();
      else if (historyCursor !== -1) historyForward();
      return;
    }
    if (plainArrow && historyKeyMode !== "off") {
      const up = e.key === "ArrowUp";
      // 已在浏览历史:↑ 立即继续回溯(调回后光标在末尾,再判定「能不能动」会卡住);
      // ↓ 只在光标已到末尾(或全选)时前移,否则交给光标移动。
      const browsing = historyCursor !== -1;
      if (browsing && up) {
        e.preventDefault();
        historyBackward();
        return;
      }
      if (browsing && !up && (caretAtEnd() || allSelected())) {
        e.preventDefault();
        historyForward();
        return;
      }
      if (historyKeyMode === "always" && (up || (caretAtEnd() || allSelected()))) {
        e.preventDefault();
        if (up) historyBackward();
        else historyForward();
        return;
      }
      // edge 模式:先不拦截,交由浏览器移动光标;keyup 时再判定是否已在边界
      if (!browsing && historyKeyMode === "edge") {
        pendingArrow = { key: up ? "ArrowUp" : "ArrowDown", pos: input.selectionStart ?? 0, value: input.value, scrollTop: input.scrollTop };
      }
    }
    if (e.key === "Escape" && historyCursor !== -1) {
      e.preventDefault();
      historyForwardAtLatest();
      return;
    }
  }
  if (e.key === "Enter" && !e.isComposing) {
    // 发送快捷键按设置裁决(issue #21 第 1 条):
    // enter → Enter 发送、Shift+Enter 换行;ctrl-enter / shift-enter → 反之为换行,组合键发送。
    const withShift = e.shiftKey;
    const withCtrl = e.ctrlKey || e.metaKey;
    const send =
      sendKeyMode === "enter" ? !withShift && !withCtrl : sendKeyMode === "ctrl-enter" ? withCtrl && !withShift : withShift && !withCtrl;
    if (send) {
      e.preventDefault();
      sendCurrent();
    }
    // 不发送时:交给输入框默认行为(换行),因此这里不 preventDefault
  }
});
input.addEventListener("blur", () => {
  closeMention();
  closeSlash();
  // 失焦时丢弃待判定的方向键(否则下一次 keyup 会误触发召回)
  pendingArrow = null;
});

// 方向键松开:edge 模式下由「光标是否移动过」决定这次按键是移动光标还是召回历史。
input.addEventListener("keyup", (e) => {
  if (!pendingArrow || pendingArrow.key !== e.key) return;
  const { pos, value, scrollTop, key } = pendingArrow;
  pendingArrow = null;
  // 弹层(提及 / 斜杠)在按键之间被打开时,方向键属于弹层导航:丢弃待判定状态
  if (mentionState || slashState) return;
  // 文本被改过或光标位置变了 → 这次按键在移动光标,不召回
  if (input.value !== value) return;
  if ((input.selectionStart ?? 0) !== pos || (input.selectionEnd ?? 0) !== pos) return;
  // 光标没动 = 已在视觉首/末行的边界,这一次按键直接召回
  input.scrollTop = scrollTop;
  if (key === "ArrowUp") historyBackward();
  else if (historyCursor !== -1) historyForward();
});

// ---------- 粘贴支持:剪贴板图片 → 图片附件;复制的本地文件/文件夹 → 文件附件 ----------

/** 图片魔数探测(与服务端 IMAGE_TYPE_MISMATCH 规则一致):仅接受 PNG/JPEG/GIF/WebP。 */
function sniffImageType(bytes: Uint8Array): string | undefined {
  const has = (offset: number, ...sig: number[]) => sig.every((v, i) => bytes[offset + i] === v);
  if (bytes.length >= 8 && has(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (bytes.length >= 3 && has(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (bytes.length >= 6 && has(0, 0x47, 0x49, 0x46, 0x38) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) return "image/gif";
  if (bytes.length >= 12 && has(0, 0x52, 0x49, 0x46, 0x46) && has(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return undefined;
}

function base64OfBytes(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

const PASTE_IMAGE_MAX_BYTES = 6 * 1024 * 1024;

/** 处理剪贴板中的文件项(图片 → state.images;带路径的其它文件 → 宿主附件)。 */
async function applyPastedFiles(files: File[]) {
  let added = 0;
  const paths: string[] = [];
  for (const file of files) {
    if (file.type.startsWith("image/")) {
      if (state.images.length >= 8) {
        showToast(t("⚠️ 最多一次添加 8 张图片"), "warning");
        break;
      }
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        if (buf.byteLength > PASTE_IMAGE_MAX_BYTES) {
          showToast(t("⚠️ 图片超过 6MB 已跳过:{name}", { name: file.name || "clipboard" }), "warning");
          continue;
        }
        // 按字节探测:剪贴板 blob.type 可能与内容不符(如截图标记为 image/png 实为 JPEG)
        const mediaType = sniffImageType(buf);
        if (!mediaType) {
          showToast(t("⚠️ 无法识别的图片格式:{name}(支持 PNG/JPEG/GIF/WebP)", { name: file.name || "clipboard" }), "warning");
          continue;
        }
        const ext = mediaType === "image/png" ? "png" : mediaType === "image/jpeg" ? "jpg" : mediaType === "image/gif" ? "gif" : "webp";
        state.images.push({
          data: base64OfBytes(buf),
          mediaType,
          name: file.name || `pasted-${Date.now()}.${ext}`,
        });
        added++;
      } catch (error) {
        showToast(t("⚠️ 粘贴图片失败:{error}", { error: String(error) }), "error");
      }
    } else {
      // VS Code webview 中复制的本地文件带 path/uri 才可附加
      const p = (file as { path?: unknown; uri?: unknown }).path;
      const uri = (file as { uri?: { fsPath?: unknown } }).uri;
      const fromUri = typeof uri === "object" && uri !== null && typeof (uri as { fsPath?: unknown }).fsPath === "string"
        ? (uri as { fsPath: string }).fsPath
        : undefined;
      const fsPath = typeof p === "string" ? p : fromUri;
      if (fsPath) paths.push(fsPath);
      else showToast(t("⚠️ 非图片附件请从资源管理器复制(未提供本地路径)"), "warning");
    }
  }
  if (paths.length > 0) vscode.postMessage({ kind: "attachPastedPaths", paths });
  if (added > 0) {
    renderAttachments();
    showToast(t("✅ 已添加 {n} 张图片", { n: String(added) }), "info");
  }
}

/** 把文本中的本地路径(资源管理器复制文件的 file:// URI 列表 / 盘符与 UNC 路径)解析为路径数组。 */
function parsePastedPathText(text: string): string[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const isPath = (token: string) =>
    /^file:\/\/\/?/i.test(token) || /^[A-Za-z]:[\\/]/.test(token) || /^\\\\[^"']+/.test(token);
  if (tokens.length > 0 && tokens.every(isPath)) return tokens;
  return [];
}

input.addEventListener("paste", (e) => {
  const cd = e.clipboardData;
  if (!cd) return;
  const files: File[] = [];
  for (let i = 0; i < cd.items.length; i++) {
    const item = cd.items[i];
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  if (files.length > 0) {
    e.preventDefault();
    void applyPastedFiles(files);
    return;
  }
  // 纯文本路径列表(如资源管理器复制 → file:// URI,或直接复制的盘符/UNC 路径)
  const paths = parsePastedPathText(cd.getData("text/plain") ?? "");
  if (paths.length > 0) {
    e.preventDefault();
    vscode.postMessage({ kind: "attachPastedPaths", paths });
  }
  // 其它文本粘贴走默认行为
});

btnSendStop.addEventListener("click", () => {
  const hasText = input.value.trim().length > 0 || state.images.length > 0;
  if (state.running && !hasText) {
    vscode.postMessage({ kind: "stop" });
    return;
  }
  sendCurrent();
});
btnAddAttach.addEventListener("click", (e) => {
  e.stopPropagation();
  attachMenu.innerHTML = "";
  const item = (label: string, mode: "file" | "folder" | "image") => {
    const b = el("button", "plus-menu-item", label);
    b.addEventListener("click", () => {
      attachMenu.hidden = true;
      vscode.postMessage({ kind: mode === "image" ? "pickImages" : "pickAttachments", mode });
    });
    attachMenu.append(b);
  };
  item(t("📄 添加文件"), "file");
  item(t("📁 添加文件夹"), "folder");
  item(t("🖼️ 添加图片"), "image");
  attachMenu.hidden = !attachMenu.hidden;
});
document.addEventListener("click", (e) => {
  if (!attachMenu.hidden && e.target !== btnAddAttach && !attachMenu.contains(e.target as Node)) attachMenu.hidden = true;
});
btnNew.addEventListener("click", () => {
  // 新建会话:立即清掉旧会话的计划/目标状态,避免过渡期点击芯片把 /plan 误发给新会话
  state.planMode = false;
  state.goal = null;
  renderGoal();
  renderModeChips();
  vscode.postMessage({ kind: "new" });
});
btnBrowser.addEventListener("click", () => vscode.postMessage({ kind: "openBrowser" }));
btnCordis.addEventListener("click", () => vscode.postMessage({ kind: "openCordisPanel" }));
btnWorkspaces.addEventListener("click", () => panels.openWorkspaces());
btnJobs.addEventListener("click", () => panels.openJobs());
btnSchedule.addEventListener("click", () => panels.openSchedule());
btnTrajectory.addEventListener("click", () => panels.openTrajectory(state.rawEvents));
btnSettings.addEventListener("click", () => panels.openSettings());
btnSubagents.addEventListener("click", (e) => {
  e.stopPropagation();
  openSubagentCatalog();
});
sessionBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  // 每次展开时重建列表(拿到最新的审批/等待回答/未读状态)
  renderSessions();
  sessionList.hidden = !sessionList.hidden;
});
// 点击弹层外部关闭(与其余锚定弹层行为一致)
document.addEventListener("click", (e) => {
  if (!sessionList.hidden && !sessionSelectWrap.contains(e.target as Node)) sessionList.hidden = true;
});
modelPillHead.addEventListener("click", (e) => {
  e.stopPropagation();
  renderModelPill();
  renderThinkingSeg();
  const opening = modelPillPop.hidden;
  modelPillPop.hidden = !opening;
  modelPill.classList.toggle("open", opening);
});
// 点击弹层外部或 Esc 关闭
document.addEventListener("click", (e) => {
  if (!modelPillPop.hidden && !modelPill.contains(e.target as Node)) {
    modelPillPop.hidden = true;
    modelPill.classList.remove("open");
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modelPillPop.hidden) {
    modelPillPop.hidden = true;
    modelPill.classList.remove("open");
  }
});
presetPillHead.addEventListener("click", (e) => {
  e.stopPropagation();
  renderPresetPill();
  const opening = presetPillPop.hidden;
  presetPillPop.hidden = !opening;
  presetPill.classList.toggle("open", opening);
});
// 点击弹层外部或 Esc 关闭(与权限胶囊一致)
document.addEventListener("click", (e) => {
  if (!presetPillPop.hidden && !presetPill.contains(e.target as Node)) {
    presetPillPop.hidden = true;
    presetPill.classList.remove("open");
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !presetPillPop.hidden) {
    presetPillPop.hidden = true;
    presetPill.classList.remove("open");
  }
});
permissionPillHead.addEventListener("click", (e) => {
  e.stopPropagation();
  renderPermissionPill();
  const opening = permissionPillPop.hidden;
  permissionPillPop.hidden = !opening;
  permissionPill.classList.toggle("open", opening);
});
contextMeterBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (contextMeter.hidden) return;
  renderContextMeter(); // 每次展开都重建面板,避免首次点击展开为空
  const opening = contextMeterPanel.hidden;
  contextMeterPanel.hidden = !opening;
  contextMeter.classList.toggle("open", opening);
});
// 点击弹层外部或 Esc 关闭
document.addEventListener("click", (e) => {
  if (!contextMeterPanel.hidden && !contextMeter.contains(e.target as Node)) {
    contextMeterPanel.hidden = true;
    contextMeter.classList.remove("open");
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !contextMeterPanel.hidden) {
    contextMeterPanel.hidden = true;
    contextMeter.classList.remove("open");
  }
});
ppMore.addEventListener("click", (e) => {
  e.stopPropagation();
  permissionPillPop.hidden = true;
  permissionPill.classList.remove("open");
  panels.openSettings();
});
// 点击弹层外部或 Esc 关闭
document.addEventListener("click", (e) => {
  if (!permissionPillPop.hidden && !permissionPill.contains(e.target as Node)) {
    permissionPillPop.hidden = true;
    permissionPill.classList.remove("open");
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !permissionPillPop.hidden) {
    permissionPillPop.hidden = true;
    permissionPill.classList.remove("open");
  }
});

// 底部回退 / 分支操作
// 回到主线按钮:仅当前会话是分叉分支时显示
btnBackToMain.addEventListener("click", () => {
  const current = state.sessions.find((s) => s.sessionId === state.current);
  if (current?.parentSessionId) {
    vscode.postMessage({ kind: "select", sessionId: current.parentSessionId });
  }
});

// 左下角 + 预设命令菜单
btnPlus.addEventListener("click", (e) => {
  e.stopPropagation();
  renderPlusMenu();
  plusMenu.hidden = !plusMenu.hidden;
});
document.addEventListener("click", (e) => {
  if (!plusMenu.hidden && e.target !== btnPlus && !plusMenu.contains(e.target as Node)) plusMenu.hidden = true;
});

function renderPlusMenu() {
  plusMenu.innerHTML = "";
  // 预设命令统一插入输入框(聚焦待确认),不自动发送
  const insert = (text: string) => {
    plusMenu.hidden = true;
    input.value += (input.value ? "\n" : "") + text;
    input.focus();
    autoResize();
    updateSendButton();
  };
  const item = (icon: string, label: string, action: () => void, hintText?: string, cls?: string) => {
    const b = el("button", "plus-menu-item" + (cls ? ` ${cls}` : ""), `${icon} ${label}`);
    if (hintText) b.title = hintText;
    b.addEventListener("click", action);
    plusMenu.append(b);
    return b;
  };
  // 计划模式:进入与退出是两条不同命令(/plan 进入,/plan off 退出 —— 与宿主命令语义一致)
  if (state.planMode) {
    item("📝", t("退出计划模式"), () => insert("/plan off"), t("插入 /plan off 到输入框,回车后退出计划模式"));
  } else {
    item("📝", t("计划模式"), () => insert("/plan"), t("插入 /plan 到输入框,回车后进入计划模式"));
  }
  item(
    "🗜️",
    t("压缩上下文"),
    () => vscode.postMessage({ kind: "command", line: "/compact" }),
    t("立即执行 /compact;压缩进度显示在对话中"),
  );
  item("🎯", t("设置目标"), () => insert("/goal "), t("插入 /goal 命令,补全目标描述后回车"));
  item("💬", t("记录反馈"), () => insert("/feedback "), t("插入 /feedback 命令记录会话反馈"));
  // 插件(Cordis)管理:由 agent 的 cordis 工具执行,插入指令让 agent 操作
  {
    const group = el("div", "plus-menu-label", t("插件(Cordis)"));
    plusMenu.append(group);
    item("📦", t("列出插件状态"), () => insert(t("请列出当前所有动态 Cordis 插件及其运行状态(cordis_inspect)")), t("让 agent 用 cordis_inspect 汇报插件清单"));
    item("▶️", t("运行插件 <id>"), () => insert(t("请运行插件 rbak-1(cordis_run)")), t("把 rbak-1 换成目标插件 ID"));
    item("🔄", t("更新插件 <id>"), () => insert(t("请更新插件 rbak-1 并运行(cordis_define + cordis_run update)")), t("把 rbak-1 换成目标插件 ID"));
    item("⏹️", t("停止插件 <id>"), () => insert(t("请停止插件 rbak-1(cordis_stop)")), t("把 rbak-1 换成目标插件 ID"));
    item("🗑️", t("删除插件 <id>"), () => insert(t("请删除插件 rbak-1(cordis_undefine)")), t("把 rbak-1 换成目标插件 ID"));
  }
  const perms = state.permissions?.options ?? [];
  if (perms.length > 0) {
    const group = el("div", "plus-menu-label", t("切换权限(直接应用)"));
    plusMenu.append(group);
    for (const option of perms) {
      const active = state.permissions?.currentValue === option.value;
      const danger = PERMISSION_ICONS[option.value]?.danger === true;
      item(
        active ? "✅" : permissionIcon(option.value),
        permissionLabel(option.value, option.name),
        () => {
          state.permissions = { ...(state.permissions ?? { options: [], currentValue: "" }), currentValue: option.value };
          renderPermissionPill();
          vscode.postMessage({ kind: "permission", preset: option.value });
        },
        (option.description ?? "") + (danger ? (option.description ? " · " : "") + t("危险:放开全部沙箱与审批限制") : ""),
        danger ? "perm-danger" : undefined,
      );
    }
  }
  // 技能列表(来自 DSH skill.list):与网页端一致,选中插入字面 "/名称 " 文本,
  // 由宿主 pre-step 边界注入技能正文;列表默认收起到前 6 个,展开全部走菜单滚动。
  // 「DSH 用户技能」开关关闭时,过滤掉用户全局目录(~/.dsh/skills、~/.agents/skills)与自定义目录的技能。
  let skills = state.skills ?? [];
  if (state.agentDirs.dshUserSkills === false) {
    skills = skills.filter((s) => s.source !== "user-dsh" && s.source !== "user-agents" && s.source !== "custom");
  }
  if (skills.length > 0) {
    const group = el("div", "plus-menu-label", t("技能(选中插入 /名称 调用)"));
    plusMenu.append(group);
    const list = el("div", "plus-menu-skills");
    const MAX_VISIBLE = 6;
    const renderSkillRows = (all: boolean) => {
      list.innerHTML = "";
      const shown = all ? skills : skills.slice(0, MAX_VISIBLE);
      for (const skill of shown) {
        const b = el("button", "plus-menu-item", `🧩 /${skill.name}`);
        b.title = skill.description || skill.whenToUse || skill.name;
        // 来源标注:用户全局技能显示「全局」标签,便于区分(默认展示,可在设置关闭)
        if (skill.source === "user-dsh" || skill.source === "user-agents") {
          b.append(el("span", "skill-source-tag", t("全局")));
        }
        b.addEventListener("click", () => insert(`/${skill.name} `));
        list.append(b);
      }
      if (!all && skills.length > MAX_VISIBLE) {
        const more = el("button", "plus-menu-item", t("▾ 展开全部技能 ({n})", { n: String(skills.length) }));
        more.addEventListener("click", () => renderSkillRows(true));
        list.append(more);
      }
    };
    renderSkillRows(false);
    plusMenu.append(list);
  }
  // 智能体/技能配置:.claude(DSH 核心自动读 CLAUDE.md/AGENTS.md)/ .codex / .github(Copilot)/ .dsh(自身约定)
  const claude = state.claudeConfig;
  const hasClaude = claude && (claude.claudeMd || claude.commands.length > 0 || claude.skills.length > 0);
  const hasCodex = claude && (claude.codexConfig || claude.codexSkills.length > 0);
  const hasCopilot =
    claude && (claude.copilotInstructions !== null || claude.copilotInstructionFiles.length > 0 || claude.copilotAgents.length > 0 || claude.copilotPrompts.length > 0);
  const hasDsh = claude && (claude.dshSkills.length > 0 || claude.dshAgents.length > 0 || claude.dshMemory.length > 0);
  if (hasDsh) {
    const group = el("div", "plus-menu-label", ".dsh");
    plusMenu.append(group);
    // .dsh/skills:宿主原生技能,插入 /名称 调用 token(宿主在 pre-step 边界自动展开正文,与网页端一致)
    for (const skill of claude!.dshSkills) {
      item("🧩", t("技能 {name}", { name: skill.name }), () => insert(`/${skill.name} `), t("插入 /名称 调用技能(宿主自动展开技能正文)"));
    }
    // .dsh/agent:项目级智能体定义,点击在 VS Code 中打开文件(不把全文塞进输入框)
    for (const agent of claude!.dshAgents) {
      const path = (agent as { path?: string }).path;
      item("🤖", t("智能体 {name}", { name: agent.name }), () => {
        if (path) vscode.postMessage({ kind: "openFile", path });
      }, t("在 VS Code 中打开智能体定义文件"));
    }
    // .dsh/memory:记忆文件,点击在 VS Code 中打开
    for (const memory of claude!.dshMemory) {
      const path = (memory as { path?: string }).path;
      item("🧠", t("记忆 {name}", { name: memory.name }), () => {
        if (path) vscode.postMessage({ kind: "openFile", path });
      }, t("在 VS Code 中打开记忆文件"));
    }
  }
  if (hasClaude) {
    const group = el("div", "plus-menu-label", ".claude");
    plusMenu.append(group);
    if (claude!.claudeMd) {
      const info = el("button", "plus-menu-item", t("✅ CLAUDE.md · DSH 已自动读取"));
      info.title = t("工作区根目录的 CLAUDE.md / AGENTS.md 已由 DeepSeek Harness 核心自动加载到上下文,无需手动处理");
      info.style.cursor = "default";
      plusMenu.append(info);
    }
    for (const cmd of claude!.commands) {
      item("⚡", `/${cmd.name}`, () => insert(cmd.content), t("插入 .claude 命令模板"));
    }
    // 技能一律按 /名称 token 插入(与所有技能一致):宿主或扩展在发送时展开正文,不再整文塞入输入框
    for (const skill of claude!.skills) {
      item("🎓", t("技能 {name}", { name: skill.name }), () => insert(`/${skill.name} `), t("插入 /名称 调用技能(发送时自动展开技能正文)"));
    }
  }
  if (hasCodex) {
    const group = el("div", "plus-menu-label", ".codex");
    plusMenu.append(group);
    if (claude!.codexConfig) {
      const info = el("button", "plus-menu-item", t("✅ .codex/config.toml 已存在"));
      info.title = t(".codex/config.toml 由 Codex CLI 使用;DSH 不读取该配置,可通过 AGENTS.md(已自动加载)承载共享指令");
      info.style.cursor = "default";
      plusMenu.append(info);
    }
    for (const skill of claude!.codexSkills) {
      item("🎓", t("技能 {name}", { name: skill.name }), () => insert(`/${skill.name} `), t("插入 /名称 调用技能(发送时自动展开技能正文)"));
    }
  }
  if (hasCopilot) {
    const group = el("div", "plus-menu-label", "GitHub Copilot");
    plusMenu.append(group);
    if (claude!.copilotInstructions !== null) {
      item("📄", "copilot-instructions.md", () => insert(claude!.copilotInstructions!), t("插入 Copilot 工作区指令"));
    }
    for (const file of claude!.copilotInstructionFiles) {
      item("📄", t("指令 {name}", { name: file.name }), () => insert(file.content), t("插入 Copilot 指令文件"));
    }
    for (const agent of claude!.copilotAgents) {
      item("🤖", t("智能体 {name}", { name: agent.name }), () => insert(agent.content), t("插入 Copilot 智能体定义"));
    }
    for (const prompt of claude!.copilotPrompts) {
      item("💬", t("提示词 {name}", { name: prompt.name }), () => insert(prompt.content), t("插入 Copilot 提示词"));
    }
  }
}

// 会话操作菜单
btnMore.addEventListener("click", (e) => {
  e.stopPropagation();
  sessionMenu.hidden = !sessionMenu.hidden;
});
document.addEventListener("click", (e) => {
  if (!sessionMenu.hidden && e.target !== btnMore && !sessionMenu.contains(e.target as Node)) {
    sessionMenu.hidden = true;
  }
});
menuRename.addEventListener("click", async () => {
  sessionMenu.hidden = true;
  const current = state.sessions.find((s) => s.sessionId === state.current);
  const title = await showDialog({
    title: t("重命名会话"),
    text: t("修改会话标题(已填入当前标题):"),
    input: true,
    confirmLabel: t("重命名"),
    value: current?.title ?? "",
  });
  if (title) vscode.postMessage({ kind: "rename", title });
});
menuFork.addEventListener("click", () => {
  sessionMenu.hidden = true;
  vscode.postMessage({ kind: "fork" });
});
menuCopyId.addEventListener("click", () => {
  sessionMenu.hidden = true;
  // 剪贴板由宿主写入(vscode.env.clipboard),webview 里没有直接的剪贴板权限
  if (!state.current) return;
  vscode.postMessage({ kind: "copyText", text: state.current });
  showToast(t("已复制会话 ID"), "info");
});
menuArchive.addEventListener("click", async () => {
  sessionMenu.hidden = true;
  const ok = await showDialog({
    title: t("归档会话"),
    text: t("归档后该会话将从列表隐藏(仍保留在 DSH 服务器,可在浏览器 GUI 中恢复)。确定归档?"),
    confirmLabel: t("归档"),
  });
  if (ok) vscode.postMessage({ kind: "archive" });
});

function autoResize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 320) + "px";
}

// ---------- 输入历史(↑ / ↓ 调回之前发送的内容;issue #20) ----------

/** 历史条数上限(仅本次 webview 生命周期内保留,随 VS Code 窗口状态持久化)。 */
const INPUT_HISTORY_MAX = 50;
/** 历史栈(旧 → 新)。 */
let inputHistory: string[] = [];
/** 历史浏览游标:inputHistory.length = 未浏览(正在编辑新内容)。 */
let historyCursor = -1;
/** 进入历史浏览前的草稿:Esc 或回到最新位置时恢复。 */
let historyDraft = "";
let historyHintTimer: number | null = null;
/** 程序化写入输入框期间为 true:避免把「历史调回」误判为用户编辑。 */
let writingHistoryText = false;

/**
 * 方向键历史召回模式(dsh.historyKey):
 * - `edge`(默认):光标已经在视觉首行 / 末行时那一次按键就召回,否则只移动光标;
 * - `always`:普通 ↑/↓ 一律召回,不移动光标;
 * - `off`:普通 ↑/↓ 从不召回(Ctrl/Alt + ↑/↓ 仍可用)。
 */
let historyKeyMode: "edge" | "always" | "off" = "edge";

/** 等待 keyup 判定的方向键(edge 模式):记录按下时的光标位置与文本。 */
let pendingArrow: { key: "ArrowUp" | "ArrowDown"; pos: number; value: string; scrollTop: number } | null = null;

/** 从 VS Code webview 状态恢复历史(窗口重载后仍可用;旧版 API 缺失时静默跳过)。 */
function restoreInputHistory() {
  try {
    const saved = vscode.getState?.() as { inputHistory?: unknown } | undefined;
    if (Array.isArray(saved?.inputHistory)) {
      inputHistory = saved.inputHistory.filter((item): item is string => typeof item === "string" && item.trim() !== "").slice(-INPUT_HISTORY_MAX);
    }
  } catch {
    inputHistory = [];
  }
}

/** 持久化历史(失败不影响输入)。 */
function persistInputHistory() {
  try {
    const current = (vscode.getState?.() as Record<string, unknown> | undefined) ?? {};
    vscode.setState?.({ ...current, inputHistory });
  } catch {
    // 状态 API 不可用:本次会话内仍可用,只是不跨窗口重载
  }
}

/** 记录一条已发送的输入(连续重复不入栈)。 */
function rememberInput(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (inputHistory[inputHistory.length - 1] === trimmed) {
    exitHistoryBrowsing();
    return;
  }
  inputHistory.push(trimmed);
  if (inputHistory.length > INPUT_HISTORY_MAX) inputHistory = inputHistory.slice(-INPUT_HISTORY_MAX);
  persistInputHistory();
  exitHistoryBrowsing();
}

/** 历史浏览提示:显示位置后 1.6s 自动隐藏(不打断输入)。 */
function showHistoryHint(label: string) {
  historyHint.textContent = label;
  historyHint.hidden = false;
  if (historyHintTimer !== null) window.clearTimeout(historyHintTimer);
  historyHintTimer = window.setTimeout(() => {
    historyHint.hidden = true;
    historyHintTimer = null;
  }, 1600);
}

function hideHistoryHint() {
  if (historyHintTimer !== null) {
    window.clearTimeout(historyHintTimer);
    historyHintTimer = null;
  }
  historyHint.hidden = true;
}

/** 退出历史浏览(保留当前文本)。 */
function exitHistoryBrowsing() {
  historyCursor = -1;
  historyDraft = "";
  hideHistoryHint();
}

/** 写入输入框并复位光标/高度(历史调回与草稿恢复共用)。
 *  光标必须落在末尾:若停在 0,下一次 ↑ 会被「首行行首」判定当成光标移动而不再回溯。 */
function setInputText(text: string) {
  writingHistoryText = true;
  try {
    input.value = text;
    const end = text.length;
    input.setSelectionRange(end, end);
  } finally {
    writingHistoryText = false;
  }
  autoResize();
  updateSendButton();
}

/** 光标是否在首行行首(↑ 触发历史的条件:不劫持文本内的光标移动)。 */
function caretAtStart(): boolean {
  return (input.selectionStart ?? 0) === 0 && (input.selectionEnd ?? 0) === 0;
}

/** 光标是否在末行末尾(↓ 触发历史的条件)。 */
function caretAtEnd(): boolean {
  const end = input.value.length;
  return (input.selectionStart ?? end) === end && (input.selectionEnd ?? end) === end;
}

/** 单行输入(没有换行):此时 ↑/↓ 不涉及跨行移动,可直接用于历史(与 shell 一致)。 */
function isSingleLine(): boolean {
  return !input.value.includes("\n");
}

/** ↑ 是否可接管:浏览历史中、光标在首行行首、全选,或单行且光标在末尾。 */
function canRecallBackward(): boolean {
  if (historyCursor !== -1) return true;
  if (allSelected()) return true;
  if (caretAtStart()) return true;
  if (isSingleLine() && caretAtEnd()) return true;
  return false;
}

/** 当前文本是否全选(全选时方向键视为整体替换而非移动光标)。 */
function allSelected(): boolean {
  const start = input.selectionStart ?? 0;
  const end = input.selectionEnd ?? 0;
  return end > start && start === 0 && end === input.value.length;
}

/** ↑:向更早的输入回溯;到顶后停在最早一条。 */
function historyBackward() {
  if (inputHistory.length === 0) return;
  if (historyCursor === -1) {
    historyDraft = input.value;
    historyCursor = inputHistory.length - 1;
  } else if (historyCursor > 0) {
    historyCursor -= 1;
  } else {
    showHistoryHint(t("已是最早的输入"));
    return;
  }
  setInputText(inputHistory[historyCursor]);
  showHistoryHint(t("历史 {index}/{total}", { index: String(historyCursor + 1), total: String(inputHistory.length) }));
}

/** ↓:向更新的输入前进;越过最新一条即恢复进入历史前的草稿。 */
function historyForward() {
  if (historyCursor === -1) return;
  if (historyCursor < inputHistory.length - 1) {
    historyCursor += 1;
    setInputText(inputHistory[historyCursor]);
    showHistoryHint(t("历史 {index}/{total}", { index: String(historyCursor + 1), total: String(inputHistory.length) }));
    return;
  }
  const draft = historyDraft;
  exitHistoryBrowsing();
  setInputText(draft);
}

/** Esc:放弃历史浏览,回到进入历史前正在编辑的草稿。 */
function historyForwardAtLatest() {
  const draft = historyDraft;
  exitHistoryBrowsing();
  setInputText(draft);
}

restoreInputHistory();

// ---------- 输入区偏好(issue #21:发送快捷键 / 面板字体 / 产物列表折叠) ----------

/** 发送快捷键:enter(默认)/ ctrl-enter / shift-enter。 */
let sendKeyMode: "enter" | "ctrl-enter" | "shift-enter" = "enter";
/** 产物文件列表是否默认折叠为一行摘要(避免多轮对话被卡片占满)。默认折叠:与设置默认值一致。 */
let autoCollapseProducedFiles = true;
/** 输入区字体(留空跟随 VS Code 界面字体)。 */
let composerFontFamily = "";

function applyComposerPrefs(prefs: { sendKey?: string; fontFamily?: string; autoCollapseProducedFiles?: boolean; historyKey?: string } | undefined) {
  if (!prefs) return;
  sendKeyMode = prefs.sendKey === "ctrl-enter" || prefs.sendKey === "shift-enter" ? prefs.sendKey : "enter";
  if (typeof prefs.autoCollapseProducedFiles === "boolean") autoCollapseProducedFiles = prefs.autoCollapseProducedFiles;
  // 方向键历史召回模式(默认 edge:光标到不了才召回)
  historyKeyMode = prefs.historyKey === "always" || prefs.historyKey === "off" ? prefs.historyKey : "edge";
  pendingArrow = null;
  // 字体:用户显式配置时覆盖主题字体(--dsh-font);留空则继续跟随 VS Code 界面字体
  const family = (prefs.fontFamily ?? "").trim();
  composerFontFamily = family;
  if (family) document.documentElement.style.setProperty("--dsh-font", family);
  else document.documentElement.style.removeProperty("--dsh-font");
  // 快捷键提示行跟随当前模式
  refreshComposerHint();
}

/**
 * 该 Enter 事件是否应触发主输入框的「发送」(严格按 dsh.sendKey 裁决,
 * 因此未配置的 Ctrl+Enter / Shift+Enter 会落到输入框默认的换行行为)。
 */
function isSendEnter(e: KeyboardEvent): boolean {
  const withShift = e.shiftKey;
  const withCtrl = e.ctrlKey || e.metaKey;
  return sendKeyMode === "enter" ? !withShift && !withCtrl : sendKeyMode === "ctrl-enter" ? withCtrl && !withShift : withShift && !withCtrl;
}

/**
 * 弹层(@ 提及 / 斜杠命令)里的 Enter 视为「选择该项」:沿用默认的 Enter 语义
 * —— 默认模式与 Shift+Enter 发送模式下都接受 Enter,只有 Ctrl+Enter 发送模式要求一起按 Ctrl。
 */
function isPopupAcceptEnter(e: KeyboardEvent): boolean {
  if (e.isComposing) return false;
  if (sendKeyMode === "ctrl-enter") return (e.ctrlKey || e.metaKey) && !e.shiftKey;
  return !e.shiftKey && !e.ctrlKey && !e.metaKey;
}

/**
 * 输入框下方提示行文案:按当前发送快捷键给出可读的提示。
 * 注意用占位符而不是字符串拼接,便于各语言调整语序。
 */
function refreshComposerHint() {
  if (composerHintText) {
    composerHintText.textContent =
      sendKeyMode === "enter"
        ? t("Enter 发送 · Shift+Enter 换行")
        : sendKeyMode === "ctrl-enter"
          ? t("Ctrl+Enter 发送 · Enter 换行")
          : t("Shift+Enter 发送 · Enter 换行");
  }
  refreshSendKeyChip();
}


/** 切换发送快捷键:本地立即生效(输入框即时换行为准),同时写回 dsh.sendKey 设置。 */
function setSendKeyMode(mode: "enter" | "ctrl-enter" | "shift-enter") {
  sendKeyMode = mode;
  refreshComposerHint();
  vscode.postMessage({ kind: "setSendKey", sendKey: mode });
}

/** 输入框左下角的发送键胶囊:显示当前模式,点击切换;悬停说明下一种模式。 */
function refreshSendKeyChip() {
  if (!sendKeyChip) return;
  sendKeyChip.textContent = t(SEND_KEY_LABELS[sendKeyMode]);
  const next = SEND_KEY_ORDER[(SEND_KEY_ORDER.indexOf(sendKeyMode) + 1) % SEND_KEY_ORDER.length];
  sendKeyChip.title = t("当前:{current}。点击切换为「{next}」。", {
    current: t(SEND_KEY_DESCRIPTIONS[sendKeyMode]),
    next: t(SEND_KEY_LABELS[next]),
  });
  sendKeyChip.setAttribute("aria-label", sendKeyChip.title);
}

sendKeyChip.addEventListener("click", () => {
  const next = SEND_KEY_ORDER[(SEND_KEY_ORDER.indexOf(sendKeyMode) + 1) % SEND_KEY_ORDER.length];
  setSendKeyMode(next);
});

/**
 * 会话工作目录芯片(0.2.1 workingDirectory):只显示「当前生效」目录。
 * 与提示文本同排、位于右侧;未切换过目录时隐藏,避免和普通会话混淆。
 */
function renderWorkingDirectoryChip() {
  if (!cwdChip) return;
  const cwd = state.workingDirectory;
  if (typeof cwd !== "string" || cwd === "") {
    cwdChip.hidden = true;
    cwdChip.title = "";
    return;
  }
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  const label = parts.length > 0 ? parts[parts.length - 1] : cwd;
  cwdChipText.textContent = t("工作目录:{name}", { name: label });
  cwdChip.title = t("当前生效的工作目录:{path}\n点击在资源管理器中显示", { path: cwd });
  cwdChip.setAttribute("aria-label", cwdChip.title);
  cwdChip.hidden = false;
}

/**
 * 计划全文预览覆盖层(对齐网页端 PlanPreview:整页 Markdown、14px/1.75、可滚动)。
 * 卡片内只保留摘要滚动区,长计划在这里读更从容;Esc 或点遮罩关闭。
 */
function openPlanPreview() {
  const plan = state.planReview;
  if (!plan || !plan.text) {
    showToast(t("没有可显示的计划内容"), "warning");
    return;
  }
  const overlay = el("div", "plan-preview-overlay");
  const box = el("div", "plan-preview-box");
  const head = el("div", "plan-preview-head");
  head.append(lineIcon(ICONS.ledger, 15), el("span", "plan-preview-title", plan.title || t("计划预览")));
  const actions = el("div", "plan-preview-actions");
  if (typeof state.planFile === "string" && state.planFile) {
    const open = el("button", "btn", t("打开计划文件"));
    open.title = state.planFile;
    open.addEventListener("click", () => vscode.postMessage({ kind: "openFile", path: String(state.planFile) }));
    actions.append(open);
  }
  const closeBtn = el("button", "btn", t("关闭"));
  closeBtn.addEventListener("click", () => close());
  actions.append(closeBtn);
  head.append(actions);
  const body = el("div", "plan-preview-body");
  setHtml(body, plan.text);
  box.append(head, body);
  overlay.append(box);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    close();
  };
  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  document.addEventListener("keydown", onKey);
  document.body.append(overlay);
}

/**
 * 用 userQuestions 投影还原待答的限时提问卡片(0.2.x)。
 * 在线期间的卡片由 $events waterfall 帧实时建立(带 frameRpcId);投影负责「刷新页面 /
 * 切换会话之后」仍能看到待答提问 —— 此前这类提问一刷新就消失,只能等 Agent 自己继续。
 * 已有卡片(同一 callId)不覆盖,避免抢掉 waterfall 卡片上的倒计时状态。
 */
function applyUserQuestionsProjection() {
  const value = state.userQuestions;
  if (!value || !state.current) return;
  const known = new Set<string>();
  for (const question of state.questions.values()) {
    if (question.callId) known.add(question.callId);
  }
  let added = false;
  for (const entry of value.active ?? []) {
    if (!entry?.callId || known.has(entry.callId)) continue;
    // 计划审阅走单独卡片,投影里没有 intent 信息,只在有普通问题时还原
    const questions = (entry.questions ?? []).filter((q) => q && typeof q.id === "string");
    if (questions.length === 0) continue;
    state.questions.set(`proj:${entry.callId}`, {
      sessionId: state.current,
      frameRpcId: `proj:${entry.callId}`,
      questions,
      callId: entry.callId,
      // 投影不携带剩余等待时间:按「等待已到期、仍可作答」呈现(0.2.0 异步问答语义)
      remainingMs: null,
      fromProjection: true,
    });
    added = true;
  }
  if (added) renderPending();
}


// ---------- 渲染:消息 ----------

/**
 * 当前正在折叠的事件 seq:appendNode 用它给节点打上锚点(anchorSeq),
 * 供压缩检查点的 surface 替换按区间移除已折叠条目。事件之外创建的节点
 * (排队消息等)不设锚点,因而永远不会被移除。
 */
let currentEventSeq: number | undefined;

function appendNode(node: NodeState) {
  if (node.anchorSeq === undefined && currentEventSeq !== undefined) node.anchorSeq = currentEventSeq;
  node.el = renderNode(node);
  messages.appendChild(node.el);
  state.nodes.push(node);
  scrollToBottom();
}

/** 内联子节点(助手消息里的工具行)入列:同样打锚点,但不单独挂到消息容器。 */
function pushInlineNode(node: NodeState) {
  if (node.anchorSeq === undefined && currentEventSeq !== undefined) node.anchorSeq = currentEventSeq;
  state.nodes.push(node);
}

/**
 * 图片引用行(用户消息与工具结果共用):每个引用先占位,再向宿主请求内容
 * (session/attachment 取回 base64 后由 applyAttachmentData 原地替换)。
 */
function buildImageRow(node: NodeState): HTMLElement {
  const imgRow = el("div", "msg-images");
  for (const img of node.images ?? []) {
    const frame = el("div", "msg-image-frame");
    frame.dataset.attachmentId = img.attachmentId;
    frame.append(el("div", "msg-image-placeholder", "🖼️ …"));
    imgRow.append(frame);
    vscode.postMessage({ kind: "attachmentRead", attachmentId: img.attachmentId, messageId: node.key });
  }
  return imgRow;
}

// ---------- 失败提示卡(回合因上下文超限/模型报错结束时留在对话内) ----------

/**
 * 构建失败提示卡:图标 + 标题 + 正文 + 可选动作。
 * 与网页端的错误条目同语义 —— 回合失败的原因必须留在对话里,不能只闪一条
 * 浮动 toast(issue #19:超限时对话内没有任何提示)。
 */
function buildAlertCard(node: NodeState): HTMLElement {
  const wrap = el("div", `msg msg-alert ${node.tone === "error" ? "alert-error" : "alert-warn"}`);
  const head = el("div", "msg-alert-head");
  const icon = el("span", "msg-alert-icon");
  icon.append(lineIcon(ICONS.alert, 13));
  head.append(icon, el("span", "msg-alert-title", node.alertTitle ?? t("回合失败")));
  const body = el("div", "msg-alert-body", node.alertMessage ?? "");
  wrap.append(head, body);
  // 动作按钮只对实时回合开放:历史重放出来的卡片切换会话后不应再对着旧会话执行命令
  const live = node.live !== false && state.current !== null;
  if (live && node.actionCompact) {
    const actions = el("div", "msg-alert-actions");
    const compact = el("button", "msg-alert-action", t("压缩上下文"));
    compact.type = "button";
    compact.title = t("立即执行 /compact;压缩进度显示在对话中");
    compact.addEventListener("click", () => vscode.postMessage({ kind: "command", line: "/compact" }));
    actions.append(compact);
    if (node.actionModel) {
      const switchModel = el("button", "msg-alert-action", t("切换模型"));
      switchModel.type = "button";
      switchModel.title = t("打开模型列表,换用上下文窗口更大的模型");
      // 必须吞掉冒泡:文档级「点击弹层外部即关闭」的监听会看到 target 在模型胶囊之外,
      // 刚打开的模型列表会被立刻关掉
      switchModel.addEventListener("click", (e) => {
        e.stopPropagation();
        modelPillHead.click();
      });
      actions.append(switchModel);
    }
    wrap.append(actions);
  }
  return wrap;
}

// ---------- 命令行(压缩上下文等长任务命令:网页端 command/compaction 行同款) ----------

/**
 * 构建命令行节点(单行:图标 + 名称 + 圆点 + 摘要 + 展开箭头)。
 * 与网页端 CompactionItem / GenericCommandCard 结构一致:24px 行高、13px 摘要、
 * 可展开时正文另起一段;运行中由 CSS 扫光表示进度。
 */
function buildCommandRow(node: NodeState): HTMLElement {
  const wrap = el("div", "msg cmd-row");
  const btn = el("button", "cmd-row-btn") as HTMLButtonElement;
  btn.type = "button";
  const leading = el("span", "cmd-leading");
  const icon = el("span", "cmd-icon");
  icon.append(lineIcon(ICONS.database, 14));
  const chevron = el("span", "cmd-chevron");
  chevron.append(lineIcon(ICONS.chevronRight, 12));
  leading.append(icon, chevron);
  const title = el("span", "cmd-title", node.autoCompaction ? t("上下文已压缩") : (node.cmdName ?? t("命令")));
  const sep = el("span", "cmd-sep");
  const summary = el("span", "cmd-summary");
  btn.append(leading, title, sep, summary);
  const body = el("div", "cmd-body");
  body.hidden = true;
  wrap.append(btn, body);
  btn.addEventListener("click", () => {
    // 无摘要正文时行不可展开(与网页端 expandable = node.summary !== null 一致)
    if (!commandExpandable(node)) return;
    node.expanded = node.expanded !== true;
    updateCommandRow(node);
  });
  node.el = wrap;
  updateCommandRow(node);
  return wrap;
}

/** 是否有可展开的摘要正文。 */
function commandExpandable(node: NodeState): boolean {
  return typeof node.summaryText === "string" && node.summaryText.trim() !== "";
}

/** 摘要文本:运行中 → 已压缩条数/token → 命令结果 → 可展开提示(网页端回退链同款)。 */
function commandSummaryText(node: NodeState): string {
  if (node.cmdStatus === "running") return t("正在压缩上下文…");
  if (typeof node.shadowedItems === "number" && typeof node.shadowedTokens === "number") {
    return t("已压缩 {items} 条历史记录(约 {tokens} tokens)", {
      items: String(node.shadowedItems),
      tokens: String(node.shadowedTokens),
    });
  }
  if (node.outcomeText) return node.outcomeText;
  if (commandExpandable(node)) return t("点击展开压缩摘要");
  return t("压缩摘要不可用");
}

/** 就地刷新命令行状态/摘要/展开体(不重建节点,便于流式期间多次调用)。 */
function updateCommandRow(node: NodeState) {
  const root = node.el;
  if (!root) return;
  const status = node.cmdStatus ?? "running";
  root.dataset.state = status;
  root.dataset.expandable = commandExpandable(node) ? "true" : "false";
  const summary = root.querySelector(".cmd-summary");
  if (summary) summary.textContent = commandSummaryText(node);
  const btn = root.querySelector(".cmd-row-btn") as HTMLElement | null;
  if (btn) {
    const expanded = node.expanded === true && commandExpandable(node);
    btn.setAttribute("aria-expanded", String(expanded));
    btn.title = commandExpandable(node) ? t("点击展开压缩摘要") : "";
  }
  const body = root.querySelector(".cmd-body") as HTMLElement | null;
  if (body) {
    const expanded = node.expanded === true && commandExpandable(node);
    root.dataset.expanded = expanded ? "true" : "false";
    body.hidden = !expanded;
    if (expanded) setHtml(body, node.summaryText ?? "");
    else body.innerHTML = "";
  }
}

/** 按命令 id 定位命令行节点(command/run 创建、command/done 结算)。 */
function findCommandNode(commandId: string): NodeState | undefined {
  return state.nodes.find((n) => n.kind === "command" && n.commandId === commandId);
}

/** 按压缩事务 id 定位命令行节点(自动压缩没有命令 id,只能按 compactionId 关联)。 */
function findCompactionNode(compactionId: string): NodeState | undefined {
  return state.nodes.find((n) => n.kind === "command" && n.compactionId === compactionId);
}

/** 手动压缩命令名(宿主 /compact;网页端 COMPACT_PLUGIN 同款常量)。 */
const COMPACT_COMMAND = "compact";

/**
 * 识别压缩检查点(user/message,来源标记由 compact 事务提供)。
 * 该事件的正文是压缩摘要,渲染由命令行节点负责(网页端 compactSource 同款判定)。
 *
 * 来源标记随宿主版本变化,两种都要认:
 * - 当前:`{kind:"compact-checkpoint", compactionId, sourceCommandId?}`
 *   (dsh-compaction 的 COMPACT_CHECKPOINT_MARKER;MessageSourceMap 明确「没有共享的 plugin
 *   兜底类型」,因此旧写法匹配不到,压缩行会永远停在「正在压缩上下文…」);
 * - 旧版:`{kind:"plugin", plugin:"compact", compactionId, sourceCommandId?}`。
 */
function compactCheckpointSource(data: any): { compactionId?: string; sourceCommandId?: string } | undefined {
  const source = data?.source;
  if (!source || typeof source !== "object") return undefined;
  const isCheckpoint = source.kind === "compact-checkpoint" || (source.kind === "plugin" && source.plugin === COMPACT_COMMAND);
  if (!isCheckpoint) return undefined;
  return {
    ...(typeof source.compactionId === "string" ? { compactionId: source.compactionId } : {}),
    ...(typeof source.sourceCommandId === "string" ? { sourceCommandId: source.sourceCommandId } : {}),
  };
}

/**
 * 结束一条仍在「运行中」的压缩行(幂等)。
 * 正常路径由检查点事件收尾;该兜底用于宿主未送检查点(或检查点先于
 * compaction/start 到达)时,避免对话尾部永久留一条「正在压缩上下文…」。
 */
function finishCompactionRow(compactionId?: string, sourceCommandId?: string): boolean {
  const node =
    (sourceCommandId !== undefined ? findCommandNode(sourceCommandId) : undefined) ??
    (compactionId !== undefined && compactionId !== "" ? findCompactionNode(compactionId) : undefined);
  if (!node || node.cmdStatus !== "running") return false;
  node.cmdStatus = "done";
  updateCommandRow(node);
  return true;
}

/** 结束所有仍在运行中的压缩行(回合边界兜底)。 */
function finishRunningCompactionRows(): void {
  for (const node of state.nodes) {
    if (node.kind !== "command" || !node.autoCompaction) continue;
    if (node.cmdStatus !== "running") continue;
    node.cmdStatus = "done";
    updateCommandRow(node);
  }
}

/**
 * 应用 surface 替换(压缩检查点):移除已被折叠进摘要的历史条目,
 * 让对话里只剩一条压缩行 —— 与网页端 surface 语义一致。
 * 正在流式输出的助手节点永不移除(压缩只覆盖空闲/已结算区间)。
 */
function applySurfaceReplace(ev: { surfaceOp?: unknown }) {
  const op = ev.surfaceOp as { op?: string; startSeq?: number; endSeq?: number } | undefined;
  if (op?.op !== "replace") return;
  const start = op.startSeq;
  const end = op.endSeq;
  if (typeof start !== "number" || typeof end !== "number" || end < start) return;
  const live = state.streamBlock?.owner;
  const dropped = new Set<NodeState>();
  for (const node of [...state.nodes]) {
    if (node === live || dropped.has(node)) continue;
    const anchor = node.anchorSeq;
    if (typeof anchor !== "number" || anchor < start || anchor > end) continue;
    dropNode(node, dropped);
  }
  if (dropped.size > 0) state.turnStarts = state.turnStarts.filter((seq) => seq < start || seq > end);
}

// ---------- 回合失败:对话内提示(issue #19) ----------

/**
 * 最近一条 turn/end 的失败信息。
 * 事件循环在处理 assistant/message 等事件时才知道「刚结束的回合有没有报错」,
 * 而失败卡要在回合尾部落位,因此 turn/end 只记账,由 alertTurnFailure 出卡。
 */
let turnFailure:
  | { sessionId: string; turn?: number; kind: string; code?: string; message: string; at: number }
  | undefined;

/**
 * 当前正在折叠的事件所属会话。
 * 线协议的事件帧不带会话 id(历史重放尤其如此),而失败卡要判断"是不是当前会话
 * 的错误",所以在每个处理入口显式记账,缺省按当前选中会话判定。
 */
let eventsSessionId: string | undefined;

/** 上下文超限类失败:结构化 code 优先,老宿主/第三方提供方只有文本时按关键词兜底。 */
function isContextOverflowFailure(failure: { code?: string; message: string }): boolean {
  if (failure.code === "CONTEXT_WINDOW_EXCEEDED") return true;
  return /context[ _-]?(?:window|length|limit)|maximum context|too many tokens|prompt is too long|exceeds? the (?:maximum )?(?:context|token)|reduce the length/i.test(
    failure.message,
  );
}

/** 上下文类失败的可读文案:带上当前读数,便于判断该压缩还是换模型。 */
function contextOverflowAlertText(failure: { message: string }): string {
  const c = state.context;
  const used = typeof c?.projectedTokens === "number" ? c.projectedTokens : c?.pressureTokens;
  if (typeof used === "number" && typeof c?.contextWindow === "number" && c.contextWindow > 0) {
    return t("当前上下文约 {used} / {limit} tokens,已超出该模型的上下文窗口:{message}", {
      used: fmtCompactTokens(used),
      limit: fmtCompactTokens(c.contextWindow),
      message: failure.message,
    });
  }
  return t("当前上下文已超出该模型的上下文窗口:{message}", { message: failure.message });
}

/**
 * 追加一张上下文提示卡;同一回合内不重复叠卡(重复调用只刷新正文)。
 * 返回是否新建(供发送前守卫决定要不要再弹 toast)。
 */
function pushContextAlert(
  sessionId: string,
  turn: number | undefined,
  tone: "warn" | "error",
  title: string,
  message: string,
  options: { model?: boolean; live?: boolean } = {},
): boolean {
  const actionModel = options.model !== false;
  // 历史重放出来的卡片不给动作:它属于过去,点「压缩上下文」不该作用在当前会话上
  const live = options.live !== false;
  const key = `alert:turn:${turn ?? "?"}`;
  const prev = state.nodes[state.nodes.length - 1];
  if (prev && prev.kind === "alert" && prev.key === key) {
    prev.alertTitle = title;
    prev.alertMessage = message;
    prev.tone = tone;
    prev.actionCompact = true;
    prev.actionModel = actionModel;
    prev.live = live;
    prev.alertAt = Date.now();
    if (prev.el) {
      const titleEl = prev.el.querySelector(".msg-alert-title");
      const bodyEl = prev.el.querySelector(".msg-alert-body");
      if (titleEl) titleEl.textContent = title;
      if (bodyEl) bodyEl.textContent = message;
      prev.el.classList.toggle("alert-error", tone === "error");
      prev.el.classList.toggle("alert-warn", tone !== "error");
    }
    return false;
  }
  // 同一位置已有另一张提示卡(例如发送前的预警卡):被真实结果取代,不叠加
  // (重放时同样先入预警卡再入失败卡,所以这里无条件替换,与直播一致)
  if (prev && prev.kind === "alert") dropNode(prev);
  appendNode({
    kind: "alert",
    key,
    el: null,
    anchorSeq: currentEventSeq,
    alertAt: Date.now(),
    turn,
    tone,
    alertTitle: title,
    alertMessage: message,
    actionCompact: true,
    actionModel,
    live,
  });
  return true;
}

/** 粗略的 token 估算:代码/中文约每 2 字符 1 token(略保守,用于发送前预警)。 */
function estimateInputTokens(text: string): number {
  return Math.ceil(text.length / 2);
}

/**
 * 发送前上下文守卫(issue #19):按投影读数 + 本次输入估算下一个请求的规模,
 * 越过窗口 90% 时给出「压缩上下文」动作并落一张对话内卡片。
 * 不阻断发送 —— 宿主 compaction-basic 会在 80% 阈值自动压缩,拦下来反而挡住用户;
 * 这里的目标是"超限之前先把话说明白"。
 */
function warnIfContextTight(sessionId: string, text: string): void {
  const c = state.context;
  const used = typeof c?.projectedTokens === "number" ? c.projectedTokens : c?.pressureTokens;
  const limit = c?.contextWindow;
  if (typeof used !== "number" || typeof limit !== "number" || limit <= 0) return;
  const projected = used + estimateInputTokens(text);
  if (projected < limit * 0.9) return;
  const over = projected > limit;
  const message = over
    ? t("本次输入预计使上下文达到约 {used} / {limit} tokens,已超出该模型窗口;宿主会自动压缩或重试,若失败请手动压缩或换用更大窗口的模型。", {
        used: fmtCompactTokens(projected),
        limit: fmtCompactTokens(limit),
      })
    : t("本次输入预计使上下文达到约 {used} / {limit} tokens,接近该模型窗口上限;建议先压缩上下文再继续。", {
        used: fmtCompactTokens(projected),
        limit: fmtCompactTokens(limit),
      });
  const lastTurn = state.turnStarts.length > 0 ? Number(state.turnStarts[state.turnStarts.length - 1]) : undefined;
  const created = pushContextAlert(sessionId, lastTurn, over ? "error" : "warn", t("上下文接近上限"), message);
  // 卡片已存在时只刷新正文(同一回合反复发送不再刷 toast)
  if (!created) return;
  showToast(t("上下文接近模型上限,建议先压缩"), "warning", {
    label: t("压缩上下文"),
    onClick: () => vscode.postMessage({ kind: "command", line: "/compact" }),
  });
}

/**
 * 把刚结束的回合的失败落到对话里(上下文超限给「压缩上下文 / 切换模型」动作)。
 * 成功回合只清账不出卡;上下文类失败与发送前守卫共用同一张卡,不重复叠加。
 */
function alertTurnFailure(sessionId: string) {
  const failure = turnFailure;
  if (!failure || failure.sessionId !== sessionId) return;
  turnFailure = undefined;
  if (failure.kind !== "error" && failure.kind !== "max-tokens") return;
  if (isContextOverflowFailure(failure)) {
    pushContextAlert(sessionId, failure.turn, "error", t("上下文已超出模型窗口"), contextOverflowAlertText(failure), {
      live: !state.replaying,
    });
    return;
  }
  const maxTokens = failure.kind === "max-tokens";
  const key = `alert:turn:${failure.turn ?? "?"}`;
  const prev = state.nodes[state.nodes.length - 1];
  if (prev && prev.kind === "alert" && prev.key === key) {
    // 同一回合重复上报(api-session/error 与 turn/end 常常成对到达):短时间内不叠卡
    if (prev.alertAt !== undefined && Date.now() - prev.alertAt < 15000) return;
    dropNode(prev);
  } else if (prev && prev.kind === "alert") {
    // 发送前的预警卡被这次真实失败取代
    dropNode(prev);
  }
  appendNode({
    kind: "alert",
    key,
    el: null,
    anchorSeq: currentEventSeq,
    alertAt: Date.now(),
    turn: failure.turn,
    tone: "warn",
    live: !state.replaying,
    alertTitle: maxTokens ? t("已达模型输出上限") : t("回合失败"),
    alertMessage: maxTokens
      ? t("模型在本回合达到最大输出 token 数,回答可能被截断;可让它继续,或改用更小的任务重试。")
      : t("{code}: {message}", { code: failure.code ?? "UNKNOWN", message: failure.message }),
  });
}

/** 移除节点(含其内联工具行)并从渲染列表摘除。 */
function dropNode(node: NodeState, dropped = new Set<NodeState>()) {
  if (dropped.has(node)) return;
  dropped.add(node);
  for (const child of node.tools ?? []) dropNode(child, dropped);
  node.el?.remove();
  const idx = state.nodes.indexOf(node);
  if (idx >= 0) state.nodes.splice(idx, 1);
}

function renderNode(node: NodeState): HTMLElement {
  switch (node.kind) {
    case "command": {
      return buildCommandRow(node);
    }
    case "alert": {
      return buildAlertCard(node);
    }
    case "user": {
      const wrap = el("div", "msg msg-user");
      const body = el("div", "msg-body");
      setHtml(body, node.text ?? "");
      wrap.append(body);
      if (node.images && node.images.length > 0) wrap.append(buildImageRow(node));
      return wrap;
    }
    case "note": {
      const wrap = el("div", "msg msg-note");
      // 空文本的 note 不渲染成空框:以前会留下一条居中的虚线段(用户反馈的「短圆点虚线」)
      if ((node.text ?? "").trim() === "") {
        wrap.hidden = true;
        return wrap;
      }
      if (node.cmd) {
        // 斜杠命令执行记录:右边对齐的「用户动作」小胶囊(不是系统提示,不该居中)
        wrap.classList.add("msg-cmd");
        const body = el("div", "msg-body cmd-note");
        setHtml(body, node.text ?? "");
        wrap.append(body);
        return wrap;
      }
      // 系统提示词卡片:图标 + 标题 + 注入标签 + 右侧折叠箭头,正文默认收起、可滚动
      wrap.classList.add("system-note");
      const details = el("details", "system-note-details");
      const summary = el("summary", "system-note-summary");
      summary.append(lineIcon(ICONS.info, 13));
      summary.append(el("span", "system-note-title", t("系统提示词")));
      summary.append(el("span", "system-note-tag", t("已注入模型 · 点击展开")));
      details.append(summary);
      const body = el("div", "msg-body system-note-body");
      setHtml(body, node.text ?? "");
      details.append(body);
      wrap.append(details);
      return wrap;
    }
    case "attach": {
      // 附件上下文卡片:独立于用户气泡,紧贴在用户消息之前,默认折叠
      const wrap = el("div", "msg attach-card");
      const details = el("details", "attach-context-details");
      details.append(el("summary", "attach-context-summary", t("📎 附件上下文(已注入模型,点击展开)")));
      const body = el("div", "msg-body attach-context-body");
      setHtml(body, node.text ?? "");
      details.append(body);
      wrap.append(details);
      return wrap;
    }
    case "turn-divider": {
      // 回合边界:上一回合与本回合之间的水平分隔线,中间是「还原检查点」按钮
      // (GitHub Copilot 同款交互)。点击**只撤销本回合自身产生的文件改动**
      // (反向应用 回合开始→回合结束 的差异),你手动改的文件、其他回合的
      // 改动以及你自己的提交与 HEAD 都完全不受影响 —— 与 Copilot 检查点语义一致。
      const wrap = el("div", "fork-divider");
      const line = el("div", "fork-divider-line");
      const btn = el("button", "fork-divider-btn", t("还原检查点"));
      btn.title = t("仅撤销本回合产生的文件改动;你自己的提交与 HEAD 不受影响");
      btn.addEventListener("click", () => {
        if (typeof node.turn === "number" && node.turn > 0) openRollbackUndo(node.turn);
      });
      line.append(btn);
      wrap.append(line);
      return wrap;
    }
    case "queued": {
      const wrap = el("div", "msg msg-queued");
      // 空排队项(内容被清空/只有空文本)同样不画空框,避免残留下一条虚线
      if ((node.text ?? "").trim() === "" && (node.images?.length ?? 0) === 0) {
        wrap.hidden = true;
        return wrap;
      }
      const head = el("div", "msg-queued-head");
      head.append(el("span", "msg-queued-badge", t("⏳ 排队中(运行结束后自动发送)")));
      const actions = el("span", "msg-queued-actions");
      const itemId = node.key.startsWith("q:") ? node.key.slice(2) : "";
      const mkBtn = (label: string, fn: () => void) => {
        const b = el("button", "mini-btn", label);
        b.addEventListener("click", fn);
        actions.append(b);
      };
      mkBtn(t("编辑"), () => {
        void showDialog({
        title: t("编辑排队消息"),
        text: `${t("修改后立即生效")} · ${t("Shift/Ctrl+Enter 确认 · Esc 取消")}`,
        input: true,
        multiline: true,
        value: node.text ?? "",
      }).then((v) => {
          if (v && itemId && state.current) {
            vscode.postMessage({ kind: "updateQueue", sessionId: state.current, itemId, action: { kind: "edit", content: [{ type: "text", text: v }] } });
          }
        });
      });
      // 插队(steer)仅在 agent 运行中的回合可用 —— 与网页端 disabled: !running 一致。
      // 会话空闲(回合已结束/取消/出错后仍有排队项)时禁用并给出解释;
      // running 状态变化时由 updateRunning() → refreshSteerButtons() 就地刷新
      const steerBtn = el("button", "mini-btn", t("插队"));
      steerBtn.dataset.steer = itemId;
      steerBtn.addEventListener("click", () => {
        if (state.running && itemId && state.current) vscode.postMessage({ kind: "updateQueue", sessionId: state.current, itemId, action: { kind: "steer" } });
      });
      if (!state.running) {
        steerBtn.disabled = true;
        steerBtn.classList.add("mini-btn-disabled");
        steerBtn.title = t("当前回合已结束,无法插队;消息将在下一轮自动处理");
      }
      actions.append(steerBtn);
      mkBtn(t("移除"), () => {
        if (itemId && state.current) vscode.postMessage({ kind: "updateQueue", sessionId: state.current, itemId, action: { kind: "remove" } });
      });
      head.append(actions);
      wrap.append(head);
      const body = el("div", "msg-body");
      setHtml(body, node.text ?? "");
      wrap.append(body);
      return wrap;
    }
    case "assistant": {
      const wrap = el("div", "msg msg-assistant");
      const role = el("div", "msg-role", state.models?.current?.model ?? "DeepSeek");
      node.roleEl = role;
      const blocks = renderAssistantBlocks(node);
      // 产物卡容器:位于回答内容与操作条(复制/分支/点赞)之间 —— 与网页端回合尾链一致
      const filesBox = el("div", "msg-files");
      filesBox.hidden = true;
      node.filesEl = filesBox;
      const actions = el("div", "msg-actions");
      node.actionsEl = actions;
      wrap.append(role, blocks, filesBox, actions);
      renderNodeFiles(node);
      return wrap;
    }
    case "tool": {
      // 工具行(网页端 ToolRow 同款):图标 + 标题 + · + 一行摘要 + 状态,点击展开参数/结果
      const wrap = el("details", "msg step-row step-tool" + (node.done ? (node.failed ? " tool-failed" : " tool-done") : " tool-running"));
      wrap.dataset.tool = node.name ?? "";
      const summary = el("summary", "step-line");
      const nameSpan = el("span", "step-name");
      const icon = el("span", "step-icon");
      icon.append(lineIcon(toolIconPaths(node.name), 14));
      nameSpan.append(icon, el("span", "step-title", toolTitle(node.name)));
      summary.append(nameSpan, el("span", "step-sep"));
      summary.append(el("span", "step-summary", toolSummary(node.name, node.args)));
      summary.append(el("span", "step-status" + (node.done ? (node.failed ? " step-status-failed" : " step-status-done") : " step-status-running"), node.done ? (node.failed ? "✗" : "✓") : "…"));
      const chevron = el("span", "step-chevron");
      chevron.append(lineIcon(ICONS.down2, 12));
      summary.append(chevron);
      const body = el("div", "step-body");
      const argsLabel = el("div", "tool-label", t("参数"));
      const argsPre = el("pre", "tool-pre", node.args ?? "");
      body.append(argsLabel, argsPre);
      if (node.result !== undefined) {
        body.append(el("div", "tool-label", t("结果")), el("pre", "tool-pre", node.result));
      }
      // 0.1.5:工具结果里的图片(read_image 等)直接渲染,不再只显示文本
      if (node.images && node.images.length > 0) body.append(buildImageRow(node));
      wrap.append(summary, body);
      return wrap;
    }
    case "files": {
      return buildFilesCard(node.files ?? []);
    }
  }
}

/**
 * 产物文件列表框(网页端 ProducedFiles 同款:最多 6 条,余量折叠 +N;点击在 VS Code 打开)。
 * issue #21 第 10 条:默认折叠为一行摘要(文件名 + ＋N),避免多轮对话被上一轮的产物卡片占满;
 * 由 dsh.autoCollapseProducedFiles 控制,展开状态在本次渲染内保持。
 */
function buildFilesCard(files: string[]): HTMLElement {
  const wrap = el("details", "files-card" + (autoCollapseProducedFiles ? " files-card-collapsed" : "")) as HTMLDetailsElement;
  if (!autoCollapseProducedFiles) wrap.open = true;
  const head = el("summary", "files-card-head");
  head.append(lineIcon(ICONS.box, 13), el("span", "files-card-title", t("产物 ({n})", { n: String(files.length) })));
  // 折叠时用文件名做摘要(最多 3 个,余量以 ＋N 表示),展开后摘要隐藏
  const names = files.map((p) => basename(p));
  const preview = el("span", "files-card-preview", `${names.slice(0, 3).join(" · ")}${names.length > 3 ? ` ＋${names.length - 3}` : ""}`);
  preview.title = files.join("\n");
  head.append(preview);
  const revealAll = el("button", "files-card-reveal", t("在文件夹中显示"));
  revealAll.title = t("在系统资源管理器中显示产物目录");
  const firstDir = files.length ? parentDir(files[0]) : undefined;
  revealAll.addEventListener("click", (e) => {
    e.stopPropagation();
    if (firstDir) vscode.postMessage({ kind: "revealInExplorer", path: firstDir });
  });
  head.append(revealAll);
  wrap.append(head);

  const MAX = 6;
  const rows = el("div", "files-card-rows");
  const renderRows = (list: string[]) => {
    rows.innerHTML = "";
    for (const path of list) {
      const row = el("button", "files-card-row");
      row.append(lineIcon(ICONS.copy, 12));
      const main = el("span", "files-card-main");
      main.append(el("span", "files-card-name", basename(path)));
      const dir = parentDir(path);
      if (dir) {
        const sub = el("span", "files-card-sub");
        sub.textContent = dir;
        sub.title = path;
        main.append(sub);
      }
      row.append(main);
      const reveal = el("button", "files-card-reveal-btn", "📁");
      reveal.title = t("在资源管理器中显示");
      reveal.addEventListener("click", (e) => {
        e.stopPropagation();
        vscode.postMessage({ kind: "revealInExplorer", path });
      });
      row.append(reveal);
      row.title = path;
      row.addEventListener("click", () => vscode.postMessage({ kind: "openFile", path }));
      rows.append(row);
    }
  };
  renderRows(files.slice(0, MAX));
  wrap.append(rows);
  if (files.length > MAX) {
    let expanded = false;
    const more = el("button", "files-card-more", t("＋ 其余 {n} 个文件", { n: String(files.length - MAX) }));
    more.addEventListener("click", () => {
      expanded = !expanded;
      renderRows(expanded ? files : files.slice(0, MAX));
      more.textContent = expanded ? t("收起") : t("＋ 其余 {n} 个文件", { n: String(files.length - MAX) });
    });
    wrap.append(more);
  }
  return wrap;
}

/** 把本轮产物渲染进助手消息的产物容器(位于操作条之前);交付卡在产物列表上方。 */
function renderNodeFiles(node: NodeState) {
  if (!node.filesEl) return;
  node.filesEl.innerHTML = "";
  const presented = node.presented ?? [];
  const files = node.deliverables ?? [];
  node.filesEl.hidden = presented.length === 0 && files.length === 0;
  if (presented.length > 0) {
    const grid = el("div", "deliverable-grid");
    for (const file of presented) grid.append(buildPresentedCard(file));
    node.filesEl.append(grid);
  }
  if (files.length > 0) node.filesEl.append(buildFilesCard(files));
}

/** 解析 present 工具调用参数:{ files: [{ path, description? }] }(参数可能仍在流式拼装,解析失败即忽略)。 */
function parsePresentedFiles(rawArgs: unknown): { path: string; description?: string }[] {
  if (typeof rawArgs !== "string" || !rawArgs.trim()) return [];
  try {
    const args = JSON.parse(rawArgs) as { files?: unknown };
    if (!Array.isArray(args?.files)) return [];
    return args.files
      .map((item) => (item && typeof item === "object" ? (item as { path?: unknown; description?: unknown }) : undefined))
      .filter((item): item is { path: string; description?: string } => typeof item?.path === "string" && item.path.length > 0)
      .map((item) => ({ path: item.path, description: typeof item.description === "string" ? item.description : undefined }));
  } catch {
    return [];
  }
}

/** 交付文件卡(网页端 PresentedFileCard 同款:文件图标 + 名称 + 描述 + 打开/更多)。 */
function buildPresentedCard(file: { path: string; description?: string }): HTMLElement {
  const card = el("div", "deliverable-card");
  const name = basename(file.path);
  const ext = name.includes(".") ? name.split(".").pop()!.toUpperCase() : "";
  const icon = el("span", "deliverable-icon");
  icon.append(lineIcon(ICONS.copy, 16));
  const body = el("div", "deliverable-body");
  body.append(el("div", "deliverable-name", name));
  body.append(el("div", "deliverable-desc", (file.description ?? "").trim() || ext || t("文件")));
  const split = el("div", "deliverable-split");
  const open = el("button", "deliverable-open", t("打开"));
  open.type = "button";
  open.title = file.path;
  open.addEventListener("click", (e) => {
    e.stopPropagation();
    vscode.postMessage({ kind: "openFile", path: file.path });
  });
  const more = el("button", "deliverable-more");
  more.type = "button";
  more.title = t("更多操作");
  more.append(lineIcon(ICONS.down2, 11));
  more.addEventListener("click", (e) => {
    e.stopPropagation();
    openAnchoredMenu(more, (menu) => {
      const add = (iconPaths: string, label: string, action: () => void) => {
        const row = el("button", "plus-menu-item");
        row.append(lineIcon(iconPaths), el("span", "menu-item-label", label));
        row.addEventListener("click", () => {
          closeActivePopover();
          action();
        });
        menu.append(row);
      };
      add(ICONS.rightUp, t("用默认应用打开"), () => vscode.postMessage({ kind: "openInDefaultApp", path: file.path }));
      add(ICONS.folder, t("在资源管理器中显示"), () => vscode.postMessage({ kind: "revealInExplorer", path: file.path }));
    });
  });
  split.append(open, more);
  card.append(icon, body, split);
  return card;
}

function findAssistantTail(): NodeState | undefined {
  for (let i = state.nodes.length - 1; i >= 0; i--) {
    if (state.nodes[i].kind === "assistant") return state.nodes[i];
  }
  return undefined;
}

/**
 * 消费一次模型流增量。
 * 两个来源共用这条路径:0.1.2 的 `assistant/chunk` 会话事件,以及 0.1.5 的
 * assistant-stream 瞬态帧(宿主已在 sessionStore 里翻译为同构的 data)。
 */
function applyAssistantChunk(data: any, timeMs: number) {
  const chunk = data?.chunk ?? {};
  const turn = typeof data?.turn === "number" ? data.turn : undefined;
  switch (chunk.type) {
    case "block-start":
      beginAssistantBlock(data?.turn ?? 0, data?.step ?? 0, chunk.index ?? 0, chunk.blockType ?? "text", timeMs);
      // 输入框上方活动指示:推理 → 深度思考中…,文本 → 生成回答…
      if (state.running && turnStatus.hidden) startTurnStatus(timeMs);
      setTurnStatusActivity(chunk.blockType === "reasoning" || chunk.blockType === "text" ? chunk.blockType : "reasoning");
      break;
    case "text-delta":
    case "reasoning-delta": {
      // 解码窗口:首个增量(TTFT 基准)与末个增量(输出速度基准)
      if (turn !== undefined) {
        if (!state.turnFirstTokenMs.has(turn)) state.turnFirstTokenMs.set(turn, timeMs);
        state.turnLastDeltaMs.set(turn, timeMs);
      }
      appendToStream(chunk.type === "reasoning-delta" ? "reasoning" : "text", chunk.text ?? "");
      break;
    }
    default:
      break;
  }
}

function beginAssistantBlock(turn: number, step: number, index: number, blockType: string, startTime?: number) {
  state.streamBlock = null;
  state.streamKey = null;
  // 网页版布局:一个回合一个 assistant 节点,各步骤的文本块追加到同一节点
  let assistant = findAssistantTail();
  if (!assistant || assistant.turn !== turn) {
    assistant = { kind: "assistant", key: `a:${turn}:${state.nodes.length}`, el: null, blocks: [], turn };
    appendNode(assistant);
  }
  // 思考耗时:推理块开始 → 首个文本块开始
  if (blockType === "reasoning") {
    if (assistant.reasoningStartMs === undefined) assistant.reasoningStartMs = startTime;
  } else if (assistant.reasoningStartMs !== undefined && assistant.reasoningMs === undefined && startTime !== undefined) {
    assistant.reasoningMs = Math.max(0, startTime - assistant.reasoningStartMs);
  }
  state.currentStreamTurn = turn;
  const block: BlockState = { type: blockType === "reasoning" ? "reasoning" : "text", text: "", el: null, owner: assistant };
  assistant.blocks!.push(block);
  state.streamedBlockKeys.add(`${turn}:${step}:${index}`);
  // 按 (turn:step) 登记流式块:结算时用 message content 的权威文本原位覆盖,
  // 避免"流式文本 + 结算文本"两份重复渲染
  const stepKey = `${turn}:${step}`;
  let bucket = state.streamedBlocks.get(stepKey);
  if (!bucket) state.streamedBlocks.set(stepKey, (bucket = new Map()));
  bucket.set(index, block);
  // 先把 streamBlock 指向新块再渲染:推理块开始时 detail 默认展开(思考中),文本块开始后自动收起
  state.streamBlock = block;
  refreshAssistantNode(assistant, block);
}

/** 渲染助手内容:推理/文本块与内联工具行按执行顺序交错(Think → 工具 → Think → 答案)。 */
function renderAssistantBlocks(assistant: NodeState): HTMLElement {
  const container = el("div", "msg-blocks");
  const tools = assistant.tools ?? [];
  /**
   * 过程行(思考 / 工具)按"连续段"包进一个 .step-group:整段只画一条左侧细导轨,
   * 与网页端一致;正文块会打断分组,因此不会出现每行一小截的碎线。
   * 每个连续段末尾追加一行汇总(网页端「执行了命令,已读取文件,修改了文件等」
   * 同款语义):一眼看出这一段都做了什么,点击可折叠/展开该段。
   */
  let group: HTMLElement | null = null;
  let groupStart = -1;
  const groups: { start: number; el: HTMLElement }[] = [];
  const summaryRows: GroupSummaryRow[] = [];
  const openGroup = (start: number): HTMLElement => {
    if (!group) {
      group = el("div", "step-group");
      groupStart = start;
      container.append(group);
      groups.push({ start, el: group });
    }
    return group;
  };
  const closeGroup = () => {
    group = null;
    groupStart = -1;
  };
  const appendToolsAfter = (index: number) => {
    for (const t of tools) {
      if ((t.afterBlock ?? -1) !== index) continue;
      if (!t.el) t.el = renderNode(t);
      openGroup(index).append(t.el);
    }
  };
  appendToolsAfter(-1);
  let seenReasoning = false;
  (assistant.blocks ?? []).forEach((block, index) => {
    // 空的推理/文本块不渲染占位(如中断的流式块):避免出现「思考过程」点开却没有任何内容。
    // 注意:流式块首个增量到达时 appendToStream 会强制整块重绘,所以跳过空块不会漏掉正在生成的内容。
    if (typeof block.text !== "string" || block.text.trim() === "") return;
    if (block.type === "reasoning") {
      const first = !seenReasoning;
      seenReasoning = true;
      // 网页端 ThinkingRow 同款:一行「思考 · <首行预览>」,点击展开完整思考;
      // 思考进行中默认展开(让用户看到最新思考过程),思考结束(下一个块开始/回合结束)后自动收起;
      // 用户手动开合过的块尊重用户选择。
      const details = el("details", "step-row step-think");
      details.open = block.userOpen ?? (block === state.streamBlock && state.running);
      const summary = el("summary", "step-line");
      const icon = el("span", "step-icon");
      icon.append(lineIcon(ICONS.sparkle, 14));
      const title = el("span", "step-title", t("思考"));
      const preview = el("span", "step-summary", reasoningPreview(block.text));
      block.previewEl = preview;
      // 与工具行一致:图标 + 标题包在 .step-name(flex:none)里,
      // 否则标题作为 .step-line 的直接子项会被长摘要压缩成一个字(「思」)
      const nameSpan = el("span", "step-name");
      nameSpan.append(icon, title);
      summary.append(nameSpan, el("span", "step-sep"), preview);
      if (first && assistant.reasoningMs !== undefined) {
        summary.append(el("span", "step-suffix", fmtDuration(assistant.reasoningMs)));
      }
      const chevron = el("span", "step-chevron");
      chevron.append(lineIcon(ICONS.down2, 12));
      summary.append(chevron);
      // 只记录"用户意图":summary 的点击在默认动作之前触发,此时 details.open 仍是旧值
      summary.addEventListener("click", () => {
        block.userOpen = !details.open;
      });
      details.append(summary);
      const body = el("div", "step-body");
      setHtml(body, block.text);
      block.el = body;
      details.append(body);
      openGroup(index).append(details);
    } else {
      closeGroup();
      const bwrap = el("div", "block");
      const body = el("div", "block-body");
      setHtml(body, block.text);
      block.el = body;
      bwrap.append(body);
      container.append(bwrap);
    }
    appendToolsAfter(index);
  });
  // 段尾汇总行:按分段边界把过程行分组,每组末尾插一行「执行了命令…」并可折叠该段
  const toolIndices = new Set<number>();
  for (const t of tools) toolIndices.add(t.afterBlock ?? -1);
  const allStarts = [...new Set([...groups.map((g) => g.start), ...toolIndices])].sort((a, b) => a - b);
  const endOf = (start: number): number => {
    const i = allStarts.indexOf(start);
    return i >= 0 && i + 1 < allStarts.length ? allStarts[i + 1] : Number.MAX_SAFE_INTEGER;
  };
  for (const entry of groups) {
    // 只有真正执行过工具的段才显示汇总行(纯思考段不出现「暂无工具调用」噪声)
    if (summarizeGroup(assistant, entry.start, endOf(entry.start)).length === 0) continue;
    const row = buildGroupSummary(assistant, entry.start, endOf(entry.start), entry.el);
    entry.el.append(row);
    summaryRows.push(row);
    if (assistant.groupCollapsed?.has(entry.start) === true) row.__applyCollapsed?.(true);
  }
  assistant.groupEls = groups;
  assistant.groupSummaries = summaryRows;
  return container;
}

/** 段尾汇总行的可更新部件。 */
interface GroupSummaryRow extends HTMLButtonElement {
  /** 刷新动作清单文本(工具执行完成后调用)。 */
  __refresh?: () => void;
  /** 应用折叠态(true = 收起本段过程行),重绘后恢复用户选择。 */
  __applyCollapsed?: (collapsed: boolean) => void;
}

/** 过程段分组的边界:段落起点 index(afterBlock)与结束 index(不含)。 */
function groupRanges(assistant: NodeState): { start: number; end: number }[] {
  const tools = assistant.tools ?? [];
  const indices = new Set<number>();
  for (const t of tools) indices.add(t.afterBlock ?? -1);
  for (let i = -1; i < (assistant.blocks?.length ?? 0); i++) {
    const block = assistant.blocks?.[i];
    const text = typeof block?.text === "string" ? block.text : "";
    if (block !== undefined && text.trim() !== "") indices.add(i);
  }
  const sorted = [...indices].sort((a, b) => a - b);
  return sorted.map((start, i) => ({ start, end: i + 1 < sorted.length ? sorted[i + 1] : Number.MAX_SAFE_INTEGER }));
}

/**
 * 一段连续过程行的动作汇总(网页端「执行了命令,已读取文件,修改了文件等」同款语义):
 * 按工具类别计数,只列非零项。
 */
function summarizeGroup(assistant: NodeState, start: number, end: number): string[] {
  const counts = { command: 0, read: 0, write: 0, edit: 0, search: 0, web: 0, other: 0 };
  for (const tool of assistant.tools ?? []) {
    const after = tool.afterBlock ?? -1;
    const inGroup = after === start || (after > start && after < end);
    if (!inGroup) continue;
    const n = (tool.name ?? "").toLowerCase();
    if (n.includes("bash") || n.includes("pwsh") || n.includes("powershell") || n.includes("shell") || n.includes("code_runtime")) counts.command++;
    else if (n.includes("read")) counts.read++;
    else if (n.includes("write")) counts.write++;
    else if (n.includes("edit") || n.includes("str_replace")) counts.edit++;
    else if (n.includes("grep") || n.includes("glob") || n.includes("search")) counts.search++;
    else if (n.includes("web_fetch") || n.includes("web_search")) counts.web++;
    else counts.other++;
  }
  const parts: string[] = [];
  const push = (n: number, key: string) => {
    if (n > 0) parts.push(t(key, { n: String(n) }));
  };
  push(counts.command, "执行了 {n} 条命令");
  push(counts.read, "读取了 {n} 个文件");
  push(counts.write + counts.edit, "修改了 {n} 个文件");
  push(counts.search, "搜索了 {n} 次");
  push(counts.web, "访问了 {n} 个网页");
  push(counts.other, "调用了 {n} 个工具");
  return parts;
}

/** 段尾汇总行:图标 + 动作清单 + 折叠箭头,点击折叠/展开本段(与网页端过程段同款)。 */
function buildGroupSummary(assistant: NodeState, start: number, end: number, groupEl: HTMLElement): GroupSummaryRow {
  const row = el("button", "step-group-summary") as GroupSummaryRow;
  row.type = "button";
  const icon = el("span", "step-group-icon");
  icon.append(lineIcon(ICONS.checklist, 13));
  row.append(icon);
  const text = el("span", "step-group-text");
  row.append(text);
  const chevron = el("span", "step-group-chevron");
  chevron.append(lineIcon(ICONS.up2, 12));
  row.append(chevron);
  row.title = t("展开 / 收起这一段过程");
  const refresh = () => {
    const parts = summarizeGroup(assistant, start, end);
    text.textContent = parts.length > 0 ? parts.join(t("、")) : t("暂无工具调用");
  };
  refresh();
  row.__refresh = refresh;
  let collapsed = false;
  const applyCollapsed = (next: boolean) => {
    collapsed = next;
    for (const child of [...groupEl.children]) {
      if (child === row) continue;
      (child as HTMLElement).hidden = collapsed;
    }
    row.classList.toggle("step-group-collapsed", collapsed);
    chevron.innerHTML = "";
    chevron.append(lineIcon(collapsed ? ICONS.down2 : ICONS.up2, 12));
  };
  row.__applyCollapsed = applyCollapsed;
  row.addEventListener("click", () => {
    applyCollapsed(!collapsed);
    // 记住用户选择:整块重绘(流式/工具结果)后仍保持收起
    assistant.groupCollapsed ??= new Set<number>();
    if (collapsed) assistant.groupCollapsed.add(start);
    else assistant.groupCollapsed.delete(start);
  });
  return row;
}

/** 工具结果落地后刷新本回合各过程段的动作清单(不整块重绘,避免打断展开态)。 */
function refreshGroupSummaries(assistant: NodeState | undefined) {
  for (const row of assistant?.groupSummaries ?? []) row.__refresh?.();
}

/** 思考预览:取首个非空行,压缩空白并截断(网页端 Think 行的一行摘要同款)。 */
function reasoningPreview(text: string): string {
  const line = text
    .split("\n")
    .map((item) => item.replace(/^[#>*\-\s]+/, "").trim())
    .find((item) => item !== "");
  if (!line) return "";
  return line.length > 120 ? `${line.slice(0, 120)}…` : line;
}

/**
 * 回合尾操作条(复制/分支/点赞 + 用量/用时/时间)的显示策略,与网页端一致:
 * - 会话空闲:最新回合始终显示;
 * - 会话运行中:历史回合默认隐藏,仅在 hover / 获得焦点时淡入 —— 避免"还在思考就出现操作栏与用量"。
 */
function refreshActionsReveal() {
  const latest = [...state.nodes].reverse().find((n) => n.kind === "assistant" && typeof n.turn === "number");
  for (const node of state.nodes) {
    if (node.kind !== "assistant" || !node.el) continue;
    node.el.dataset.actionsReveal = node === latest && !state.running ? "always" : "hover";
  }
}

function refreshAssistantNode(assistant: NodeState, activeBlock?: BlockState, force = false) {
  if (!assistant.el || !assistant.blocks) return;
  // 重放历史时跳过中间渲染(block-start),仅在 assistant/message(force)时一次性渲染最终内容
  if (state.replaying && !force) return;
  const old = assistant.el.querySelector(".msg-blocks") as HTMLElement;
  if (old) old.replaceWith(renderAssistantBlocks(assistant));
  void activeBlock; // 块渲染时 block.el 已指向新 DOM,无需二次查找
  scrollToBottom();
}

function appendToStream(blockType: string, text: string) {
  const block = state.streamBlock;
  if (!block) return;
  if ((block.type === "reasoning") !== (blockType === "reasoning")) return;
  const wasEmpty = block.text === "";
  block.text += text;
  if (state.replaying) return; // 重放期间仅累积文本,最终由 assistant/message 一次性渲染
  // 块起始时正文为空,renderAssistantBlocks 会跳过空块(block.el 为 null):
  // 首个增量到达时整块重绘一次,「思考过程」当场出现并默认展开;后续增量走增量更新
  if (!block.el && wasEmpty && block.text.trim() !== "" && block.owner) {
    refreshAssistantNode(block.owner, block, true);
  }
  if (block.el) setHtml(block.el, block.text);
  // 思考行的一行摘要在流式期间同步刷新,避免预览停留在最初几个 token
  if (block.previewEl) block.previewEl.textContent = reasoningPreview(block.text);
  scrollToBottom();
}

function findToolNode(callId: string): NodeState | undefined {
  for (let i = state.nodes.length - 1; i >= 0; i--) {
    const node = state.nodes[i];
    if (node.kind === "tool" && node.callId === callId) return node;
  }
  return undefined;
}

function updateToolSummary(node: NodeState) {
  if (!node.el) return;
  // 标题(工具名 → 本地化标题)
  const title = node.el.querySelector(".step-title");
  if (title) title.textContent = toolTitle(node.name);
  // 一行摘要:用人类可读字段(路径 / 命令 / 查询串)而不是整段 JSON
  const summary = node.el.querySelector(".step-summary");
  if (summary) summary.textContent = toolSummary(node.name, node.args);
  // 状态
  const status = node.el.querySelector(".step-status");
  if (status) {
    status.textContent = node.done ? (node.failed ? "✗" : "✓") : "…";
    status.className = "step-status" + (node.done ? (node.failed ? " step-status-failed" : " step-status-done") : " step-status-running");
  }
}

/** 弹出菜单在消息滚动区内向下溢出时向上翻转(靠近底部的消息);测量失败绝不影响弹窗本身。 */
function flipPopoverUp(pop: HTMLElement) {
  try {
    const container = messages.getBoundingClientRect();
    const rect = pop.getBoundingClientRect();
    if (rect.bottom > container.bottom - 8 && rect.height < container.height) {
      pop.classList.add("popover-up");
    }
  } catch {
    // 忽略:保持默认向下展开
  }
}

// ---------- 消息操作条(复制 / ↪分支回退 / 点赞 / 点踩 / 产物) ----------

function renderActions(node: NodeState) {
  if (!node.actionsEl) return;
  // 回合未结束(消息仍在流式输出/被修改)时不渲染操作条:
  // 避免对话进行中用户误点分支/回退/点赞等操作(与网页端一致,仅回合结束后显示)
  if (state.running && node.turn !== undefined && node.turn === state.currentStreamTurn) {
    node.actionsEl.innerHTML = "";
    return;
  }
  // 会话仍在运行时,任何历史回合的操作条都只在这一条消息被 hover 时淡入(网页端 data-actions-reveal=hover 同款)
  if (state.running && node.el) {
    node.el.dataset.actionsReveal = "hover";
  }
  node.actionsEl.innerHTML = "";

  const actionBtn = (iconPaths: string, title: string, onClick: () => void): HTMLButtonElement => {
    const b = el("button", "msg-action-btn");
    b.title = title;
    b.append(lineIcon(iconPaths));
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    node.actionsEl!.append(b);
    return b;
  };

  // 复制
  actionBtn(ICONS.copy, t("复制回答"), () => {
    const text = node.plainText ?? node.blocks?.map((b) => b.text).join("\n") ?? "";
    void navigator.clipboard?.writeText(text);
  });

  // ↪ 分支 / 回退:单图标,点击弹出菜单(固定定位弹层,视口内自动钳制)
  if (typeof node.seq === "number") {
    const btn = actionBtn(ICONS.branch, t("分支 / 回退"), () => {
      openAnchoredMenu(btn, (menu) => {
        const add = (iconPaths: string, label: string, action: () => void) => {
          const row = el("button", "plus-menu-item");
          row.append(lineIcon(iconPaths), el("span", "menu-item-label", label));
          row.addEventListener("click", () => {
            closeActivePopover();
            action();
          });
          menu.append(row);
        };
        // 工作区回退(服务端 dsh-git-rollback 插件命令):先弹「精确撤销」确认窗口,只撤销该回合自身产生的文件改动,不动你自己的提交
        add(ICONS.rewind, t("撤销本回合文件改动"), () => {
          openRollbackUndo();
        });
        add(ICONS.ledger, t("查看检查点"), () => {
          openCheckpointsDialog();
        });
        // 从此处新建分支(保留到此;回退语义由"分支并回退到更早位置"承载,不再提供重复的"回退到此处")
        add(ICONS.branch, t("从此处新建分支"), () => {
          vscode.postMessage({ kind: "forkAt", seq: node.seq });
        });
        // 撤销本回合改动并新建分支:先弹该回合的「精确撤销」确认,确认后回退该回合改动 + 从此处新建会话分支
        add(ICONS.corner, t("撤销本回合改动并新建分支"), () => {
          if (typeof node.turn === "number" && node.turn > 0) {
            openRollbackUndo(node.turn, () => {
              vscode.postMessage({ kind: "forkAt", seq: node.seq });
            });
          } else {
            // 该消息没有可用的回合检查点:退化为仅从此处新建分支
            vscode.postMessage({ kind: "forkAt", seq: node.seq });
          }
        });
        // 若当前是分叉分支,追加"回到主线"
        const currentSession = state.sessions.find((s) => s.sessionId === state.current);
        if (currentSession?.parentSessionId) {
          add(ICONS.backMain, t("回到主线(父会话)"), () => {
            vscode.postMessage({ kind: "select", sessionId: currentSession.parentSessionId });
          });
        }
      });
    });
  }

  // 点赞 / 点踩:0.1.7 起优先走 messageFeedback/put(逐消息反馈,可撤销);
  // 缺少 message.id 的历史会话退化为官方 /feedback 命令。
  const up = actionBtn(ICONS.up, t("好的回答(记录反馈)"), () => {
    if (node.feedback === "positive") {
      clearNodeFeedback(node);
      return;
    }
    setNodeFeedback(node, "positive");
  });
  const down = actionBtn(ICONS.down, t("差的回答(记录反馈)"), () => {
    if (node.feedback === "negative") {
      clearNodeFeedback(node);
      return;
    }
    setNodeFeedback(node, "negative");
  });
  if (node.feedback === "positive") up.classList.add("selected-positive");
  if (node.feedback === "negative") down.classList.add("selected-negative");

  // 回合尾统计(网页端 MessageIconActions 同款):用量胶囊 + 用时胶囊 + 本地时钟
  const turn = node.turn;
  const bucket = typeof turn === "number" ? state.turnUsage.get(turn) : undefined;
  const total = bucket === undefined ? 0 : bucket.uncachedInput + bucket.cacheRead + bucket.cacheWrite + bucket.output;
  if (bucket !== undefined && total > 0) node.actionsEl.append(buildTurnUsageStat(bucket, total));
  const startMs = typeof turn === "number" ? state.turnStartMs.get(turn) : undefined;
  const endMs = typeof turn === "number" ? state.turnEndMs.get(turn) : undefined;
  if (startMs !== undefined && endMs !== undefined && typeof turn === "number") {
    node.actionsEl.append(buildTurnTimeStat(turn, bucket, Math.max(0, endMs - startMs)));
  }
  const clockMs = node.time ?? endMs;
  if (clockMs !== undefined) node.actionsEl.append(el("span", "turn-stat-clock", formatMessageClock(clockMs)));
}

/**
 * 记录一条消息反馈:有 message.id 的助手消息走 0.1.7 的 messageFeedback/put,
 * 否则退化为主机 /feedback 命令(旧会话日志没有 message.id)。
 */
function setNodeFeedback(node: NodeState, rating: "positive" | "negative") {
  node.feedback = rating;
  if (node.messageId) {
    vscode.postMessage({ kind: "messageFeedback", messageId: node.messageId, sessionId: state.current, rating });
  } else {
    vscode.postMessage({ kind: "feedback", rating, snippet: node.plainText ?? "" });
  }
  renderActions(node);
}

/** 撤销已记录的消息反馈(仅逐消息通道支持;命令通道无撤销语义)。 */
function clearNodeFeedback(node: NodeState) {
  const previous = node.feedback;
  node.feedback = undefined;
  if (node.messageId) {
    vscode.postMessage({ kind: "messageFeedbackClear", messageId: node.messageId, sessionId: state.current });
  } else if (previous) {
    vscode.postMessage({ kind: "notice", message: t("旧会话无法撤销反馈") });
  }
  renderActions(node);
}

/** 把宿主推送的逐消息反馈同步到已渲染的助手节点(按 messageId 精确匹配)。 */
function applyFeedbackToNodes() {
  const byMessage = new Map(state.feedback.map((item) => [item.messageId, item.rating]));
  for (const node of state.nodes) {
    if (node.kind !== "assistant" || !node.messageId) continue;
    const rating = byMessage.get(node.messageId);
    if (rating === node.feedback) continue;
    node.feedback = rating;
    renderActions(node);
  }
}


/**
 * 本地时钟(网页端 formatMessageClock 同款):同一天 → HH:mm;同年 → 「{m}月{d}日 HH:mm」;
 * 跨年 → 「{y}年{m}月{d}日 HH:mm」。
 */
function formatMessageClock(time: number): string {
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const date = new Date(time);
  const now = new Date();
  const clock = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()) return clock;
  const params = { y: String(date.getFullYear()), m: String(date.getMonth() + 1), d: String(date.getDate()) };
  const short = t("{m}月{d}日", params);
  return `${date.getFullYear() === now.getFullYear() ? short : t("{y}年{m}月{d}日", params)} ${clock}`;
}

/** 用时文案(网页端 formatRunDuration 同款):≥1 分钟用「{m}分{s}秒」,否则「{s}秒」。 */
function formatRunDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return t("{minutes}分{seconds}秒", { minutes: String(minutes), seconds: String(seconds).padStart(2, "0") });
  return t("{seconds}秒", { seconds: String(seconds) });
}

/** 回合用量胶囊:数据库图标 + 「用量 29.6M tok」,点击展开精确明细。 */
function buildTurnUsageStat(bucket: TurnUsageBucket, total: number): HTMLElement {
  const wrap = el("span", "turn-stat");
  const btn = el("button", "turn-stat-btn");
  btn.type = "button";
  btn.title = t("本轮用量");
  btn.append(lineIcon(ICONS.database, 13), el("span", "turn-stat-label", t("用量 {total}", { total: `${fmtCompactTokens(total)} tok` })));
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    openAnchoredMenu(btn, (menu) => {
      menu.classList.add("turn-stat-pop");
      const title = el("div", "ts-title");
      title.append(lineIcon(ICONS.database, 13), el("span", undefined, t("本轮用量")), el("span", "ts-title-value", `${total.toLocaleString()} tok`));
      menu.append(title, el("div", "ts-rule"));
      const rows = el("dl", "ts-rows");
      const addRow = (label: string, value: string, title2?: string) => {
        const dt = el("dt", undefined, label);
        const dd = el("dd", undefined, value);
        if (title2) dd.title = title2;
        rows.append(dt, dd);
      };
      if (bucket.routes.size > 0) addRow(t("提供方 / 模型"), [...bucket.routes].join(", "));
      const promptSide = total - bucket.output;
      // 与网页端一致:部分命中绝不显示成 100%(逐位提高精度)
      const cacheHit = cacheHitPercentText(bucket.cacheRead, promptSide);
      if (cacheHit !== null) addRow(t("缓存命中"), `${cacheHit}%`);
      addRow(t("未缓存输入"), bucket.uncachedInput.toLocaleString());
      if (bucket.cacheRead > 0) addRow(t("缓存读取"), bucket.cacheRead.toLocaleString());
      if (bucket.cacheWrite > 0) addRow(t("缓存写入"), bucket.cacheWrite.toLocaleString());
      const outputText = bucket.reasoning > 0 ? `${bucket.output.toLocaleString()}${t("（其中推理 {tokens}）", { tokens: fmtCompactTokens(bucket.reasoning) })}` : bucket.output.toLocaleString();
      addRow(t("输出"), outputText);
      menu.append(rows);
    });
  });
  wrap.append(btn);
  return wrap;
}

/** 回合用时胶囊:时钟图标 + 「用时 5分58秒」,点击展开总用时 / 输出速度 / 首 token。 */
function buildTurnTimeStat(turn: number, bucket: TurnUsageBucket | undefined, runMs: number): HTMLElement {
  const wrap = el("span", "turn-stat");
  const btn = el("button", "turn-stat-btn");
  btn.type = "button";
  btn.title = t("本轮用时和速度");
  btn.append(lineIcon(ICONS.clock, 13), el("span", "turn-stat-label", t("用时 {duration}", { duration: formatRunDuration(runMs) })));
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    openAnchoredMenu(btn, (menu) => {
      menu.classList.add("turn-stat-pop");
      const title = el("div", "ts-title");
      title.append(lineIcon(ICONS.clock, 13), el("span", undefined, t("本轮用时和速度")));
      menu.append(title, el("div", "ts-rule"));
      const rows = el("dl", "ts-rows");
      const addRow = (label: string, value: string) => rows.append(el("dt", undefined, label), el("dd", undefined, value));
      addRow(t("本轮总用时"), formatCompactDuration(runMs));
      // 首 token 用时(TTFT)= 回合起点 → 首个文本/推理增量(仅实时回合可测,历史重放无从测得)
      const firstTokenMs = state.turnFirstTokenMs.get(turn);
      const startMs = state.turnStartMs.get(turn);
      if (firstTokenMs !== undefined && startMs !== undefined) {
        addRow(t("首 token 用时（TTFT）"), formatCompactDuration(firstTokenMs - startMs));
      }
      // 输出速度(TPS)= 输出 token / 解码窗口(首个 → 末个增量),与网页端 decodeMs 同源
      const lastDeltaMs = state.turnLastDeltaMs.get(turn);
      if (bucket !== undefined && bucket.output > 0 && firstTokenMs !== undefined && lastDeltaMs !== undefined && lastDeltaMs > firstTokenMs) {
        const tps = bucket.output / ((lastDeltaMs - firstTokenMs) / 1000);
        addRow(t("输出速度（TPS）"), t("{tps} tok/s", { tps: formatTokensPerSecond(tps) }));
      }
      menu.append(rows);
    });
  });
  wrap.append(btn);
  return wrap;
}

// ---------- 事件折叠 ----------

function handleEvent(wire: WireEvent) {
  const ev = wire.event;
  if (state.seqs.has(ev.seq)) return;
  state.seqs.add(ev.seq);
  state.rawEvents.push(wire);
  const data = ev.data ?? {};
  currentEventSeq = ev.seq;
  // 压缩检查点以 surfaceOp=replace 覆盖被压缩区间:先摘掉已折叠的历史条目
  if (ev.surfaceOp !== undefined) applySurfaceReplace(ev);

  switch (ev.type) {    case "user/message": {
      // 压缩检查点(compaction checkpoint):正文即压缩摘要,已由命令行节点呈现,
      // 不再落成「系统提示词」卡片(网页端同款:检查点只更新压缩行)
      const checkpoint = compactCheckpointSource(data);
      if (checkpoint) {
        finishCompactionRow(checkpoint.compactionId, checkpoint.sourceCommandId);
        break;
      }
      // 0.2.1 工作目录切换通告:宿主把它注入为 user/message(source.kind = "working-directory"),
      // 不是用户说的话 —— 渲染成小字提示,否则会被误当成用户提问
      if (data?.source?.kind === "working-directory") {
        const cwd = (extractText(data?.content) ?? "").trim();
        if (cwd) {
          state.workingDirectory = cwd;
          renderWorkingDirectoryChip();
          appendNode({ kind: "note", key: `cwd:${ev.seq}`, el: null, text: t("工作目录已切换为 {path}", { path: cwd }), cmd: true });
        }
        break;
      }
      const text = extractText(data?.content);
      const id: string | undefined = data?.id;
      if (id && state.queuedIds.has(id)) {
        const queued = state.queuedIds.get(id)!;
        state.queuedIds.delete(id);
        removeNode(queued);
        // 排队期间生成的附件上下文卡片一并移除,避免与正式消息的附件卡片重复
        const queuedAttach = state.nodes.find((n) => n.key === `qat:${id}`);
        if (queuedAttach) removeNode(queuedAttach);
      }
      // 图片内容块(官方 image 附件通道)
      const images = extractImageRefs(data);
      if (!text && !id && images.length === 0) break;
      if (data?.source?.kind === "user") {
        const split = splitAttachmentContext(text);
        if (split.attachContext) {
          appendNode({ kind: "attach", key: `at:${ev.seq}`, el: null, text: split.attachContext });
        }
        if (isSlashCommandOnly(split.userText) && images.length === 0) {
          // 权限切换是系统级开关(permissionPresets/preset + sandbox/mode + approval/policy 事件):
          // 与网页端一致,不渲染为对话条目;状态由 permissions 投影芯片 + 宿主提示气泡呈现
          if (/^\/permission(?:\s|$)/.test(split.userText.trim())) {
            break;
          }
          // 其余纯斜杠命令(计划模式等):不显示为用户气泡,以小字命令行呈现
          appendNode({ kind: "note", key: `cmd:${ev.seq}`, el: null, text: `⌘ ${split.userText.trim()}`, cmd: true });
        } else {
          appendNode({ kind: "user", key: `u:${ev.seq}`, el: null, text: split.userText, ...(images.length ? { images } : {}) });
        }
      } else if (text) {
        // 系统提示词/运行时上下文快照:合并为一条折叠笔记,避免同一位置弹出 N 个
        const last = state.nodes[state.nodes.length - 1];
        if (last && last.kind === "note" && !last.cmd && last.key.startsWith("n:")) {
          last.text = `${last.text ?? ""}\n\n${text}`;
          if (last.el) {
            const body = last.el.querySelector(".system-note-body");
            if (body) setHtml(body as HTMLElement, last.text);
          }
        } else {
          appendNode({ kind: "note", key: `n:${ev.seq}`, el: null, text });
        }
      }
      break;
    }
    // ---------- 斜杠命令生命周期(网页端 command/run ↔ command/done) ----------
    case "command/run": {
      // 仅压缩上下文渲染为对话内的命令行(其余命令沿用既有小字命令行/芯片呈现)
      const commandId = typeof data?.commandId === "string" ? data.commandId : "";
      const name = typeof data?.name === "string" ? data.name : "";
      if (commandId === "" || name !== COMPACT_COMMAND) break;
      if (findCommandNode(commandId)) break;
      appendNode({
        kind: "command",
        key: `cmd:${commandId}`,
        el: null,
        commandId,
        cmdName: name,
        cmdStatus: "running",
        anchorSeq: ev.seq,
      });
      break;
    }
    case "command/done": {
      const commandId = typeof data?.commandId === "string" ? data.commandId : "";
      const node = commandId === "" ? undefined : findCommandNode(commandId);
      if (!node) break;
      // 压缩行有检查点时,结果文本只作为回退摘要(与网页端 CompactionItem 一致)
      node.cmdStatus = data?.kind === "error" ? "error" : "done";
      if (typeof data?.text === "string" && data.text) node.outcomeText = data.text;
      updateCommandRow(node);
      break;
    }
    // ---------- 压缩事务(手动 /compact 与自动压缩共用) ----------
    case "compaction/start": {
      const compactionId = typeof data?.compactionId === "string" ? data.compactionId : "";
      if (compactionId === "") break;
      const sourceCommandId = typeof data?.sourceCommandId === "string" ? data.sourceCommandId : undefined;
      let node = sourceCommandId !== undefined ? findCommandNode(sourceCommandId) : findCompactionNode(compactionId);
      if (!node) {
        // 自动压缩(无来源命令):独立命令行,标题为「上下文已压缩」
        node = {
          kind: "command",
          key: `cp:${compactionId}`,
          el: null,
          commandId: sourceCommandId,
          compactionId,
          autoCompaction: sourceCommandId === undefined,
          cmdStatus: "running",
          anchorSeq: ev.seq,
        };
        appendNode(node);
        break;
      }
      node.compactionId = compactionId;
      updateCommandRow(node);
      break;
    }
    case "compaction/summary": {
      const compactionId = typeof data?.compactionId === "string" ? data.compactionId : "";
      const sourceCommandId = typeof data?.sourceCommandId === "string" ? data.sourceCommandId : undefined;
      const node =
        (sourceCommandId !== undefined ? findCommandNode(sourceCommandId) : undefined) ??
        (compactionId !== "" ? findCompactionNode(compactionId) : undefined);
      if (!node) break;
      if (Array.isArray(data?.shadowedSeqs)) node.shadowedItems = data.shadowedSeqs.length;
      if (typeof data?.shadowedTokenCount === "number") node.shadowedTokens = data.shadowedTokenCount;
      // 摘要正文(summary 为 text 块数组,网页端 compactSummary 同款抽取)
      if (Array.isArray(data?.summary)) {
        const summary = data.summary
          .map((block: any) => (block?.type === "text" && typeof block.text === "string" ? block.text : ""))
          .join("");
        if (summary.trim() !== "") node.summaryText = summary;
      }
      updateCommandRow(node);
      break;
    }
    case "compaction/end": {
      // 失败关闭(无检查点):命令行落到 error,摘要文本回退到错误原因;
      // 成功时该事件同样到达(检查点之后),这里作为幂等收尾,避免行停在「正在压缩上下文…」。
      const compactionId = typeof data?.compactionId === "string" ? data.compactionId : "";
      const sourceCommandId = typeof data?.sourceCommandId === "string" ? data.sourceCommandId : undefined;
      const node =
        (sourceCommandId !== undefined ? findCommandNode(sourceCommandId) : undefined) ??
        (compactionId !== "" ? findCompactionNode(compactionId) : undefined);
      if (!node || node.cmdStatus !== "running") break;
      if (data?.error !== undefined) {
        node.cmdStatus = "error";
        if (!node.outcomeText) node.outcomeText = String(data.error?.message ?? data.error);
      } else {
        node.cmdStatus = "done";
      }
      updateCommandRow(node);
      break;
    }
    case "assistant/chunk": {
      applyAssistantChunk(data, ev.time);
      break;
    }
    // 压缩历史行(网页端同源消费):持久层把逐 token 增量打包为 chunkrow 行,
    // 旧历史快照里没有逐条 assistant/chunk,必须以行重建文本/推理块。
    case "chunkrow/text-chunks":
    case "chunkrow/reasoning-chunks": {
      const row = data ?? {};
      const turn = typeof row.turn === "number" ? row.turn : (state.currentStreamTurn ?? 0);
      const step = typeof row.step === "number" ? row.step : 0;
      const index = typeof row.index === "number" ? row.index : 0;
      const bucketKey = `${turn}:${step}`;
      let bucket = state.rowBlocks.get(bucketKey);
      if (!bucket) {
        bucket = new Map();
        state.rowBlocks.set(bucketKey, bucket);
      }
      const prev = bucket.get(index);
      const texts = Array.isArray(row.texts) ? row.texts.map(String) : [];
      bucket.set(index, {
        kind: ev.type === "chunkrow/reasoning-chunks" ? ("reasoning" as const) : ("text" as const),
        text: (prev?.text ?? "") + texts.join(""),
      });
      break;
    }
    case "chunkrow/tool-call-chunks": {
      // 压缩的工具调用行:与 tool/call 事件等价(id/name/args 分片)
      const row = data ?? {};
      const callId = String(row.id ?? "");
      if (!callId) break;
      let existing = findToolNode(callId);
      const argsDelta = Array.isArray(row.args) ? row.args.map(String).join("") : "";
      if (existing) {
        if (row.name !== undefined) existing.name = String(row.name);
        existing.args = (existing.args ?? "") + argsDelta;
        if (existing.el) {
          const pre = existing.el.querySelector(".tool-pre");
          if (pre) pre.textContent = existing.args;
          updateToolSummary(existing);
        }
        break;
      }
      const callTurn = typeof row.turn === "number" ? row.turn : state.currentStreamTurn;
      let assistant = findAssistantTail();
      if (!assistant || (callTurn !== undefined && assistant.turn !== callTurn)) {
        assistant = { kind: "assistant", key: `a:${callTurn ?? state.nodes.length}:${state.nodes.length}`, el: null, blocks: [], turn: callTurn ?? 0, tools: [] };
        appendNode(assistant);
      }
      assistant.tools ??= [];
      const node: NodeState = {
        kind: "tool",
        key: `t:${callId}`,
        el: null,
        callId,
        name: row.name !== undefined ? String(row.name) : undefined,
        args: argsDelta,
        done: true,
        afterBlock: (assistant.blocks?.length ?? 0) - 1,
      };
      node.el = renderNode(node);
      assistant.tools.push(node);
      pushInlineNode(node);
      if (!state.replaying) refreshAssistantNode(assistant, undefined, true);
      break;
    }
    case "assistant/message": {
      state.streamBlock = null;
      state.streamKey = null;
      const content: any[] = data?.message?.content ?? [];
      const turn = data?.turn ?? 0;
      const step = data?.step ?? 0;
      // 网页版布局:定位到该回合的 assistant 节点;找不到则新建
      let assistant: NodeState | undefined;
      for (let i = state.nodes.length - 1; i >= 0; i--) {
        const n = state.nodes[i];
        if (n.kind === "assistant" && n.turn === turn) {
          assistant = n;
          break;
        }
      }
      if (!assistant) {
        assistant = { kind: "assistant", key: `a:${turn}:${state.nodes.length}`, el: null, blocks: [], turn };
        appendNode(assistant);
      }
      // 0.1.7 逐消息反馈的目标:本回合最终助手消息的 message.id(操作条点赞/点踩据此落库)
      const assistantMessageId = typeof data?.message?.id === "string" ? data.message.id : undefined;
      if (assistantMessageId) assistant.messageId = assistantMessageId;
      // 底部统计胶囊:本步已结算,用它自带的 usage 立刻刷新(不必等回合结束或投影推送)
      if (!state.replaying) renderStatsLine();
      // 结算权威文本(message content)按块 index 归并:
      // - 本步已流出的块:原位覆盖文本(不新增块,避免重复渲染,也不打乱工具行的块位);
      // - 旧历史(rc.1)的压缩行:仅在 content 未覆盖的 index 上补齐;
      // - 其余(历史重放/无流式):按 index 升序追加为新块。
      let addedText = "";
      const pushBlock = (type: "text" | "reasoning", text: string) => {
        const last = assistant.blocks!.at(-1);
        if (last && last.type === type && last.text === text) return;
        assistant.blocks!.push({ type, text, el: null });
        if (type === "text") addedText += text + "\n";
      };
      const stepKey = `${turn}:${step}`;
      const authoritative = new Map<number, { type: "text" | "reasoning"; text: string }>();
      const rowBucket = state.rowBlocks.get(stepKey);
      if (rowBucket) {
        state.rowBlocks.delete(stepKey);
        for (const [index, block] of rowBucket) {
          if (block.text) authoritative.set(index, { type: block.kind, text: block.text });
        }
      }
      const streamed = state.streamedBlocks.get(stepKey);
      if (streamed) state.streamedBlocks.delete(stepKey);
      content.forEach((block, index) => {
        if (block?.type !== "text" && block?.type !== "reasoning") return;
        if (typeof block.text !== "string" || !block.text) return;
        authoritative.set(index, { type: block.type === "reasoning" ? "reasoning" : "text", text: block.text });
      });
      const covered = new Set<number>();
      if (streamed) {
        for (const [index, block] of streamed) {
          const next = authoritative.get(index);
          if (next === undefined) continue; // 流式有内容但权威为空(中断回合):保留流式文本
          block.type = next.type;
          block.text = next.text;
          covered.add(index);
        }
      }
      for (const [, block] of [...authoritative.entries()].filter(([index]) => !covered.has(index)).sort((a, b) => a[0] - b[0])) {
        pushBlock(block.type, block.text);
      }
      if (addedText) assistant.plainText = ((assistant.plainText ?? "") + "\n" + addedText.trim()).trim();
      // 工具行的插入位置按权威 content 顺序校正:
      // 历史重放里 tool/call 总在 assistant/message 之前到达(此时还没有任何块,afterBlock 只能是 -1),
      // 于是工具行会被顶到最前面;这里按 content 中"思考/文本块 ↔ tool-call 块"的真实顺序重排,
      // 与网页端"工具插在所属思考块之后"一致。
      let displayIndex = -1;
      for (const block of content) {
        if (block?.type === "text" || block?.type === "reasoning") {
          if (typeof block.text === "string" && block.text.trim() !== "") displayIndex += 1;
          continue;
        }
        if (block?.type === "tool-call" && typeof block.id === "string") {
          const tool = (assistant.tools ?? []).find((item) => item.callId === block.id);
          if (tool) tool.afterBlock = displayIndex;
        }
      }
      refreshAssistantNode(assistant, undefined, true); // 重放/实时均在此一次性渲染最终内容
      // 回合级元信息与操作条(最终一步的数据生效)
      assistant.seq = ev.seq;
      assistant.time = ev.time;
      assistant.deliverables = [...turnProduced];
      // 回合用量累计(网页端 TurnUsagePanel 同源):按步累加,供回合尾「用量」胶囊
      if (typeof turn === "number" && data?.usage && typeof data.usage === "object") {
        const step = data.usage as { inputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number; outputTokens?: number; reasoningTokens?: number };
        const bucket: TurnUsageBucket =
          state.turnUsage.get(turn) ?? { uncachedInput: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, routes: new Set<string>() };
        bucket.uncachedInput += Number(step.inputTokens ?? 0);
        bucket.cacheRead += Number(step.cacheReadTokens ?? 0);
        bucket.cacheWrite += Number(step.cacheWriteTokens ?? 0);
        bucket.output += Number(step.outputTokens ?? 0);
        bucket.reasoning += Number(step.reasoningTokens ?? 0);
        const source = data.message?.source as { provider?: string; model?: string } | undefined;
        if (source?.provider && source?.model) bucket.routes.add(`${source.provider}/${source.model}`);
        state.turnUsage.set(turn, bucket);
      }
      const modelName = state.models?.current?.model ?? "DeepSeek";
      const stepStart = state.stepStarts.get(`${turn}:${step}`);
      const usage = data?.usage;
      const suffixParts: string[] = [];
      if (stepStart !== undefined) suffixParts.push(t("思考 {d}", { d: fmtDuration(ev.time - stepStart) }));
      if (usage && typeof usage.inputTokens === "number") {
        const input = usage.inputTokens + (usage.cacheReadTokens ?? 0);
        suffixParts.push(t("入 {n} tok", { n: fmtTokens(input) }));
      }
      if (usage && typeof usage.outputTokens === "number") suffixParts.push(t("出 {n} tok", { n: fmtTokens(usage.outputTokens) }));
      const suffix = suffixParts.join(" · ");
      assistant.roleSuffix = suffix;
      if (assistant.roleEl) {
        assistant.roleEl.textContent = suffix ? `${modelName} · ${suffix}` : modelName;
      }
      // 注意:操作条(复制/分支/点赞)不在中间步骤渲染 —— 回合结束(turn/end)时才显示,
      // 避免"回合已经结束"的错觉(与网页版一致)。
      break;
    }
    case "step/start": {
      const turn = data?.turn;
      const step = data?.step;
      if (typeof turn === "number" && typeof step === "number") {
        state.stepStarts.set(`${turn}:${step}`, ev.time);
      }
      break;
    }
    case "tool/call": {
      // 活动行直接说明当前在做什么(如「运行命令 · Write-Output hi」):
      // 长回合里工具行可能已滚出视口,活动行是唯一的实时窗口
      setTurnStatusText(toolActivityLabel(data?.name, data?.arguments));
      const callId: string = data?.callId ?? "";
      if (!callId) break;
      // 记录调用视图(主机已计算):tool/result 成功时据此把跟随 locations 计入本轮产物
      if (wire.view?.for === "call") turnCallViews.set(String(callId), wire.view.view);
      const existing = findToolNode(callId);
      if (existing) {
        existing.name = data?.name ?? existing.name;
        existing.args = data?.arguments ?? existing.args;
        if (existing.el) {
          const pre = existing.el.querySelectorAll(".tool-pre")[0];
          if (pre) pre.textContent = existing.args ?? "";
          updateToolSummary(existing);
        }
        break;
      }
      // 交付文件(官方 present 工具):渲染为网页端同款文件卡(名称 + 描述 + 打开/更多),
      // 不再作为普通工具行;卡片落在回合尾产物容器里
      if (String(data?.name ?? "") === "present") {
        const presented = parsePresentedFiles(data?.arguments);
        if (presented.length > 0) {
          const callTurn = typeof data?.turn === "number" ? data.turn : state.currentStreamTurn;
          let target = [...state.nodes].reverse().find((n) => n.kind === "assistant" && (callTurn === undefined || n.turn === callTurn));
          if (!target) {
            target = { kind: "assistant", key: `a:${callTurn ?? state.nodes.length}:${state.nodes.length}`, el: null, blocks: [], turn: callTurn ?? 0, tools: [] };
            appendNode(target);
          }
          target.presented = [...(target.presented ?? []), ...presented];
          renderNodeFiles(target);
        }
        break;
      }
      // 网页端工作流:工具行内联插入到所属思考块之后(Think → 工具 → Think → 答案),不再使用独立工具合集
      let assistant = findAssistantTail();
      const callTurn = typeof data?.turn === "number" ? data.turn : state.currentStreamTurn;
      if (!assistant || (callTurn !== undefined && assistant.turn !== callTurn)) {
        assistant = { kind: "assistant", key: `a:${callTurn ?? state.nodes.length}:${state.nodes.length}`, el: null, blocks: [], turn: callTurn ?? 0, tools: [] };
        appendNode(assistant);
      }
      assistant.tools ??= [];
      const node: NodeState = {
        kind: "tool",
        key: `t:${callId}`,
        el: null,
        callId,
        name: data?.name,
        args: data?.arguments ?? "",
        done: false,
        // 插入位置:当前最后一个块(通常为刚结束的思考块)之后
        afterBlock: (assistant.blocks?.length ?? 0) - 1,
      };
      node.el = renderNode(node);
      assistant.tools.push(node);
      pushInlineNode(node);
      // 重放时跳过中间重绘,assistant/message 最终一次性渲染内联工具行
      if (!state.replaying) refreshAssistantNode(assistant, undefined, true);
      scrollToBottom();
      break;
    }
    case "tool/result": {
      const callId: string | undefined = data?.message?.source?.callId;
      const text = extractToolResultText(data);
      if (!callId) break;
      const existing = findToolNode(callId);
      if (existing) {
        existing.result = truncateResult(text);
        // 0.1.5:工具结果可携带 image 内容块(read_image / PTC 嵌套调用):
        // 与用户消息图片同样走 session/attachment 取回通道
        const images = extractImageRefs(data);
        if (images.length > 0) existing.images = images;
        // 与网页端一致:content[0].isError 才是失败标志(顶层 isError 仅兜底)
        const isError = data?.message?.isError === true || data?.isError === true || data?.message?.content?.[0]?.isError === true;
        existing.failed = isError;
        existing.done = true;
        existing.el?.classList.remove("tool-running");
        existing.el?.classList.add(existing.failed ? "tool-failed" : "tool-done");
        if (existing.el) {
          const pres = existing.el.querySelectorAll(".tool-pre");
          const body = existing.el.querySelector(".step-body");
          if (pres.length === 1) {
            body?.append(el("div", "tool-label", t("结果")), el("pre", "tool-pre", existing.result ?? ""));
          }
          if (images.length > 0 && body && body.querySelector(".msg-images") === null) {
            body.append(buildImageRow(existing));
          }
          updateToolSummary(existing);
          // 段尾汇总行实时更新:一眼看到这段已经执行了哪些动作
          refreshGroupSummaries(findAssistantTail());
          // 工具用时进入统计:工具结果到达即刷新底部胶囊(不必等回合结束)
          if (!state.replaying) renderStatsLine();
        }
        // 网页端 ProducedFiles 同款推导:成功 mutation 的跟随 locations 计入本轮产物(首见顺序去重)
        if (!isError) {
          const callView = turnCallViews.get(String(callId));
          for (const path of producedPathsFromCallView(callView)) {
            if (turnProducedSet.has(path)) continue;
            turnProducedSet.add(path);
            turnProduced.push(path);
          }
        }
      }
      // 工具结束后回到通用活动文案:下一个流式块(思考/文本)会立即覆盖它
      setTurnStatusActivity("reasoning");
      break;
    }
    case "turn/start": {
      // 回合边界:同一对话的上一回合与本回合之间插入「还原检查点」分隔线
      // (GitHub Copilot 同款);第一个回合之前不插(没有"上一回合")。
      if (state.turnStarts.length > 0) {
        appendNode({ kind: "turn-divider", key: `turn-div:${ev.seq}`, el: null, turn: typeof data.turn === "number" ? data.turn : undefined });
      }
      state.running = true;
      state.currentTurnTools = [];
      state.turnToolGroup = null;
      state.turnStarts.push(ev.seq);
      // 回合起点:回合尾「用时」胶囊的计时基准(网页端 turn.start)
      if (typeof data.turn === "number") state.turnStartMs.set(data.turn, ev.time);
      // 新回合开始:历史回合的操作条与用量改为 hover 才显示(避免"还在思考就出现底部操作栏")
      refreshActionsReveal();
      // 每回合重置产物累积器(不再读取 data.deliverables —— 本部署该字段为空)
      turnProduced = [];
      turnProducedSet.clear();
      turnCallViews.clear();
      startTurnStatus(ev.time);
      updateRunning();
      break;
    }
    case "plan/mode": {
      state.planMode = !!data?.active;
      // 事件是即时信号;投影稍后会给出权威值(含 pending)
      state.plan = { active: !!data?.active, pending: false };
      renderModeChips();
      break;
    }
    // 0.2.1 工作目录切换(working_directory 工具提交后由宿主写入日志)
    case "working-directory/change": {
      const cwd = typeof data?.cwd === "string" ? data.cwd : "";
      if (cwd === "") break;
      state.workingDirectory = cwd;
      renderWorkingDirectoryChip();
      appendNode({ kind: "note", key: `cwd:${ev.seq}`, el: null, text: t("工作目录已切换为 {path}", { path: cwd }), cmd: true });
      break;
    }
    case "turn/end": {
      state.running = false;
      state.streamBlock = null;
      state.streamKey = null;
      stopTurnStatus();
      // 兜底:回合已结束,任何仍标着「运行中」的自动压缩行都不可能还在压缩
      // (宿主未送检查点/compaction-end 时,尾部会永久留一条「正在压缩上下文…」)
      finishRunningCompactionRows();
      // 回合结束原因:失败(0.1.2 起 data.reason = {kind:'error', error:{code,message}})记账,
      // 由随后的事件/收尾把提示卡落到这个回合的尾部(issue #19:超限时对话里毫无提示)
      turnFailure = undefined;
      const reason = (data as { reason?: { kind?: string; error?: { code?: string; message?: string } } } | undefined)?.reason;
      if (reason && typeof reason.kind === "string" && reason.kind !== "completed") {
        turnFailure = {
          sessionId: String(eventsSessionId ?? state.current ?? ""),
          turn: typeof data.turn === "number" ? data.turn : undefined,
          kind: reason.kind,
          code: reason.error?.code,
          message: reason.error?.message ?? t("宿主未提供失败详情(旧版宿主或运行中止)"),
          at: ev.time,
        };
      }
      const finishedTurn = state.currentStreamTurn ?? (typeof data.turn === "number" ? data.turn : undefined);
      state.currentStreamTurn = undefined;
      if (typeof finishedTurn === "number") state.turnEndMs.set(finishedTurn, ev.time);
      // 兜底:回合结束时把仍未随 assistant/message 落地的 chunkrow 行按 index 合入该回合节点
      // (覆盖无 message 结束的中断回合,以及任何行先于节点创建到达的顺序组合)
      // 回合结束:刷新操作条可见性(最新回合恢复常显;仍在运行时其余回合保持 hover 才显示)
      refreshActionsReveal();
      if (finishedTurn !== undefined) {
        const node = [...state.nodes].reverse().find((n) => n.kind === "assistant" && n.turn === finishedTurn);
        if (node && node.blocks) {
          const pending: { index: number; kind: "text" | "reasoning"; text: string }[] = [];
          for (const [key, bucket] of state.rowBlocks) {
            if (!key.startsWith(`${finishedTurn}:`)) continue;
            state.rowBlocks.delete(key);
            for (const [index, b] of bucket) pending.push({ index, kind: b.kind, text: b.text });
          }
          if (pending.length > 0) {
            pending.sort((a, b) => a.index - b.index);
            for (const b of pending) {
              if (!b.text) continue;
              const last = node.blocks.at(-1);
              if (last && last.type === b.kind && last.text === b.text) continue;
              node.blocks.push({ type: b.kind, text: b.text, el: null });
            }
            refreshAssistantNode(node, undefined, true);
          }
        }
      }
      // 回合结束后才渲染操作条(复制/分支/点赞)
      if (finishedTurn !== undefined) {
        const node = [...state.nodes].reverse().find((n) => n.kind === "assistant" && n.turn === finishedTurn);
        if (node) renderActions(node);
      }
      // 本轮产物:渲染进收尾助手消息的产物容器(复制/分支/点赞操作条之前),与网页端回合尾链一致
      const produced = [...turnProduced];
      if (produced.length > 0) {
        const closing =
          finishedTurn !== undefined
            ? [...state.nodes].reverse().find((n) => n.kind === "assistant" && n.turn === finishedTurn)
            : undefined;
        if (closing) {
          closing.deliverables = produced;
          renderNodeFiles(closing);
        } else {
          // 罕见兜底:找不到收尾助手消息时,退回独立产物卡
          appendNode({ kind: "files", key: `files:${ev.seq}`, el: null, files: produced });
        }
        turnProduced = [];
        turnProducedSet.clear();
        turnCallViews.clear();
      }
      // 回合结束即刷新底部统计栏(投影缺失时由本地事件推导,保证始终显示)
      if (!state.replaying) renderStatsLine();
      updateRunning();
      // 失败回合:把原因留在对话尾部(上下文超限 → 压缩 / 换模型动作)
      alertTurnFailure(String(eventsSessionId ?? state.current ?? ""));
      break;
    }
    default:
      break;
  }
  // 事件折叠结束后清除锚点:事件之外创建的节点(排队消息等)不得继承上一个事件的 seq
  currentEventSeq = undefined;
}

function removeNode(node: NodeState) {
  node.el?.remove();
  const idx = state.nodes.indexOf(node);
  if (idx >= 0) state.nodes.splice(idx, 1);
}

function extractText(content: any): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((b: any) => b?.type === "text" && typeof b.text === "string")
    .map((b: any) => b.text)
    .join("\n");
}

/** 拆分附件组合消息:【附加文件/文件夹】上下文 + 【用户消息】正文。 */
function splitAttachmentContext(text: string): { userText: string; attachContext: string | null } {
  const marker = "\n\n【用户消息】\n";
  const idx = text.indexOf(marker);
  if (idx === -1) return { userText: text, attachContext: null };
  const context = text.slice(0, idx).trim();
  const userText = text.slice(idx + marker.length).trim();
  if (!context.startsWith("【附加文件/文件夹】")) return { userText: text, attachContext: null };
  return { userText, attachContext: context };
}

/** 是否为纯斜杠命令消息(如 /permission read-only),这类消息不作为普通气泡展示。 */
function isSlashCommandOnly(text: string): boolean {
  const t = text.trim();
  return t.startsWith("/") && !t.includes("\n") && /^\/[a-zA-Z][\w-]*(\s.*)?$/.test(t);
}

function extractToolResultText(data: any): string {
  const blocks: unknown = data?.message?.content?.[0]?.content;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((b: any) => b?.type === "text" && typeof b.text === "string")
    .map((b: any) => b.text)
    .join("\n");
}

/**
 * 收集一条消息 / 工具结果里引用的图片块。
 * 兼容两种位置:工具结果嵌套在 content[0].content(0.1.5 的 read_image 图片结果),
 * 以及消息自身的 content(用户消息或模型直接产出的图片)。
 */
function extractImageRefs(data: any): { attachmentId: string; mediaType?: string }[] {
  const nested: any[] = [];
  const outer = data?.message?.content ?? data?.content;
  if (Array.isArray(outer)) {
    for (const block of outer) {
      if (Array.isArray(block?.content)) nested.push(...block.content);
      nested.push(block);
    }
  }
  return nested
    .filter((block: any) => block?.type === "image" && block?.attachment?.attachmentId)
    .map((block: any) => ({ attachmentId: String(block.attachment.attachmentId), mediaType: block.attachment.mediaType }));
}

function truncateResult(text: string): string {
  const max = 4000;
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n" + t("…(已截断,共 {n} 字符)", { n: String(text.length) });
}

// ---------- 模式指示芯片(计划模式 / 目标模式) ----------

/** 当前打开的锚定弹层(全局唯一,避免重复堆叠)及其关闭回调。 */
let activePopover: HTMLElement | null = null;
let activePopoverOnClose: (() => void) | undefined;

function closeActivePopover() {
  const menu = activePopover;
  activePopover = null;
  const onClose = activePopoverOnClose;
  activePopoverOnClose = undefined;
  // 先派发清理事件(常驻的 document/window 监听在菜单里注册,移除节点前解绑)
  if (menu) {
    menu.dispatchEvent(new menu.ownerDocument.defaultView!.Event("dsh:popover-closed"));
    menu.remove();
  }
  onClose?.();
}

/**
 * 在锚点下方打开一个固定定位弹层(挂载到根节点,不受芯片重渲染影响)。
 * onClose 在关闭(点击外部 / 被新弹层替换)时回调,用于复位触发按钮的展开态。
 */
function openAnchoredMenu(anchor: HTMLElement, build: (menu: HTMLElement) => void, onClose?: () => void): HTMLElement {
  closeActivePopover();
  const menu = el("div", "msg-popover anchored-popover");
  build(menu);
  root.append(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 240))}px`;
  menu.style.zIndex = "300";
  // 先临时定位再按实测高度钳制,保证整块菜单始终在视口内(高度上限由 CSS max-height 控制)
  menu.style.top = `${rect.bottom + 6}px`;
  const height = menu.offsetHeight;
  menu.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - height - 10))}px`;
  activePopover = menu;
  activePopoverOnClose = onClose;
  menu.addEventListener("click", (ev) => ev.stopPropagation());
  const close = () => {
    if (activePopover === menu) {
      activePopover = null;
      activePopoverOnClose = undefined;
      menu.dispatchEvent(new menu.ownerDocument.defaultView!.Event("dsh:popover-closed"));
      menu.remove();
      onClose?.();
    }
  };
  // issue #21 第 9 条:一次点击没关掉时(例如点在别的弹层/被其它处理器吞掉)不会留下收不回的弹层。
  // 因此不再只挂一次性的捕获监听,而是常驻:点击弹层外部、按 Esc、面板失焦、滚动都关闭。
  const onDocumentClick = (ev: MouseEvent) => {
    if (activePopover !== menu) return;
    const target = ev.target as Node | null;
    if (target && (menu.contains(target) || anchor.contains(target))) return;
    close();
  };
  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === "Escape" && activePopover === menu) {
      ev.preventDefault();
      close();
    }
  };
  const onBlur = () => close();
  document.addEventListener("click", onDocumentClick, true);
  window.addEventListener("blur", onBlur);
  document.addEventListener("scroll", close, true);
  window.addEventListener("keydown", onKeyDown, true);
  menu.addEventListener("dsh:popover-closed", () => {
    document.removeEventListener("click", onDocumentClick, true);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("scroll", close, true);
    window.removeEventListener("keydown", onKeyDown, true);
  });
  return menu;
}

/** 目标管理菜单(修改 / 完成 / 清除),芯片与顶部目标卡共用。 */
function openGoalMenu(anchor: HTMLElement) {
  const inner = state.goal?.goal;
  if (!inner || inner.phase !== "active") return;
  openAnchoredMenu(anchor, (menu) => {
    const add = (icon: string, label: string, action: () => void) => {
      const row = el("button", "plus-menu-item", `${icon} ${label}`);
      row.addEventListener("click", () => {
        closeActivePopover();
        action();
      });
      menu.append(row);
    };
    const ref = { id: inner.id, revision: inner.revision };
    add("✏️", t("修改目标"), async () => {
      const objective = await showDialog({
        title: t("修改目标"),
        text: t("修改目标描述(已填入当前目标):"),
        input: true,
        confirmLabel: t("保存"),
        value: inner.objective ?? "",
      });
      if (objective && objective.trim() && objective.trim() !== inner.objective) {
        vscode.postMessage({ kind: "goalEdit", ref, objective: objective.trim() });
      }
    });
    add("⏸️", t("暂停目标"), () => vscode.postMessage({ kind: "goalPause", ref }));
    add("✅", t("完成目标"), () => vscode.postMessage({ kind: "goalComplete", ref }));
    add("🗑️", t("取消目标"), () => vscode.postMessage({ kind: "goalClear", ref }));
  });
}

/** 芯片渲染签名:仅当关键状态变化时才重建,避免投影更新打断打开的菜单。 */
let chipsSignature = "";

function renderModeChips() {
  const inner = state.goal?.goal;
  // 计划模式:优先用 `plan` 投影的有效目标态,投影缺席时退回 plan/mode 事件
  const planActive = state.plan ? (state.plan.pending ? !state.plan.active : state.plan.active) : state.planMode;
  const planPending = state.plan?.pending === true;
  const sig = `${planActive}|${planPending}|${inner?.id ?? ""}|${inner?.phase ?? ""}`;
  if (sig === chipsSignature) return;
  chipsSignature = sig;
  modeChips.innerHTML = "";
  if (planActive) {
    const chip = el("span", "mode-chip plan-chip", planPending ? t("📝 计划模式(切换中…)") : t("📝 计划模式"));
    chip.title = t("点击退出计划模式(发送 /plan off)");
    const close = el("button", "chip-close", "×");
    chip.append(close);
    // /plan 不带参数是"进入"计划模式;退出必须发 /plan off(与宿主命令语义一致)
    chip.addEventListener("click", () => vscode.postMessage({ kind: "command", line: "/plan off" }));
    modeChips.append(chip);
  }
  if (inner && inner.phase !== "complete") {
    // 仅当对话存在实际目标(进行中/暂停/阻塞)时显示 🎯 芯片;已完成或无目标时隐藏
    const phase = inner.phase ?? "active";
    const cls: Record<string, string> = { active: "goal-chip", complete: "goal-chip done", blocked: "goal-chip blocked", paused: "goal-chip paused" };
    const chip = el("span", "mode-chip " + (cls[phase] ?? "goal-chip"), t("🎯 目标"));
    chip.title = t("点击管理目标(暂停 / 修改 / 完成 / 取消)");
    const close = el("button", "chip-close", "×");
    chip.append(close);
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      openAnchoredMenu(chip, (menu) => {
        const add = (icon: string, label: string, action: () => void) => {
          const row = el("button", "plus-menu-item", `${icon} ${label}`);
          row.addEventListener("click", () => {
            closeActivePopover();
            action();
          });
          menu.append(row);
        };
        const ref = { id: inner.id, revision: inner.revision };
        if (phase === "active") {
          add("⏸️", t("暂停目标"), () => vscode.postMessage({ kind: "goalPause", ref }));
        } else if (phase === "paused" || phase === "blocked") {
          add("▶️", t("继续目标"), () => vscode.postMessage({ kind: "goalResume", ref }));
        }
        add("✏️", t("修改目标"), async () => {
          const objective = await showDialog({
            title: t("修改目标"),
            text: t("修改目标描述(已填入当前目标):"),
            input: true,
            confirmLabel: t("保存"),
            value: inner.objective ?? "",
          });
          if (objective && objective.trim() && objective.trim() !== inner.objective) {
            vscode.postMessage({ kind: "goalEdit", ref, objective: objective.trim() });
          }
        });
        if (phase === "active") {
          add("✅", t("完成目标"), () => vscode.postMessage({ kind: "goalComplete", ref }));
        }
        add("🗑️", t("取消目标"), () => vscode.postMessage({ kind: "goalClear", ref }));
      });
    });
    modeChips.append(chip);
  } else if (!inner) {
    // 无目标:提供"设置目标"入口(goal.create,网页端同等操作)
    const chip = el("span", "mode-chip goal-chip", t("🎯 设置目标"));
    chip.title = t("创建一个长期目标(agent 自动多轮推进直至完成)");
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      void createGoalDialog();
    });
    modeChips.append(chip);
  }
}

/** 创建目标的对话框(goal.create)。 */
async function createGoalDialog() {
  const objective = await showDialog({
    title: t("设置目标"),
    text: t("目标描述(agent 将自动多轮推进直至完成):"),
    input: true,
    confirmLabel: t("创建"),
  });
  if (!objective || !objective.trim()) return;
  const rounds = await showDialog({
    title: t("设置目标"),
    text: t("最大轮数(留空不限制):"),
    input: true,
    confirmLabel: t("创建"),
    value: "20",
  });
  if (rounds === null) return;
  const n = rounds.trim() === "" ? undefined : Number.parseInt(rounds, 10);
  vscode.postMessage({
    kind: "goalCreate",
    objective: objective.trim(),
    ...(n !== undefined && Number.isFinite(n) && n > 0 ? { maxGoalRounds: n } : {}),
  });
}

// ---------- goal 进度 ----------

function renderGoal() {
  goalArea.innerHTML = "";
  const g = state.goal;
  const inner = g?.goal;
  if (!inner || typeof inner.objective !== "string") {
    goalArea.hidden = true;
    return;
  }
  goalArea.hidden = false;
  const card = el("div", "goal-card");
  card.title = t("点击管理目标(修改 / 完成 / 清除)");
  if (inner.phase === "active") {
    card.classList.add("clickable");
    card.addEventListener("click", (e) => {
      e.stopPropagation();
      openGoalMenu(card);
    });
  }
  const head = el("div", "goal-card-head");
  const title = el("div", "goal-title", "🎯 " + inner.objective);
  head.append(title);
  if (inner.phase === "active") {
    const more = el("button", "goal-more-btn");
    more.append(lineIcon(ICONS.more, 13));
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      openGoalMenu(card);
    });
    head.append(more);
  }
  card.append(head);

  const phase = inner.phase ?? "active";
  const phaseLabel: Record<string, string> = { active: t("进行中"), complete: t("已完成"), blocked: t("已阻塞"), paused: t("已暂停") };
  const rounds = typeof g.roundsStarted === "number" ? g.roundsStarted : undefined;
  const max = typeof inner.maxGoalRounds === "number" && inner.maxGoalRounds > 0 ? inner.maxGoalRounds : undefined;
  const updated = typeof g.updatedAt === "number" ? new Date(g.updatedAt).toLocaleTimeString() : "";

  // 文案与进度:已完成 → 100% 进度;"第 0 轮"改为"等待推进"
  const metaParts: string[] = [phaseLabel[phase] ?? phase];
  if (phase === "complete") {
    if (rounds !== undefined && rounds > 0) metaParts.push(t("共 {n} 轮", { n: String(rounds) }));
  } else if (rounds !== undefined) {
    if (rounds === 0) {
      metaParts.push(t("等待推进"));
    } else if (max !== undefined) {
      metaParts.push(t("第 {n}/{m} 轮", { n: String(rounds), m: String(max) }));
    } else {
      metaParts.push(t("第 {n} 轮", { n: String(rounds) }));
    }
  }
  if (updated) metaParts.push(`${t("更新于")} ${updated}`);
  card.append(el("div", "goal-meta", metaParts.join(" · ")));

  let pct: number | undefined;
  if (phase === "complete") pct = 100;
  else if (rounds !== undefined && max !== undefined) pct = Math.max(0, Math.min(100, Math.round((rounds / max) * 100)));
  if (pct !== undefined) {
    const bar = el("div", "goal-bar");
    const fill = el("div", "goal-bar-fill" + (phase === "complete" ? " complete" : ""));
    fill.style.width = `${pct}%`;
    bar.append(fill);
    card.append(bar);
  }
  goalArea.append(card);
  renderModeChips();
}

// ---------- 会话 / 状态 / 工具行 ----------

/** 运行中指示:主题色脉冲圆点(不再用 ⏳ emoji)。 */
function runningDot(): HTMLElement {
  const dot = el("span", "session-led led-running");
  dot.title = t("运行中");
  return dot;
}

/** 会话状态徽标(待审批 / 计划待审 / 等待回答 / 运行中):色点 + 文字,不带 emoji。 */
function pendingBadge(pending: { kind: "approval" | "question" | "plan-review" }): HTMLElement {
  const kind = pending.kind;
  const label = kind === "approval" ? t("等待审批") : kind === "plan-review" ? t("计划待审") : t("等待回答");
  const cls = kind === "approval" ? "badge-approval" : kind === "plan-review" ? "badge-plan" : "badge-question";
  const badge = el("span", `session-badge ${cls}`);
  badge.append(el("span", `session-led led-${kind}`), el("span", undefined, label));
  return badge;
}

function renderSessions() {
  const current = state.current;
  const archived = new Set(state.archivedSessionIds);
  // 与网页端一致:归档会话与子代理会话从常规列表隐藏(归档可到工作区面板"已归档"区查看)
  // 与 Claude Code 一致:默认只展示当前工作目录的会话,避免误操作其他项目的对话
  const folder = state.workspaceFolder;
  const inFolder = (s: StoredSession) => {
    if (!folder) return true;
    if (!s.cwd) return false;
    const norm = (p: string) => p.replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase();
    const f = norm(folder);
    const c = norm(s.cwd);
    return c === f || c.startsWith(f + "/");
  };
  const filtered = !state.showAllSessions && folder !== null;
  // 严格目录隔离:过滤开启时仅显示当前工作目录的会话(不含其他目录的"当前会话");
  // 显示全部时仍隐藏归档与子代理会话。
  const visible = state.sessions.filter((s) => !archived.has(s.sessionId) && s.origin !== "subagent" && (!filtered || inFolder(s)));

  // ---- 触发按钮:当前会话 + 状态徽标 + 通知点(有未读/待处理会话时) ----
  const cur = state.sessions.find((s) => s.sessionId === current);
  sessionBtnLabel.textContent = cur ? (cur.title || sessionLabel(cur)) : t("— 选择会话 —");
  sessionBtnLabel.title = cur ? (cur.title || sessionLabel(cur)) : "";
  sessionBtnBadges.innerHTML = "";
  if (cur?.pending) sessionBtnBadges.append(pendingBadge(cur.pending));
  else if (cur?.running) {
    const badge = el("span", "session-badge badge-running");
    badge.append(runningDot(), el("span", undefined, t("运行中")));
    sessionBtnBadges.append(badge);
  }
  const anyPending = visible.some((s) => s.pending);
  const anyUnread = visible.some((s) => s.unread);
  sessionBtnDot.hidden = !anyPending && !anyUnread;
  sessionBtnDot.className = "session-btn-dot" + (anyPending ? " dot-warn" : " dot-unread");

  // ---- 会话列表弹层 ----
  sessionList.innerHTML = "";
  sessionList.append(el("div", "session-dropdown-head", filtered ? t("会话(当前目录)") : t("会话")));
  for (const s of visible) {
    const row = el("button", "session-row" + (s.sessionId === current ? " active" : ""));
    // 未查看完成回合 → 绿色圆点(点击选中该会话后由宿主清除)
    if (s.unread) row.append(el("span", "unread-dot"));
    const main = el("span", "session-row-main");
    const branch = s.parentSessionId ? "↪ " : "";
    // 无标题会话的兜底名不再用 🆕/💬 emoji:与行内其它标记统一成纯文本
    const title = `${branch}${s.blank ? t("新会话") : ""}${s.sessionId.slice(0, 12)}`.trim();
    main.append(el("span", "session-row-title", s.title || title));
    const subBits: string[] = [];
    if (s.cwd) subBits.push(basename(s.cwd));
    if (s.agentPreset) subBits.push(presetName(s.agentPreset));
    if (subBits.length) main.append(el("span", "session-row-sub", subBits.join(" · ")));
    row.append(main);
    if (s.pending) row.append(pendingBadge(s.pending));
    else if (s.running) {
      const badge = el("span", "session-badge badge-running");
      badge.append(runningDot(), el("span", undefined, t("运行中")));
      row.append(badge);
    }
    row.addEventListener("click", () => {
      sessionList.hidden = true;
      if (s.sessionId !== current) {
        // 切换会话:立即清掉旧会话的计划/目标状态,避免过渡期点击芯片误发命令到新会话
        state.planMode = false;
        state.goal = null;
        renderGoal();
        renderModeChips();
        vscode.postMessage({ kind: "select", sessionId: s.sessionId });
      }
    });
    sessionList.append(row);
  }
  if (visible.length === 0) {
    sessionList.append(el("div", "session-dropdown-empty", t("暂无会话")));
  }
  // 过滤开关:默认仅当前目录;可随时切回全部会话
  const foot = el("button", "session-dropdown-foot");
  foot.textContent = filtered ? t("显示全部会话") : t("仅显示当前目录会话");
  foot.title = filtered ? t("显示其他目录的会话") : t("默认只显示当前工作目录的会话");
  foot.addEventListener("click", () => {
    state.showAllSessions = !state.showAllSessions;
    renderSessions();
  });
  sessionList.append(foot);

  // 回到主线按钮:仅当前会话是分叉分支时显示
  const currentSession = state.sessions.find((s) => s.sessionId === current);
  btnBackToMain.hidden = !currentSession?.parentSessionId;
}

function sessionLabel(s: StoredSession): string {
  const id = s.sessionId.slice(0, 12);
  const cwd = s.cwd ? basename(s.cwd) : "";
  const branch = s.parentSessionId ? "↪ " : "";
  return `${branch}${s.blank ? "🆕" : "💬"} ${id}${cwd ? ` · ${cwd}` : ""}${s.agentPreset ? ` · ${presetName(s.agentPreset)}` : ""}`;
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

/** 父目录(无父目录时返回空串)。 */
function parentDir(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join(p.includes("/") && !p.includes("\\") ? "/" : "\\");
}

/** 工具图标映射(网页端工具视图同款分类:shell / edit / read / search / web / 其他)。 */
function toolIcon(name?: string): string {
  const n = (name ?? "").toLowerCase();
  if (n.includes("bash") || n.includes("pwsh") || n.includes("shell") || n === "terminal" || n.includes("code_runtime")) return "💻";
  if (n.includes("edit") || n.includes("write") || n.includes("str_replace")) return "✏️";
  if (n.includes("read")) return "📖";
  if (n.includes("grep") || n.includes("glob") || n.includes("search")) return "🔍";
  if (n.includes("web")) return "🌐";
  if (n.includes("todo")) return "☑️";
  if (n.includes("skill")) return "🧩";
  if (n.includes("goal")) return "🎯";
  if (n.includes("subagent")) return "🤖";
  if (n.includes("workflow")) return "🔀";
  if (n.includes("ask_user") || n.includes("question")) return "❓";
  return "🔧";
}

/** 工具行的线条图标(网页端 ToolRow 的 leading 图标同源;emoji 版本保留给非网页样式处使用)。 */
function toolIconPaths(name?: string): string {
  const n = (name ?? "").toLowerCase();
  if (n.includes("bash") || n.includes("pwsh") || n.includes("shell") || n === "terminal" || n.includes("code_runtime")) return ICONS.terminal;
  if (n.includes("edit") || n.includes("write") || n.includes("str_replace")) return ICONS.edit;
  if (n.includes("read_image")) return ICONS.image;
  if (n.includes("read")) return ICONS.file;
  if (n.includes("grep") || n.includes("glob") || n.includes("search")) return ICONS.search;
  if (n.includes("web")) return ICONS.globe;
  if (n.includes("todo") || n.includes("plan")) return ICONS.checklist;
  if (n.includes("skill")) return ICONS.list;
  if (n.includes("goal")) return ICONS.help;
  if (n.includes("subagent") || n.includes("workflow") || n.includes("task")) return ICONS.robot;
  if (n.includes("ask_user") || n.includes("question")) return ICONS.help;
  if (n.includes("present") || n.includes("job")) return ICONS.box;
  return ICONS.gear;
}

/** 工具行的中文标题(网页端 tool.title.* 同源)。 */
function toolTitle(name?: string): string {
  const n = (name ?? "").toLowerCase();
  if (n.includes("bash")) return "Bash";
  if (n.includes("pwsh") || n.includes("powershell")) return "Pwsh";
  if (n.includes("grep")) return "Grep";
  if (n.includes("glob")) return "Glob";
  if (n.includes("read_image")) return t("读取图片");
  if (n.includes("read")) return t("读取");
  if (n.includes("edit") || n.includes("str_replace")) return t("编辑");
  if (n.includes("write")) return t("写入");
  if (n.includes("web_search")) return t("网页搜索");
  if (n.includes("web_fetch")) return t("网页获取");
  if (n.includes("todo")) return t("任务");
  if (n.includes("skill")) return t("技能");
  if (n.includes("subagent")) return t("子代理");
  if (n.includes("present")) return t("产物");
  if (n.includes("code_runtime") || n.includes("code")) return t("代码");
  if (n.includes("search")) return t("搜索");
  return name && name.length <= 28 ? name : t("工具调用");
}

/** 解析工具参数(解析失败返回 undefined;流式期间参数可能仍是半截 JSON)。 */
function parseToolArgs(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** 从参数里取第一个字符串字段(按优先级)。 */
function firstString(args: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!args) return undefined;
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

/**
 * 工具行的摘要文案(网页端 ToolRow 的 summary 同款):优先用模型给的 description,
 * 否则按工具类型取路径 / 命令 / 查询串等人类可读字段,而不是直接摊开 JSON。
 */
function toolSummary(name: string | undefined, rawArgs: unknown): string {
  const n = (name ?? "").toLowerCase();
  const args = parseToolArgs(rawArgs);
  const description = firstString(args, ["description", "summary", "label"]);
  const path = firstString(args, ["path", "file_path", "filePath", "notebook_path", "file"]);
  if (n.includes("bash") || n.includes("pwsh") || n.includes("shell")) {
    const command = firstString(args, ["command", "cmd"]);
    if (description) return description;
    if (command) return command.replace(/\s+/g, " ").trim();
  }
  if (path) {
    const extra = n.includes("write") || n.includes("edit") ? firstString(args, ["old_string"]) === undefined && typeof args?.content === "string"
      ? ` (${String(args.content).split("\n").length} 行)`
      : ""
      : "";
    return `${path}${extra}`;
  }
  const query = firstString(args, ["query", "pattern", "search", "q"]);
  if (query) return query;
  if (n.includes("web_fetch")) {
    const url = firstString(args, ["url"]);
    if (url) return url;
  }
  const todos = args?.todos;
  if (Array.isArray(todos)) {
    const done = todos.filter((item) => (item as { status?: string })?.status === "completed").length;
    const active = todos.find((item) => (item as { status?: string })?.status === "in_progress") as { content?: string } | undefined;
    return `${done}/${todos.length} 已完成${active?.content ? ` · ${active.content}` : ""}`;
  }
  const files = args?.files;
  if (Array.isArray(files)) {
    const names = files.map((item) => (typeof (item as { path?: string })?.path === "string" ? String((item as { path: string }).path) : "")).filter(Boolean);
    if (names.length > 0) return names.map((p) => p.split(/[\\/]/).pop()).join(", ");
  }
  if (description) return description;
  // 兜底:取参数里第一个短字符串值,避免整段 JSON 撑满一行
  if (args) {
    for (const value of Object.values(args)) {
      if (typeof value === "string" && value.trim() && value.length <= 120) return value.trim().replace(/\s+/g, " ");
    }
  }
  return typeof rawArgs === "string" ? rawArgs.replace(/\s+/g, " ").slice(0, 120) : "";
}

/** 本地即时更新当前模型的推理强度(乐观显示;服务器 projection 到达后再次校准)。 */
function setLocalModelEffort(effort: string | undefined) {
  const m = state.models?.current;
  if (!m) return;
  const next = { ...m };
  if (effort) next.reasoningEffort = effort;
  else delete next.reasoningEffort;
  state.models = { ...state.models!, current: next };
  renderThinkingSeg();
  renderModelPill();
}

/** 弹层内的推理等级分段按钮(默认 + 每个强度一个选项;点击即切换,面板保持打开以便连选模型与强度)。 */
function renderThinkingSeg() {
  thinkSeg.innerHTML = "";
  const m = state.models?.current;
  const modelInfo = m ? findModel(m.provider, m.model) : undefined;
  const efforts = modelInfo?.reasoning?.efforts ?? [];
  mppThink.hidden = efforts.length === 0;
  if (efforts.length === 0) return;
  const make = (label: string, effort: string | undefined) => {
    const active = effort ? m?.reasoningEffort === effort : !m?.reasoningEffort;
    const b = el("button", "think-opt" + (active ? " active" : ""));
    b.type = "button";
    b.textContent = label;
    b.title = effort ? (modelInfo?.reasoning?.efforts.find((x) => x.id === effort)?.description ?? label) : label;
    b.addEventListener("click", () => {
      if (!m) return;
      setLocalModelEffort(effort);
      vscode.postMessage({ kind: "selectModel", provider: m.provider, model: m.model, ...(effort ? { effort } : {}) });
    });
    thinkSeg.append(b);
  };
  make(t("默认"), undefined);
  for (const effort of efforts) make(effort.name || effort.id, effort.id);
}

function findModel(provider: string, model: string): ModelInfo | undefined {
  return state.models?.groups.find((g) => g.id === provider)?.models.find((m) => m.id === model);
}

function renderModelPill() {
  const m = state.models?.current;
  const modelInfo = m ? findModel(m.provider, m.model) : undefined;
  const effortName = m?.reasoningEffort
    ? (modelInfo?.reasoning?.efforts.find((e) => e.id === m.reasoningEffort)?.name ?? m.reasoningEffort)
    : t("默认");
  modelPillModel.textContent = m ? modelName(m.provider, m.model) : t("模型");
  modelPillEffort.textContent = m ? effortName : "";
  modelPillSep.hidden = !m;
  modelPillHead.disabled = (state.models?.groups?.length ?? 0) === 0;
  modelPillList.innerHTML = "";
  const groups = state.models?.groups ?? [];
  const multiGroup = groups.length > 1;
  let currentInList = false;
  for (const g of groups) {
    for (const model of g.models) {
      const row = el("button", "model-pill-item");
      row.type = "button";
      row.append(el("span", "model-pill-item-name", multiGroup ? `${g.name} / ${model.name}` : model.name));
      if (m && m.provider === g.id && m.model === model.id) {
        currentInList = true;
        row.append(el("span", "model-pill-item-check", "✓"));
      }
      row.addEventListener("click", () => {
        // 选完模型后面板保持打开,可继续调推理等级;点外部或 Esc 关闭
        vscode.postMessage({ kind: "selectModel", provider: g.id, model: model.id, effort: state.models?.current?.reasoningEffort });
        renderModelPill();
      });
      modelPillList.append(row);
    }
  }
  // 当前模型不在目录(例如临时模型)时,补一个只读占位项
  if (m && !currentInList) {
    const row = el("button", "model-pill-item current-missing");
    row.type = "button";
    row.append(el("span", "model-pill-item-name", modelName(m.provider, m.model)));
    row.append(el("span", "model-pill-item-check", "✓"));
    modelPillList.prepend(row);
  }
}

function groupName(id: string): string {
  return state.models?.groups.find((g) => g.id === id)?.name ?? id;
}

function modelName(provider: string, id: string): string {
  return findModel(provider, id)?.name ?? id;
}

/** 预设胶囊 = 收起态(🧩 预设 · 名称 ▾)+ 弹层(标题 + 选项列表:图标/名称/描述/✓)。 */
function renderPresetPill() {
  const current = state.sessions.find((s) => s.sessionId === state.current);
  const presets = state.presets ?? [];
  // 服务器限制:已开始的会话预设不可更改(agent preset is fixed)。
  // 新会话显示可切换胶囊;已开始的会话只显示当前预设的纯文本标签(不提供点击下拉)。
  const switchable = (current?.blank ?? true);
  presetPill.hidden = !switchable;
  presetTag.hidden = switchable;
  if (!switchable) {
    presetTag.textContent = current?.agentPreset ? presetLabel(current.agentPreset) : "";
    presetTag.title = t("会话已开始,预设不可切换(新会话可选)");
    return;
  }
  const currentPreset = current?.agentPreset ? presets.find((p) => p.id === current.agentPreset) : undefined;
  if (currentPreset) {
    presetPillText.textContent = `${t("预设")} · ${presetDisplayText(currentPreset).name}`;
  } else if (current?.agentPreset) {
    presetPillText.textContent = `${t("预设")} · ${presetLabel(current.agentPreset)}`;
  } else {
    presetPillText.textContent = t("预设");
  }
  presetPillHead.disabled = presets.length === 0;
  // 无论弹层开合都重建列表:首次展开即有内容,投影晚到也会实时填充
  presetPillList.innerHTML = "";
  for (const preset of presets) {
    const text = presetDisplayText(preset);
    const broken = typeof preset.broken === "string" && preset.broken.length > 0;
    const row = el("button", "pp-opt" + (broken ? " danger" : ""));
    row.type = "button";
    const body = el("span", "pp-opt-body");
    body.append(
      el("span", "pp-opt-name", text.name + (preset.isDefault ? t(" · 默认") : "")),
    );
    const desc = text.description ?? (broken ? preset.broken : "");
    if (desc) body.append(el("span", "pp-opt-desc", desc));
    row.append(body);
    if (current?.agentPreset === preset.id || (presets.length === 1 && !current?.agentPreset)) {
      row.append(el("span", "pp-opt-check", "✓"));
    }
    row.addEventListener("click", () => {
      presetPillPop.hidden = true;
      presetPill.classList.remove("open");
      vscode.postMessage({ kind: "selectPreset", preset: preset.id });
      renderPresetPill();
    });
    presetPillList.append(row);
  }
}

function presetLabel(id: string): string {
  return presetName(id);
}

/**
 * 权限预设说明:优先用宿主 l10n(14 种语言都有),其次用目录下发的 description。
 * 之前把中文写在这里再做英文映射,别的语言会退化成英文。
 */
const PERMISSION_DESCRIPTION_KEYS: Record<string, string> = {
  "read-only": "perm.desc.readOnly",
  "workspace-write": "perm.desc.workspaceWrite",
  "danger-full-access": "perm.desc.dangerFullAccess",
  custom: "perm.desc.custom",
};

function permissionDescription(value: string, fromCatalog?: string): string {
  // 目录给出的英文说明作为兜底;本地 l10n 文案优先(与网页端一致)
  const localized = t(PERMISSION_DESCRIPTION_KEYS[value] ?? "");
  if (localized) return localized;
  return fromCatalog ?? "";
}

/** 权限胶囊 = 收起态(⚠ 图标 + 名称 + ▾)+ 弹层(标题/了解更多 + 选项列表:图标/名称/说明/✓)。 */
function renderPermissionPill() {
  const options = state.permissions?.options ?? [];
  const current = state.permissions?.currentValue ?? "";
  const currentOpt = options.find((o) => o.value === current);
  permissionPillIcon.textContent = permissionIcon(current);
  permissionPillText.textContent = permissionLabel(current, currentOpt?.name);
  permissionPill.classList.toggle("danger", PERMISSION_ICONS[current]?.danger === true);
  permissionPillHead.disabled = options.length === 0;
  // 无论弹层开合都重建列表:首次展开(或投影稍后才到)时内容即时可见,无需点两次
  permissionPillList.innerHTML = "";
  for (const option of options) {
    const danger = PERMISSION_ICONS[option.value]?.danger === true;
    const row = el("button", "pp-opt" + (danger ? " danger" : "") + (current === option.value ? " current" : ""));
    row.type = "button";
    row.append(el("span", "pp-opt-icon", permissionIcon(option.value)));
    const body = el("span", "pp-opt-body");
    body.append(el("span", "pp-opt-name", permissionLabel(option.value, option.name)));
    const desc = permissionDescription(option.value, option.description);
    if (desc) body.append(el("span", "pp-opt-desc", desc));
    row.append(body);
    if (current === option.value) row.append(el("span", "pp-opt-check", "✓"));
    row.addEventListener("click", () => {
      state.permissions = { ...(state.permissions ?? { options: [], currentValue: "" }), currentValue: option.value };
      renderPermissionPill();
      permissionPillPop.hidden = true;
      permissionPill.classList.remove("open");
      vscode.postMessage({ kind: "permission", preset: option.value });
    });
    permissionPillList.append(row);
  }
  // 当前权限不在预设列表(自定义组合)时,补一个只读占位项
  if (current && !currentOpt) {
    const row = el("button", "pp-opt current");
    row.type = "button";
    row.append(el("span", "pp-opt-icon", permissionIcon(current)));
    const body = el("span", "pp-opt-body");
    body.append(el("span", "pp-opt-name", permissionLabel(current)));
    row.append(body, el("span", "pp-opt-check", "✓"));
    permissionPillList.prepend(row);
  }
}

/**
 * 紧凑 token 计数(网页端 context 面板同款):<1000 原样,<1e6 用 K,否则用 M;
 * 缩放后 ≥100 取整,否则保留一位小数。
 */
function fmtCompactTokens(value: number): string {
  const scaled = (candidate: number) => (candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10));
  if (!Number.isFinite(value) || value < 0) return "0";
  if (value < 1e3) return String(Math.round(value));
  if (value < 1e6) return `${scaled(value / 1e3)}K`;
  return `${scaled(value / 1e6)}M`;
}

/** 上下文进度环的分段配色(与网页端 ContextMeter 的三个色相同一取值)。 */
const CONTEXT_SEGMENTS: { key: "systemTokens" | "toolsTokens" | "messageTokens"; tint: string; label: () => string }[] = [
  { key: "systemTokens", tint: "#adb2b8", label: () => t("系统提示词") },
  { key: "toolsTokens", tint: "#a78bfa", label: () => t("工具定义") },
  { key: "messageTokens", tint: "#4d93f8", label: () => t("对话消息") },
];

/**
 * 上下文占用分档:≥90% 危险(大概率下一次请求就被拒绝或压缩),≥75% 警告。
 * 宿主自动压缩(compaction-basic)默认阈值是窗口的 80%,所以 75% 起就有意义:
 * 用户此时手动 /compact 或换模型,比等到被拒绝后再补救便宜得多。
 */
function contextUsageTier(percent: number): "warn" | "critical" | undefined {
  if (percent >= 90) return "critical";
  if (percent >= 75) return "warn";
  return undefined;
}

/**
 * 渲染上下文进度环与分类面板(网页端 composer ContextMeter 同款):
 * 读数取 contextPressure 投影(projectedTokens 优先,退化到 pressureTokens),
 * 分类取 0.1.5 的 contextBreakdown 投影(系统提示词 / 工具定义 / 对话消息);
 * 两者缺一即隐藏整个控件(与网页端"没有容量就不显示"一致)。
 * ≥75% / ≥90% 分别进入警告与危险配色,并在面板里给出可操作建议(issue #19:
 * 此前占用涨到 100% 也没有任何提示,直到请求被拒绝)。
 */
function renderContextMeter() {
  const c = state.context;
  const used = typeof c?.projectedTokens === "number" ? c.projectedTokens : c?.pressureTokens;
  if (used === undefined || typeof c?.contextWindow !== "number" || c.contextWindow <= 0) {
    contextMeter.hidden = true;
    contextMeterPanel.hidden = true;
    contextMeter.classList.remove("open");
    return;
  }
  contextMeter.hidden = false;
  const percent = Math.max(0, Math.min(100, Math.round((used / c.contextWindow) * 100)));
  const tier = contextUsageTier(percent);
  contextMeter.dataset.tier = tier ?? "ok";
  // 圆环填充:strokeDasharray = 周长 * 百分比
  contextMeterFill.setAttribute("stroke-dasharray", `${(CTX_RING_CIRCUMFERENCE * percent) / 100} ${CTX_RING_CIRCUMFERENCE}`);
  const reading = `${percent}%`;
  // 本地化读数模板(en: "{p} of context used" / zh: "上下文已用 {p}"),按 {p} 拆出前后缀,
  // 百分比单独着色,词序仍由各语言词典决定
  const template = t("上下文已用 {p}");
  const [headBefore = "", headAfter = ""] = template.split("{p}").map((part) => part.trim());
  const tierHint = tier === "critical" ? t("接近模型上限,建议先压缩上下文") : tier === "warn" ? t("上下文接近上限,可考虑压缩") : "";
  contextMeterBtn.title = tierHint ? `${template.replace("{p}", reading)} · ${tierHint}` : template.replace("{p}", reading);
  contextMeterBtn.setAttribute("aria-label", contextMeterBtn.title);
  contextMeterPanel.setAttribute("aria-label", template.replace("{p}", "").trim());

  const breakdown = state.breakdown;
  const breakdownTotal = breakdown === undefined ? 0 : breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens;
  const segments: { key: string; tint?: string; width: number }[] =
    breakdown === undefined || breakdownTotal === 0
      ? [{ key: "total", width: percent }]
      : CONTEXT_SEGMENTS.map((row) => ({ key: row.key, tint: row.tint, width: (percent * breakdown[row.key]) / breakdownTotal })).filter((part) => part.width > 0);

  contextMeterPanel.innerHTML = "";
  const header = el("div", "cm-header");
  const headlineBefore = el("span", "cm-headline", headBefore);
  const percentEl = el("span", "cm-percent", reading);
  const headlineAfter = el("span", "cm-headline", headAfter);
  const figures = el("span", "cm-figures", `~${fmtCompactTokens(used)} / ${fmtCompactTokens(c.contextWindow)}`);
  header.append(headlineBefore, percentEl, headlineAfter, figures);
  const bar = el("div", "cm-bar");
  for (const segment of segments) {
    const part = el("div", "cm-segment");
    if (segment.tint) part.style.background = segment.tint;
    part.style.width = `${segment.width}%`;
    bar.append(part);
  }
  contextMeterPanel.append(header, bar);
  if (breakdown !== undefined) {
    const rows = el("dl", "cm-rows");
    for (const row of CONTEXT_SEGMENTS) {
      const line = el("div", "cm-row");
      const term = el("dt");
      const swatch = el("span", "cm-swatch");
      swatch.style.background = row.tint;
      term.append(swatch, document.createTextNode(row.label()));
      const value = el("dd", undefined, `~${fmtCompactTokens(breakdown[row.key])}`);
      line.append(term, value);
      rows.append(line);
    }
    contextMeterPanel.append(rows);
  }
  // 建议行动:只在越过分档阈值时出现(平时保持面板干净),点击直接执行 /compact
  if (tier) {
    const hint = el("div", "cm-hint", tier === "critical" ? t("上下文接近模型上限,建议压缩后再继续") : t("上下文已用 {p},可考虑压缩", { p: reading }));
    const compact = el("button", "cm-hint-action", t("压缩上下文"));
    compact.type = "button";
    compact.addEventListener("click", () => {
      contextMeterPanel.hidden = true;
      contextMeter.classList.remove("open");
      vscode.postMessage({ kind: "command", line: "/compact" });
    });
    hint.append(" ", compact);
    contextMeterPanel.append(hint);
  }
}

// ---------- 任务清单(网页端 TodoPanel 同款:标题 + 进度摘要 + 可折叠清单) ----------

/** 任务清单是否展开(与网页端一致默认收起;跨重渲染保留用户选择)。 */
let todoExpanded = false;
let todoGlyphSeq = 0;

/**
 * 任务状态图标(网页端 TodoPanel 的 14×14 三种图元):
 * completed = 实线圆 + 对勾;in_progress = 渐变缺口圆环(CSS 旋转);pending = 虚线圆。
 */
function todoStatusGlyph(status: string): SVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("viewBox", "0 0 14 14");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  if (status === "in_progress") {
    const gradientId = `todo-spin-${(todoGlyphSeq += 1)}`;
    const defs = document.createElementNS(SVG_NS, "defs");
    const gradient = document.createElementNS(SVG_NS, "linearGradient");
    gradient.setAttribute("id", gradientId);
    gradient.setAttribute("x1", "2.5");
    gradient.setAttribute("y1", "12");
    gradient.setAttribute("x2", "10.5");
    gradient.setAttribute("y2", "3.5");
    gradient.setAttribute("gradientUnits", "userSpaceOnUse");
    const stopStart = document.createElementNS(SVG_NS, "stop");
    stopStart.setAttribute("stop-color", "currentColor");
    const stopEnd = document.createElementNS(SVG_NS, "stop");
    stopEnd.setAttribute("offset", "1");
    stopEnd.setAttribute("stop-color", "currentColor");
    stopEnd.setAttribute("stop-opacity", "0");
    gradient.append(stopStart, stopEnd);
    defs.append(gradient);
    const ring = document.createElementNS(SVG_NS, "circle");
    ring.setAttribute("cx", "7");
    ring.setAttribute("cy", "7");
    ring.setAttribute("r", "6.4");
    ring.setAttribute("stroke", `url(#${gradientId})`);
    ring.setAttribute("stroke-width", "1.2");
    svg.setAttribute("class", "todo-glyph-progress");
    svg.append(defs, ring);
    return svg;
  }
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", "7");
  circle.setAttribute("cy", "7");
  circle.setAttribute("r", "6.4");
  circle.setAttribute("stroke", "currentColor");
  circle.setAttribute("stroke-width", "1.2");
  svg.append(circle);
  if (status === "completed") {
    const check = document.createElementNS(SVG_NS, "path");
    check.setAttribute(
      "d",
      "M10.9631 5.71411L7.70154 8.97571C7.48011 9.19714 7.27736 9.40099 7.09229 9.54993C6.89742 9.70669 6.66314 9.85279 6.3634 9.90027C6.2049 9.92534 6.04339 9.92534 5.88489 9.90027C5.58515 9.85279 5.35087 9.70669 5.15601 9.54993C4.97093 9.40099 4.76818 9.19714 4.54675 8.97571L3.03516 7.46411L3.96313 6.53613L5.47473 8.04773C5.7169 8.28989 5.86196 8.43389 5.97888 8.52795C6.08597 8.61409 6.10875 8.60701 6.08997 8.604C6.11259 8.60758 6.13571 8.60758 6.15833 8.604C6.13954 8.60701 6.16232 8.61409 6.26941 8.52795C6.38633 8.43389 6.53139 8.28989 6.77356 8.04773L10.0352 4.78613L10.9631 5.71411Z",
    );
    check.setAttribute("fill", "currentColor");
    svg.setAttribute("class", "todo-glyph-completed");
    svg.append(check);
    return svg;
  }
  circle.setAttribute("stroke-dasharray", "2.4 2.4");
  svg.setAttribute("class", "todo-glyph-pending");
  return svg;
}

/** 待办事项面板(网页端 TodoPanel 同款:14px 图标 + 标题 + 进度摘要 + 折叠清单)。 */
function renderTodos() {
  todoPanel.innerHTML = "";
  const list = state.todos;
  if (!Array.isArray(list) || list.length === 0) {
    todoPanel.hidden = true;
    return;
  }
  todoPanel.hidden = false;
  todoPanel.setAttribute("aria-label", t("任务"));
  const done = list.filter((item) => item.status === "completed").length;
  const active = list.filter((item) => item.status === "in_progress").length;
  const pending = list.length - done - active;
  // 与网页端一致:只列出非零的状态,用 · 连接
  const progress = [
    ...(done > 0 ? [t("{n} 已完成", { n: String(done) })] : []),
    ...(active > 0 ? [t("{n} 进行中", { n: String(active) })] : []),
    ...(pending > 0 ? [t("{n} 待处理", { n: String(pending) })] : []),
  ].join(" · ");

  const body = el("div", "todo-body");
  const header = el("button", "todo-header");
  header.type = "button";
  header.setAttribute("aria-expanded", String(todoExpanded));
  const lead = el("span", "todo-lead");
  lead.append(lineIcon(ICONS.list, 13));
  const title = el("span", "todo-title", t("任务"));
  const progressEl = el("span", "todo-progress", progress);
  const chevron = el("span", "todo-chevron");
  chevron.append(lineIcon(todoExpanded ? ICONS.up2 : ICONS.down2, 12));
  header.append(lead, title, progressEl, chevron);
  header.addEventListener("click", () => {
    todoExpanded = !todoExpanded;
    renderTodos();
  });
  body.append(header);
  if (todoExpanded) {
    const ul = el("ul", "todo-list");
    for (const item of list) {
      const li = el("li", "todo-item");
      li.dataset.status = item.status;
      const glyph = el("span", "todo-glyph");
      glyph.append(todoStatusGlyph(item.status));
      li.append(glyph, el("span", "todo-content", item.content));
      ul.append(li);
    }
    body.append(ul);
  }
  todoPanel.append(body);
}

function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "-";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m${rs}s`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}m`;
}

function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "-";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}G`;
  if (n >= 1e6) return `${Math.round(n / 1e6)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(Math.round(n));
}

/**
 * 无投影时的兜底统计(网页端 deriveStats 同款思路:从已折叠事件推导)。
 * 覆盖"统计栏时有时无"的问题 —— sessionStats 投影帧并非总会到达,本地事件永远在。
 */
function deriveStatsFromEvents(events: WireEvent[]) {
  const turns = new Set<number>();
  const stepStart = new Map<string, number>();
  const firstDelta = new Map<string, number>();
  const lastDelta = new Map<string, number>();
  const callTime = new Map<string, number>();
  const llmByStep = new Map<string, number>();
  const derivedUsage = { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, seen: false };
  let toolMs = 0;
  let decodeTokens = 0;
  for (const wire of events) {
    const ev = wire.event;
    const data: any = ev.data ?? {};
    const turn = typeof data.turn === "number" ? data.turn : undefined;
    const step = typeof data.step === "number" ? data.step : undefined;
    const key = turn !== undefined && step !== undefined ? `${turn}:${step}` : undefined;
    switch (ev.type) {
      case "turn/start":
        if (turn !== undefined) turns.add(turn);
        break;
      case "step/start":
        if (key) stepStart.set(key, ev.time);
        break;
      case "tool/call":
        if (typeof data.callId === "string") callTime.set(data.callId, ev.time);
        break;
      case "tool/result": {
        const callId = data?.message?.source?.callId;
        const t0 = typeof callId === "string" ? callTime.get(callId) : undefined;
        if (t0 !== undefined) {
          toolMs += Math.max(0, ev.time - t0);
          callTime.delete(callId);
        }
        break;
      }
      case "assistant/chunk":
        if (key && data?.chunk?.type === "text-delta") {
          if (!firstDelta.has(key)) firstDelta.set(key, ev.time);
          lastDelta.set(key, ev.time);
        }
        break;
      case "assistant/message":
        if (key) {
          const t0 = stepStart.get(key);
          if (t0 !== undefined) llmByStep.set(key, Math.max(0, ev.time - t0));
        }
        // 用量兜底:投影(tokenUsage)只在宿主动作后异步到达,回合进行中先按
        // assistant/message 自带的 usage 累加,这样底部胶囊全程可见而不是切换会话后才有。
        {
          const usage = data?.usage as
            | { uncachedInputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number; outputTokens?: number }
            | undefined;
          const out = usage?.outputTokens;
          if (typeof out === "number") derivedUsage.outputTokens += out;
          if (typeof usage?.uncachedInputTokens === "number") derivedUsage.uncachedInputTokens += usage.uncachedInputTokens;
          if (typeof usage?.cacheReadTokens === "number") derivedUsage.cacheReadTokens += usage.cacheReadTokens;
          if (typeof usage?.cacheWriteTokens === "number") derivedUsage.cacheWriteTokens += usage.cacheWriteTokens;
          if (usage !== undefined) derivedUsage.seen = true;
        }
        break;
    }
  }
  let llmMs = 0;
  for (const v of llmByStep.values()) llmMs += v;
  let ttftMs = 0;
  let ttftSteps = 0;
  let decodeMs = 0;
  for (const [key, t0] of stepStart) {
    const first = firstDelta.get(key);
    if (first !== undefined) {
      ttftMs += Math.max(0, first - t0);
      ttftSteps += 1;
      decodeMs += Math.max(0, (lastDelta.get(key) ?? first) - first);
    }
  }
  return { turns: turns.size, steps: stepStart.size, llmMs, toolMs, ttftMs, ttftSteps, decodeMs, decodeTokens, usage: derivedUsage };
}

function renderStatsLine() {
  const projected = state.stats?.sessionStats as {
    steps?: number; turns?: number; llmMs?: number; toolMs?: number;
    ttftMs?: number; ttftSteps?: number; decodeMs?: number; decodeTokens?: number;
  } | undefined;
  const tu = state.stats?.tokenUsage;
  // 派生值同时用于两块:轮/步统计与 token 用量。
  // 宿主的 tokenUsage 投影只在回合动作后异步到达,派生值保证回合进行中胶囊也在。
  const derived = deriveStatsFromEvents(state.rawEvents);
  const st = (projected?.steps ?? 0) > 0 ? projected : derived.steps > 0 ? derived : undefined;
  const usage = (() => {
    if (tu !== undefined && (billedInputTokens(tu) > 0 || Number(tu.outputTokens ?? 0) > 0)) return tu;
    const d = derived.usage;
    return d.seen && (billedInputTokens(d) > 0 || d.outputTokens > 0) ? d : undefined;
  })();
  const hasStats = st !== undefined && (st.steps ?? 0) > 0;
  const hasTokens = usage !== undefined;
  statsLine.innerHTML = "";
  statsLine.hidden = hasStats === false && hasTokens === false;
  if (!hasStats && !hasTokens) return;
  // 网页端 StatsPills 同款:两枚胶囊(会话统计 / Token 用量),点击展开明细弹层
  if (hasStats) statsLine.append(buildSessionStatsPill(st!));
  if (hasTokens) statsLine.append(buildSessionUsagePill(usage!));
}

/** 提示词侧计费输入 = 未缓存输入 + 缓存读取 + 缓存写入(网页端 billedInputTokens 同款)。 */
function billedInputTokens(usage: { uncachedInputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number }): number {
  return Number(usage.uncachedInputTokens ?? 0) + Number(usage.cacheReadTokens ?? 0) + Number(usage.cacheWriteTokens ?? 0);
}

/** 紧凑时长(网页端 formatDuration 同款):<60 秒保留一位小数,否则「{m}分{s}秒」。 */
function formatCompactDuration(ms: number): string {
  const seconds = Math.max(0, ms) / 1000;
  if (seconds < 60) return t("{seconds}秒", { seconds: String(Math.round(seconds * 10) / 10) });
  const whole = Math.round(seconds);
  return t("{minutes}分{seconds}秒", { minutes: String(Math.floor(whole / 60)), seconds: String(whole % 60) });
}

/** 解码速度数值(网页端 formatTokensPerSecond 同款):≥10 取整,否则保留一位小数。 */
function formatTokensPerSecond(tps: number): string {
  const clamped = Math.max(0, Number.isFinite(tps) ? tps : 0);
  return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10);
}

/**
 * 缓存命中占比(网页端 formatCacheHitPercent 同款):四舍五入到整数,
 * 但**绝不把部分命中显示成 100%** —— 会逐位增加小数位直到显示值小于 100;
 * 完全没有提示词输入时返回 null。
 */
function cacheHitPercentText(cacheReadTokens: number, promptTokens: number): string | null {
  if (!Number.isFinite(cacheReadTokens) || !Number.isFinite(promptTokens) || promptTokens <= 0) return null;
  if (promptTokens - cacheReadTokens <= 0) return "100";
  const ratio = cacheReadTokens / promptTokens;
  for (let places = 0; places <= 4; places += 1) {
    const scale = 10 ** places;
    const rounded = Math.round(ratio * 100 * scale) / scale;
    if (rounded < 100) return String(rounded);
  }
  return String(Math.floor(ratio * 100 * 1e4) / 1e4);
}

/** 统计弹层骨架(网页端 stat-dialog 同款:标题[+ 右侧总量] + 分隔线 + 两列明细)。 */
function statDialog(menu: HTMLElement, icon: string, title: string, value: string | undefined, rows: [string, string][]) {
  menu.classList.add("turn-stat-pop");
  const head = el("div", "ts-title");
  head.append(lineIcon(icon, 13), el("span", undefined, title));
  if (value !== undefined) head.append(el("span", "ts-title-value", value));
  menu.append(head, el("div", "ts-rule"));
  const list = el("dl", "ts-rows");
  for (const [label, text] of rows) list.append(el("dt", undefined, label), el("dd", undefined, text));
  menu.append(list);
}

/** 会话统计胶囊:仪表盘图标 + 「{n} 轮 {m} 步 · {tps} tok/s」,点击展开模型/工具用时与 TTFT、TPS。 */
function buildSessionStatsPill(st: {
  steps?: number; turns?: number; llmMs?: number; toolMs?: number;
  ttftMs?: number; ttftSteps?: number; decodeMs?: number; decodeTokens?: number;
}): HTMLElement {
  const wrap = el("span", "stat-pill");
  const counts = t("{turns} 轮 {steps} 步", { turns: String(st.turns ?? 0), steps: String(st.steps ?? 0) });
  const decodeMs = Number(st.decodeMs ?? 0);
  const tpsText = decodeMs > 0 ? t("{tps} tok/s", { tps: formatTokensPerSecond(Number(st.decodeTokens ?? 0) / (decodeMs / 1000)) }) : null;
  const label = el("span", "stat-pill-label");
  label.append(el("span", undefined, counts));
  if (tpsText !== null) label.append(el("span", "stat-pill-sep", "·"), el("span", undefined, tpsText));
  const detailed = Number(st.llmMs ?? 0) > 0 || Number(st.toolMs ?? 0) > 0 || Number(st.ttftSteps ?? 0) > 0 || decodeMs > 0;
  if (!detailed) {
    // 无耗时数据:与网页端一致,渲染为不可点开的静态胶囊
    const plain = el("span", "stat-pill-static");
    plain.append(lineIcon(ICONS.gauge, 13), label);
    wrap.append(plain);
    return wrap;
  }
  const btn = el("button", "stat-pill-btn") as HTMLButtonElement;
  btn.type = "button";
  btn.title = t("会话统计");
  btn.append(lineIcon(ICONS.gauge, 13), label);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    openAnchoredMenu(
      btn,
      (menu) => {
        const rows: [string, string][] = [];
        if (Number(st.llmMs ?? 0) > 0) rows.push([t("模型用时"), formatCompactDuration(Number(st.llmMs))]);
        if (Number(st.toolMs ?? 0) > 0) rows.push([t("工具调用用时"), formatCompactDuration(Number(st.toolMs))]);
        if (Number(st.ttftSteps ?? 0) > 0) rows.push([t("首 token 平均（TTFT）"), formatCompactDuration(Number(st.ttftMs ?? 0) / Number(st.ttftSteps))]);
        if (decodeMs > 0) rows.push([t("输出速度（TPS）"), t("{tps} tok/s", { tps: formatTokensPerSecond(Number(st.decodeTokens ?? 0) / (decodeMs / 1000)) })]);
        statDialog(menu, ICONS.gauge, t("会话统计"), undefined, rows);
      },
      () => setStatPillOpen(btn, false),
    );
    setStatPillOpen(btn, true);
  });
  wrap.append(btn);
  return wrap;
}

/** Token 用量胶囊:数据库图标 + 「71M tok · 缓存命中 99.6%」,点击展开精确明细。 */
function buildSessionUsagePill(usage: {
  uncachedInputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number; outputTokens?: number;
}): HTMLElement {
  const wrap = el("span", "stat-pill");
  const billed = billedInputTokens(usage);
  const output = Number(usage.outputTokens ?? 0);
  const total = billed + output;
  const cacheHit = cacheHitPercentText(Number(usage.cacheReadTokens ?? 0), billed);
  const exact = (value: number) => `${Math.round(value).toLocaleString()} tok`;
  const label = el("span", "stat-pill-label");
  label.append(el("span", undefined, `${fmtCompactTokens(total)} tok`));
  if (cacheHit !== null) label.append(el("span", "stat-pill-sep", "·"), el("span", undefined, t("缓存命中 {p}%", { p: cacheHit })));
  const btn = el("button", "stat-pill-btn") as HTMLButtonElement;
  btn.type = "button";
  btn.title = t("Token 用量");
  btn.append(lineIcon(ICONS.database, 13), label);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    openAnchoredMenu(
      btn,
      (menu) => {
        const rows: [string, string][] = [];
        if (cacheHit !== null) rows.push([t("缓存命中"), `${cacheHit}%`]);
        rows.push([t("未缓存输入"), exact(Number(usage.uncachedInputTokens ?? 0))]);
        rows.push([t("缓存读取"), exact(Number(usage.cacheReadTokens ?? 0))]);
        if (Number(usage.cacheWriteTokens ?? 0) !== 0) rows.push([t("缓存写入"), exact(Number(usage.cacheWriteTokens))]);
        rows.push([t("输出"), exact(output)]);
        statDialog(menu, ICONS.database, t("Token 用量"), exact(total), rows);
      },
      () => setStatPillOpen(btn, false),
    );
    setStatPillOpen(btn, true);
  });
  wrap.append(btn);
  return wrap;
}

/** 同步胶囊的展开态(样式 + 无障碍属性),关闭弹层时复位。 */
function setStatPillOpen(btn: HTMLElement, open: boolean) {
  btn.classList.toggle("open", open);
  btn.setAttribute("aria-expanded", String(open));
}

// ---------- 附件行 ----------

function renderAttachments() {
  attachmentsRow.innerHTML = "";
  attachmentsRow.append(btnAddAttach);
  const list = state.attachments;
  for (const a of list) {
    const chip = el("span", "attachment-chip clickable" + (a.auto ? " auto" : ""));
    chip.title = `${t(a.kind === "folder" ? "点击在资源管理器中显示" : "点击查看文件")} · ${a.path}`;
    chip.append(lineIcon(a.kind === "folder" ? ICONS.box : ICONS.copy, 12));
    chip.append(el("span", "attachment-label", (a.auto ? t("激活文件 · ") : "") + a.label));
    const close = el("button", "chip-close", "×");
    close.title = t("移除附件");
    chip.append(close);
    // 点击芯片正文即可查看:文件在编辑器中打开(二进制/图片走默认查看器),文件夹在资源管理器中定位;
    // 右键菜单另给「用默认应用打开」。× 只负责移除,不触发打开。
    chip.addEventListener("click", () => {
      if (a.kind === "folder") vscode.postMessage({ kind: "revealInExplorer", path: a.path });
      else vscode.postMessage({ kind: "openFile", path: a.path });
    });
    chip.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openAttachmentMenu(chip, a);
    });
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      if (a.auto) {
        state.autoAttachActive = false;
        state.activeFile = null;
      }
      state.attachments = state.attachments.filter((x) => x !== a);
      renderAttachments();
    });
    attachmentsRow.append(chip);
  }
  // 图片附件与文件/文件夹附件同行(+ 号右侧):统一渲染,避免图片单独出现在输入区顶部
  renderImageChips();
}

/** 附件芯片的右键菜单:查看 / 用默认应用打开 / 在资源管理器中显示 / 移除。 */
function openAttachmentMenu(chip: HTMLElement, a: { kind: "file" | "folder"; path: string; label: string }) {
  openAnchoredMenu(chip, (menu) => {
    const add = (icon: string, label: string, action: () => void) => {
      const row = el("button", "plus-menu-item");
      row.append(lineIcon(icon), el("span", "menu-item-label", label));
      row.addEventListener("click", () => {
        closeActivePopover();
        action();
      });
      menu.append(row);
    };
    if (a.kind === "file") {
      add(ICONS.eye, t("查看文件"), () => vscode.postMessage({ kind: "openFile", path: a.path }));
      add(ICONS.rightUp, t("用默认应用打开"), () => vscode.postMessage({ kind: "openInDefaultApp", path: a.path }));
    }
    add(ICONS.folder, t("在资源管理器中显示"), () => vscode.postMessage({ kind: "revealInExplorer", path: a.path }));
    add(ICONS.x, t("移除附件"), () => {
      state.attachments = state.attachments.filter((x) => x.path !== a.path);
      renderAttachments();
    });
  });
}

/** 同步自动附加的激活文件。 */
function syncActiveFileAttachment() {
  const existing = state.attachments.find((a) => a.auto);
  if (existing) {
    state.attachments = state.attachments.filter((a) => !a.auto);
  }
  if (state.autoAttachActive && state.activeFile) {
    state.attachments.unshift({
      kind: "file",
      path: state.activeFile.path,
      label: state.activeFile.label,
      auto: true,
    });
  }
  renderAttachments();
}

// ---------- 图片附件(官方 image 内容块,与文件附件同排显示) ----------

function renderImageChips() {
  for (const img of state.images) {
    const chip = el("span", "attachment-chip image-chip clickable");
    chip.title = `${t("点击查看图片")} · ${img.name}`;
    chip.append(lineIcon(ICONS.image, 12));
    chip.append(el("span", "attachment-label", img.name));
    const close = el("button", "chip-close", "×");
    close.title = t("移除附件");
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      state.images = state.images.filter((x) => x !== img);
      renderAttachments();
    });
    chip.append(close);
    // 点击查看大图:宿主用 vscode.open 打开内存里的图片(不落盘、不改工作区)
    chip.addEventListener("click", () => openImagePreview(img));
    attachmentsRow.append(chip);
  }
}

/** 图片附件预览弹层:输入区已持有 dataURL,直接显示即可(与消息内联图片同源数据)。 */
function openImagePreview(img: { data: string; mediaType: string; name: string }) {
  const overlay = el("div", "image-preview-overlay");
  const box = el("div", "image-preview-box");
  const head = el("div", "image-preview-head");
  head.append(el("span", "image-preview-name", img.name));
  const actions = el("span", "image-preview-actions");
  const openBtn = el("button", "mini-btn", t("用默认应用打开"));
  openBtn.title = t("先把图片保存为临时文件,再交给系统默认应用");
  openBtn.addEventListener("click", () => vscode.postMessage({ kind: "openImageExternally", data: img.data, mediaType: img.mediaType, name: img.name }));
  const closeBtn = el("button", "mini-btn", t("关闭"));
  actions.append(openBtn, closeBtn);
  head.append(actions);
  const image = el("img", "image-preview-img") as HTMLImageElement;
  image.src = `data:${img.mediaType};base64,${img.data}`;
  image.alt = img.name;
  box.append(head, image);
  overlay.append(box);
  const close = () => overlay.remove();
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", function onKey(e) {
    if (e.key !== "Escape") return;
    document.removeEventListener("keydown", onKey);
    close();
  });
  document.body.append(overlay);
}

function applyAttachmentData(msg: { attachmentId: string; data?: string; mediaType?: string; error?: string }) {
  const frame = document.querySelector<HTMLElement>(`.msg-image-frame[data-attachment-id="${msg.attachmentId}"]`);
  if (!frame) return;
  frame.innerHTML = "";
  if (msg.error || !msg.data) {
    frame.append(el("span", "msg-image-error", `⚠️ ${msg.error ?? t("加载失败")}`));
    return;
  }
  const img = el("img", "msg-image");
  img.src = `data:${msg.mediaType ?? "image/png"};base64,${msg.data}`;
  img.alt = "image";
  frame.append(img);
}

// ---------- 子代理目录(头部按钮 + 弹层目录,不再占用对话底部空间) ----------

/** 刷新子代理按钮徽标:显示数量,有运行中的子代理时高亮。 */
function updateSubagentButton() {
  const entries = state.subagents ?? [];
  const running = entries.filter((e) => e.activity === "running").length;
  subagentsBadge.textContent = String(entries.length);
  subagentsBadge.hidden = entries.length === 0;
  btnSubagents.classList.toggle("subagents-running", running > 0);
  btnSubagents.title = running > 0 ? t("子代理目录({n} 个运行中)", { n: String(running) }) : t("子代理目录");
}

/** 打开子代理目录弹层(网页端 header catalog 的扁平版):头部右上角「刷新」,列表限高滚动。 */
function openSubagentCatalog() {
  const entries = state.subagents ?? [];
  openAnchoredMenu(btnSubagents, (menu) => {
    menu.classList.add("subagent-catalog");
    // 头部:标题 + 右上角刷新按钮(固定在列表之外,滚动时保持可见)
    const head = el("div", "subagent-catalog-head");
    head.append(el("div", "plus-menu-label", t("子代理目录")));
    // 用文字而不是图标:emoji 图标在不同主题/字体下渲染不一致,文字与头部标题同一行更清楚
    const refresh = el("button", "subagent-catalog-refresh", t("刷新"));
    refresh.title = t("重新读取子代理目录");
    refresh.addEventListener("click", () => {
      closeActivePopover();
      vscode.postMessage({ kind: "getSubagents" });
    });
    head.append(refresh);
    menu.append(head);

    // 列表区:限高 + 滚动,子代理再多也不会超出视口
    const list = el("div", "subagent-catalog-list");
    if (entries.length === 0) {
      list.append(el("div", "subagent-catalog-empty", t("(暂无子代理)")));
    } else {
      for (const entry of entries) {
        const label = entry.label ?? entry.id.slice(0, 12);
        const running = entry.activity === "running";
        const row = el("button", "plus-menu-item");
        // 子代理行同样不用 emoji:运行中是脉冲圆点,其余是静态圆点
        row.append(running ? runningDot() : el("span", "session-led led-idle"), el("span", "subagent-catalog-label", label));
        row.title = entry.mode === "one-shot" ? t("one-shot 子代理 · 点击查看记录") : t("continuable 子代理 · 点击打开对话(可追问 / 打断)");
        const sub = el("span", "subagent-catalog-sub");
        sub.textContent = entry.mode === "one-shot" ? "one-shot" : running ? t("运行中") : t("已结束");
        row.append(sub);
        row.addEventListener("click", () => {
          closeActivePopover();
          panels.openSubagent(entry.id, entry.mode === "one-shot" ? "one-shot" : "continuable", label);
        });
        list.append(row);
      }
    }
    menu.append(list);
  });
}

// ---------- 回合活动指示(输入框上方:深度思考中… 12分50秒) ----------

const TURN_ACTIVITY: Record<string, string> = {
  reasoning: "深度思考中…",
  tool: "执行工具…",
  text: "生成回答…",
};

function turnStatusLabel(kind: string): string {
  return TURN_ACTIVITY[kind] ?? "思考中…";
}

/**
 * 工具执行期间的活动文案(网页端活动行同款:直接说明正在做什么,而不是笼统的「执行工具…」)。
 * 形如「运行命令 · Write-Output hi」/「读取 · src/app.ts」/「写入 · lib/git.js」,
 * 与过程行的标题 + 摘要一致,便于在长回合里一眼看到当前动作(行可能已滚出视口)。
 */
function toolActivityLabel(name: string | undefined, args: string | undefined): string {
  return `${t(toolTitle(name))} · ${toolSummary(name, args)}`;
}

function tickTurnStatus() {
  turnStatusText.textContent = `${t(turnStatusActivity)} · ${fmtClock(Date.now() - turnStatusStartedAt)}`;
}

function startTurnStatus(time: number) {
  if (state.replaying) return; // 重放历史时跳过回合活动指示
  turnStatusStartedAt = Number.isFinite(time) ? time : Date.now();
  turnStatus.hidden = false;
  tickTurnStatus();
  if (turnStatusTimer === null) turnStatusTimer = window.setInterval(tickTurnStatus, 1000);
}

function setTurnStatusActivity(kind: string) {
  turnStatusActivity = turnStatusLabel(kind);
  if (!turnStatus.hidden) tickTurnStatus();
}

/** 直接设置活动文案(工具级:标题 + 摘要已经是本地化后的成品,不再经 t() 二次翻译)。 */
function setTurnStatusText(text: string) {
  turnStatusActivity = text;
  if (!turnStatus.hidden) tickTurnStatus();
}

/** 网页版一致的计时格式:中文 12分50秒 / 英文 12m 50s。 */
function fmtClock(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const zh = (state.lang ?? "zh-cn").toLowerCase().startsWith("zh");
  const s = Math.floor(ms / 1000);
  if (s < 60) return zh ? `${s}秒` : `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return zh ? `${m}分${rs ? `${rs}秒` : ""}` : `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return zh ? `${h}小时${rm}分` : `${h}h ${rm}m`;
}

function stopTurnStatus() {
  if (turnStatusTimer !== null) {
    window.clearInterval(turnStatusTimer);
    turnStatusTimer = null;
  }
  turnStatus.hidden = true;
}

function updateRunning() {
  updateSendButton();
  refreshSteerButtons();
  refreshActionsReveal();
}

/** 🧩 按钮徽标:待审批的 Cordis 插件数(网页端 Cordis 面板 approvals 计数同款)。 */
function updateCordisBadge() {
  const count = state.cordisRequests.size;
  cordisBadge.hidden = count === 0;
  cordisBadge.textContent = String(count);
  btnCordis.title = count > 0 ? t("Cordis 插件({n} 个待审批)", { n: String(count) }) : t("Cordis 插件");
}

/** 就地刷新所有排队卡的「插队」按钮:仅 agent 运行中的回合可插队(与网页端一致)。 */
function refreshSteerButtons() {
  const tip = t("当前回合已结束,无法插队;消息将在下一轮自动处理");
  for (const n of state.nodes) {
    if (n.kind !== "queued" || !n.el) continue;
    const btn = n.el.querySelector<HTMLButtonElement>("button[data-steer]");
    if (!btn) continue;
    if (state.running) {
      btn.disabled = false;
      btn.classList.remove("mini-btn-disabled");
      btn.removeAttribute("title");
    } else {
      btn.disabled = true;
      btn.classList.add("mini-btn-disabled");
      btn.title = tip;
    }
  }
}

/** 发送/停止合一按钮 + 提示语状态。 */
function updateSendButton() {
  const hasText = input.value.trim().length > 0 || state.images.length > 0;
  btnSendStop.innerHTML = "";
  if (state.running && !hasText) {
    btnSendStop.append(lineIcon(ICONS.stop, 15));
    btnSendStop.className = "btn-icon-btn send-btn stop-active";
    btnSendStop.title = t("停止回复");
    hint.textContent = t("运行中 · ⏹ 停止");
  } else {
    btnSendStop.append(lineIcon(ICONS.send, 16));
    btnSendStop.className = "btn-icon-btn send-btn";
    btnSendStop.title = state.running ? t("发送(运行中,消息将排队)") : t("发送(Enter)");
    // 空闲态提示沿用当前发送快捷键(issue #21 第 1 条),不要在这里写死 Enter 文案
    if (state.running) hint.textContent = t("运行中 · 消息将排队发送");
    else refreshComposerHint();
  }
  btnSendStop.disabled = !state.current;
}

function updateStatus(status: HubStatus) {
  state.status = status;
  // 预设作者能力(0.1.7-rc.2 起宿主移除该端点族):设置面板据此显示/隐藏作者按钮
  if (typeof status.presetAuthoring === "boolean") state.presetAuthoring = status.presetAuthoring;
  if (status.serverUp && status.muxConnected) {
    statusDot.className = "status-dot ok";
    statusText.textContent = status.model ? t("已连接 · {model}", { model: status.model }) : t("已连接");
  } else if (status.serverStarting) {
    statusDot.className = "status-dot starting";
    statusText.textContent = t("启动中…");
  } else if (status.serverUp) {
    statusDot.className = "status-dot starting";
    statusText.textContent = t("连接中…");
  } else {
    statusDot.className = "status-dot err";
    statusText.textContent = t("未连接 · 点击重试");
    statusDot.onclick = () => vscode.postMessage({ kind: "startServer" });
    return;
  }
  statusDot.onclick = null;
}

function scrollToBottom() {
  if (state.replaying) return; // 重放历史时跳过滚动(避免每次插入都触发强制布局)
  const nearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 260;
  if (nearBottom) messages.scrollTop = messages.scrollHeight;
}

/** 顶部"加载更早的消息"按钮:仅在服务器确认还有更早历史时显示。 */
function renderLoadMoreButton() {
  if (!state.hasMore || !state.current) return;
  const loadMore = el("button", "btn btn-load-more", t("⬆ 加载更早的消息"));
  loadMore.addEventListener("click", () => vscode.postMessage({ kind: "loadMore" }));
  messages.prepend(loadMore);
}

// ---------- 审批 / 提问 ----------

/** 提问分页流会话状态(frameRpcId → 草稿 / 页码 / 折叠),跨 renderPending 重建保留 —— 与网页端 rc.7「提问卡片可折叠并保留草稿」一致。 */
interface QuestionFlowState {
  drafts: { selected: string[]; custom: string; skipped: boolean }[];
  index: number;
  minimized: boolean;
}
const questionFlows = new Map<string, QuestionFlowState>();

function renderPending() {
  pendingArea.innerHTML = "";
  for (const approval of state.approvals.values()) {
    // 网页端 ApprovalFlow 同款:色点条 + 工具徽标 + 原因(缺省越权说明)+ 命令预览 + [拒绝][允许一次]
    const card = el("div", "pending-card pending-approval approval-card");
    const head = el("div", "approval-head");
    head.append(el("span", "approval-dot"), el("span", "approval-title", t("等待审批")));
    card.append(head);
    const body = el("div", "approval-body");
    const toolChip = el("span", "approval-tool", `${toolIcon(approval.toolName)} ${approval.toolName ?? "tool"}`);
    body.append(toolChip);
    const headline = el(
      "div",
      "approval-headline",
      approval.reason ?? t("工具 {toolName} 请求越权执行", { toolName: approval.toolName ?? "" }),
    );
    body.append(headline);
    // 命令预览:从对话中查找该调用的参数(网页端 command 行同款)
    const callNode = approval.callId ? state.nodes.find((n) => n.kind === "tool" && n.callId === approval.callId) : undefined;
    const args = callNode?.args ?? "";
    if (args) {
      const pre = el("pre", "approval-command", String(args).replace(/\s+/g, " ").slice(0, 160));
      body.append(pre);
    }
    card.append(body);
    const actions = el("div", "approval-actions");
    const reject = el("button", "btn btn-reject", t("拒绝"));
    const allow = el("button", "btn btn-allow", t("允许一次"));
    allow.addEventListener("click", () => {
      vscode.postMessage({ kind: "respond", approvalId: approval.approvalId, outcome: "allowed-once" });
      state.approvals.delete(approval.approvalId);
      renderPending();
    });
    reject.addEventListener("click", () => {
      vscode.postMessage({ kind: "respond", approvalId: approval.approvalId, outcome: "rejected" });
      state.approvals.delete(approval.approvalId);
      renderPending();
    });
    actions.append(reject, allow);
    card.append(actions);
    pendingArea.append(card);
  }
  for (const question of state.questions.values()) {
    const items = question.questions;
    const planItems = items.filter((i) => (i as { intent?: { kind?: string } }).intent?.kind === "plan-review" && i.detail);
    const normalItems = items.filter((i) => !planItems.includes(i));

    // ---------- 计划审批卡片(对齐网页端 PlanReviewPanel:查看全文 / 补充意见 / 拒绝 / 确认执行) ----------
    for (const item of planItems) {
      // 记住全文:查看全文、关闭审阅后复查、以及计划文件按钮都从这里取
      state.planReview = { text: item.detail ?? "", title: (item as { header?: string }).header || undefined, frameRpcId: question.frameRpcId };
      const card = el("div", "pending-card pending-question plan-card");
      const head = el("div", "question-head");
      head.append(lineIcon(ICONS.ledger, 14), el("span", "question-head-title", t("计划待审")));
      const headActions = el("div", "plan-head-actions");
      // 网页端 PlanPreview 的入口:在卡片内只放摘要区,全文用覆盖层看(可滚动、14px/1.75)
      const fullBtn = el("button", "plan-link", t("查看全文"));
      fullBtn.title = t("在整页预览中查看完整计划");
      fullBtn.addEventListener("click", () => openPlanPreview());
      headActions.append(fullBtn);
      // 计划已落盘为 .dsh/plans/plan-*.md 时,额外提供「打开计划文件」
      if (typeof state.planFile === "string" && state.planFile) {
        const fileBtn = el("button", "plan-link", t("打开计划文件"));
        fileBtn.title = state.planFile;
        fileBtn.addEventListener("click", () => vscode.postMessage({ kind: "openFile", path: String(state.planFile) }));
        headActions.append(fileBtn);
      }
      head.append(headActions);
      card.append(head);
      const planBox = el("div", "plan-detail-box");
      setHtml(planBox, item.detail ?? "");
      card.append(planBox);
      const intent = (item as { intent?: { kind?: string; approve?: string } }).intent;
      const approveOption = item.options?.find((o) => o.label === intent?.approve);
      const declineOption = item.options?.find((o) => o.label !== intent?.approve);
      // 与 Claude Code 一致:直接在审批内输入修改意见,回车发送自定义回答(不批准也不拒绝);
      // 0.1.1-rc.1 起支持多行(Shift+Enter 换行,自动换行)
      const sendCustom = () => {
        const text = customInput.value.trim();
        if (!text) return;
        vscode.postMessage({
          kind: "answer",
          frameRpcId: question.frameRpcId,
          answers: [{ id: item.id, selected: [], custom: text }],
        });
        state.questions.delete(question.frameRpcId);
        renderPending();
      };
      const customRow = el("div", "custom-row plan-custom-row");
      customRow.append(lineIcon(ICONS.edit, 13));
      const customInput = makeCustomAnswerInput(t("输入修改意见,回车发送"), sendCustom);
      customRow.append(customInput);
      const actions = el("div", "question-footer-actions");
      // 关闭审阅并补充意见(0.2.1 行为):关闭后宿主直接结束本轮等待用户反馈,
      // 不再额外调用模型;因此这里只取消提问并把光标交回输入框。
      const closeReview = el("button", "btn plan-close-btn", t("关闭审阅,去补充意见"));
      closeReview.title = t("关闭本次计划审阅;Agent 会结束本轮并等待你直接输入修改意见");
      closeReview.addEventListener("click", () => {
        vscode.postMessage({ kind: "answerCancel", frameRpcId: question.frameRpcId });
        state.questions.delete(question.frameRpcId);
        renderPending();
        input.focus();
        showToast(t("已关闭计划审阅:请直接输入修改意见,Agent 正在等待你的反馈"), "info");
      });
      actions.append(closeReview);
      // 拒绝:提交非批准选项(无该选项时不显示,与网页端一致)
      if (declineOption) {
        const declineBtn = el("button", "btn btn-reject", t("拒绝"));
        declineBtn.title = declineOption.description ?? "";
        declineBtn.addEventListener("click", () => {
          vscode.postMessage({
            kind: "answer",
            frameRpcId: question.frameRpcId,
            answers: [{ id: item.id, selected: [declineOption.label] }],
          });
          state.questions.delete(question.frameRpcId);
          renderPending();
        });
        actions.append(declineBtn);
      }
      // 确认执行:提交批准选项(主操作,靠主题主按钮色区分,不再用 ✅ 前缀抢视觉)
      const approveBtn = el("button", "btn btn-allow", t("确认执行"));
      approveBtn.title = approveOption?.description ?? "";
      approveBtn.addEventListener("click", () => {
        vscode.postMessage({
          kind: "answer",
          frameRpcId: question.frameRpcId,
          answers: [{ id: item.id, selected: approveOption ? [approveOption.label] : [] }],
        });
        state.questions.delete(question.frameRpcId);
        renderPending();
      });
      actions.append(approveBtn);
      card.append(actions);
      pendingArea.append(card);
    }
    if (normalItems.length === 0) continue;

    // ---------- 普通提问:网页端分页流(一次一题,跳过/提交同排;可折叠且保留草稿) ----------
    let flow = questionFlows.get(question.frameRpcId);
    if (!flow || flow.drafts.length !== normalItems.length) {
      flow = {
        drafts: normalItems.map(() => ({ selected: [] as string[], custom: "", skipped: false })),
        index: 0,
        minimized: false,
      };
      questionFlows.set(question.frameRpcId, flow);
    }
    const drafts = flow.drafts;
    let index = flow.index;

    const card = el("div", "pending-card pending-question question-card" + (flow.minimized ? " question-minimized" : ""));
    const head = el("div", "question-head");
    head.append(lineIcon(ICONS.help, 14), el("span", "question-head-title", t("提问")));
    // 0.2.0 异步问答:限时提问显示剩余等待时间;到期后提示 Agent 会继续,用户仍可作答
    if (question.remainingMs !== undefined) {
      const countdown = el(
        "span",
        "question-countdown" + (question.remainingMs === null ? " question-countdown-expired" : ""),
        question.remainingMs === null
          ? t("等待已结束 · 可稍后回答")
          : t("{seconds}s 后继续", { seconds: String(Math.ceil(question.remainingMs / 1000)) }),
      );
      countdown.title =
        question.remainingMs === null
          ? t("等待已到期,Agent 已继续工作;你的回答会作为后续消息送达")
          : t("限时提问:等待到期后 Agent 会先继续工作,你仍可稍后回答");
      head.append(countdown);
    }
    const count = el("span", "question-count");
    // 折叠 / 展开(网页端 nav.minimize/maximize 同款):折叠仅收起卡片主体,草稿与页码保留
    const minBtn = el("button", "question-min", "");
    minBtn.append(lineIcon(flow.minimized ? ICONS.up2 : ICONS.down2, 13));
    minBtn.title = flow.minimized ? t("展开提问卡片") : t("收起提问卡片");
    minBtn.addEventListener("click", () => {
      flow!.minimized = !flow!.minimized;
      renderPending();
    });
    const closeBtn = el("button", "question-close", "✕");
    closeBtn.title = t("放弃整组问题");
    closeBtn.addEventListener("click", () => {
      // 放弃整组问题:取消提问(网页端 pending.cancel 同款),不提交任何答案
      vscode.postMessage({ kind: "answerCancel", frameRpcId: question.frameRpcId });
      state.questions.delete(question.frameRpcId);
      questionFlows.delete(question.frameRpcId);
      renderPending();
    });
    head.append(minBtn, count, closeBtn);
    card.append(head);

    const body = el("div", "question-body");
    const footer = el("div", "question-footer");
    const pager = el("div", "question-pager");
    const prevBtn = el("button", "question-nav", "◀");
    prevBtn.title = t("上一题");
    const nextBtn = el("button", "question-nav", "▶");
    nextBtn.title = t("下一题");
    const progress = el("span", "question-progress");
    pager.append(prevBtn, progress, nextBtn);
    const feedback = el("div", "question-feedback");
    const actions = el("div", "question-footer-actions");
    const skipBtn = el("button", "btn skip-btn", t("跳过本题"));
    const primaryBtn = el("button", "btn btn-allow", "");
    actions.append(skipBtn, primaryBtn);
    footer.append(pager, feedback, actions);
    if (!flow.minimized) {
      card.append(body);
      card.append(footer);
    }
    pendingArea.append(card);

    /** 全部问题的作答(跳过 → 空选择;自定义优先,与网页端提交语义一致)。 */
    function buildAnswers() {
      return normalItems.map((item, i) => {
        const d = drafts[i];
        const custom = d.custom.trim();
        if (d.skipped) return { id: item.id, selected: [] as string[] };
        return {
          id: item.id,
          selected: custom === "" || item.multiSelect === true ? d.selected : [],
          ...(custom === "" ? {} : { custom }),
        };
      });
    }

    const submitAll = () => {
      vscode.postMessage({ kind: "answer", frameRpcId: question.frameRpcId, answers: buildAnswers() });
      state.questions.delete(question.frameRpcId);
      questionFlows.delete(question.frameRpcId);
      renderPending();
    };

    const answered = () => drafts[index].skipped || drafts[index].selected.length > 0 || drafts[index].custom.trim() !== "";

    const continueFlow = () => {
      if (!answered()) {
        feedback.textContent = t("⚠️ 请选择一个选项或填写自定义回答");
        return;
      }
      if (index < normalItems.length - 1) {
        index += 1;
        flow!.index = index;
        renderPage();
      } else {
        submitAll();
      }
    };

    const skipQuestion = () => {
      drafts[index].skipped = true;
      drafts[index].selected = [];
      drafts[index].custom = "";
      feedback.textContent = "";
      if (index < normalItems.length - 1) {
        index += 1;
        flow!.index = index;
        renderPage();
      } else {
        submitAll();
      }
    };

    prevBtn.addEventListener("click", () => {
      if (index > 0) {
        index -= 1;
        flow!.index = index;
        renderPage();
      }
    });
    nextBtn.addEventListener("click", () => {
      if (index < normalItems.length - 1) {
        index += 1;
        flow!.index = index;
        renderPage();
      }
    });
    skipBtn.addEventListener("click", skipQuestion);
    primaryBtn.addEventListener("click", continueFlow);

    /** 渲染当前题:选项 + 自定义输入(输入即视为自定义回答,不再有单独单选)。 */
    function renderPage() {
      count.textContent = normalItems.length > 1 ? t("第 {i} 题 / 共 {n} 题", { i: String(index + 1), n: String(normalItems.length) }) : "";
      progress.textContent = `${index + 1} / ${normalItems.length}`;
      prevBtn.disabled = index === 0;
      nextBtn.disabled = index === normalItems.length - 1;
      primaryBtn.textContent = index === normalItems.length - 1 ? t("提交回答") : t("下一题");
      feedback.textContent = "";
      body.innerHTML = "";

      const item = normalItems[index];
      const draft = drafts[index];
      const section = el("div", "question-section");
      // 题面不再带自己的 ❓ 小图标:卡片头部已经有同类图标,连着两个同级图标只会干扰阅读
      const title = el("div", "question-title");
      title.append(el("span", undefined, item.question));
      section.append(title);
      if (item.detail) section.append(el("div", "question-detail", item.detail));
      const form = el("div", "pending-form");

      for (const option of item.options ?? []) {
        const parsed = parseRecommendedLabel(option.label);
        const row = el("label", "option-row");
        const inputEl = document.createElement("input");
        inputEl.type = item.multiSelect ? "checkbox" : "radio";
        inputEl.name = `q-${question.frameRpcId}-${index}`;
        inputEl.checked = draft.selected.includes(option.label);
        inputEl.addEventListener("change", () => {
          if (item.multiSelect) {
            if (inputEl.checked) draft.selected.push(option.label);
            else draft.selected = draft.selected.filter((l) => l !== option.label);
          } else {
            draft.selected = [option.label];
            draft.custom = "";
          }
          draft.skipped = false;
          feedback.textContent = "";
        });
        // 视觉标识(网页端同款):单选 = 序号圆点;多选(multiSelect)= 复选框方块
        const mark = el("span", "option-mark" + (item.multiSelect ? " mark-check" : " mark-radio"));
        if (item.multiSelect) mark.append(lineIcon(ICONS.check, 11));
        else mark.textContent = String((item.options ?? []).indexOf(option) + 1);
        const copy = el("span", "option-copy");
        const line = el("span", "option-line", parsed.base);
        if (parsed.recommended) {
          const badge = el("span", "rec-badge", t("推荐"));
          badge.title = option.description ?? "";
          line.append(badge);
        }
        copy.append(line);
        if (option.description) copy.append(el("span", "option-desc-text", option.description));
        row.append(inputEl, mark, copy);
        form.append(row);
      }

      // 自定义回答:输入即视为自定义(与网页端一致 —— 无独立"其他"单选);
      // 0.1.1-rc.1 起支持多行:Enter 提交,Shift+Enter 换行
      const customRow = el("div", "custom-row");
      customRow.append(lineIcon(ICONS.edit, 13));
      const customInput = makeCustomAnswerInput(t("输入你的答案(填写即视为自定义回答)"), continueFlow);
      customInput.value = draft.custom;
      customInput.addEventListener("input", () => {
        draft.custom = customInput.value;
        if (customInput.value.trim() && !item.multiSelect) draft.selected = [];
        draft.skipped = false;
        feedback.textContent = "";
      });
      customRow.append(customInput);
      form.append(customRow);
      section.append(form);
      body.append(section);
    }
    renderPage();
  }
  for (const request of state.cordisRequests.values()) {
    // ---------- Cordis 插件审批卡(网页端 Cordis 浮窗面板同款:仅允许此版本 / 允许后续版本 / 拒绝) ----------
    const card = el("div", "pending-card pending-cordis cordis-approval-card");
    const head = el("div", "approval-head");
    // 头部只留一个分类色点(与工具审批一致);标题不再叠 emoji,避免同一行出现两种图标语言
    head.append(el("span", "approval-dot cordis-dot"), el("span", "approval-title", t("Cordis 插件审批")));
    card.append(head);
    const body = el("div", "approval-body");
    const toolChip = el("span", "approval-tool", request.name || request.pluginId);
    body.append(toolChip);
    const headline = el("div", "approval-headline", request.purpose || t("(未填写用途)"));
    body.append(headline);
    const meta = el("div", "cordis-meta");
    meta.append(el("span", "cordis-meta-item", `${request.pluginId} · ${request.packageId} · ${request.mode === "update" ? t("更新") : t("运行")}`));
    body.append(meta);
    card.append(body);
    const actions = el("div", "approval-actions");
    const reject = el("button", "btn btn-reject", t("拒绝"));
    reject.addEventListener("click", () => {
      vscode.postMessage({ kind: "cordisReject", requestId: request.requestId });
      state.cordisRequests.delete(request.requestId);
      renderPending();
    });
    // 权限层级靠按钮主次表达:仅当前版本 = 主操作(蓝);包含后续版本 = 次要操作(灰),
    // 避免两个同等强调的主按钮并排,也避免 ✓ / ✓✓ 前缀噪音。
    const allowOnce = el("button", "btn btn-allow", t("仅允许此版本"));
    allowOnce.title = t("仅授权当前版本运行,后续版本更新时需再次审批");
    allowOnce.addEventListener("click", () => {
      vscode.postMessage({ kind: "cordisApprove", request, approveFutureVersions: false });
      state.cordisRequests.delete(request.requestId);
      renderPending();
    });
    const allowPlugin = el("button", "btn btn-allow-plugin", t("允许后续版本"));
    allowPlugin.title = t("授权此插件的所有后续版本自动运行,无需再次审批");
    allowPlugin.addEventListener("click", () => {
      vscode.postMessage({ kind: "cordisApprove", request, approveFutureVersions: true });
      state.cordisRequests.delete(request.requestId);
      renderPending();
    });
    actions.append(reject, allowOnce, allowPlugin);
    card.append(actions);
    pendingArea.append(card);
  }
}

/** 解析选项标签中的"(推荐)"/"(recommended)"后缀,返回基础标签与推荐标记。 */
/**
 * 多行自定义回答输入(0.1.1-rc.1 网页端同款):自动换行自适应高度,Enter 提交,Shift+Enter 换行。
 */
function makeCustomAnswerInput(placeholder: string, onEnter: () => void): HTMLTextAreaElement {
  const ta = document.createElement("textarea");
  ta.className = "custom-answer-input";
  ta.placeholder = placeholder;
  ta.rows = 1;
  const resize = () => {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  };
  ta.addEventListener("input", resize);
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      onEnter();
    }
  });
  return ta;
}

function parseRecommendedLabel(label: string): { base: string; recommended: boolean } {
  const m = label.match(/\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i);
  if (!m || m.index === undefined) return { base: label, recommended: false };
  return { base: label.slice(0, m.index).trim() || label, recommended: true };
}

/** 应用 session/queue 权威快照:重建排队节点(连同其附件上下文卡片一并清理)。 */
function applyQueueItems(items: { id: string; placement: string; message?: { content?: unknown[] } }[]) {
  state.queueItems = items;
  for (const n of [...state.nodes]) {
    if (n.kind === "queued" || n.key.startsWith("qat:")) removeNode(n);
  }
  state.queuedIds = new Map();
  for (const item of items) {
    if (item.placement !== "queued") continue;
    const id: string = item.id;
    const text = extractText(item.message?.content);
    const split = splitAttachmentContext(text);
    if (split.attachContext) {
      appendNode({ kind: "attach", key: `qat:${id}`, el: null, text: split.attachContext });
    }
    const node: NodeState = {
      kind: "queued",
      key: `q:${id}`,
      el: null,
      text: isSlashCommandOnly(split.userText) ? `⌘ ${split.userText.trim()}` : split.userText,
    };
    state.queuedIds.set(id, node);
    appendNode(node);
  }
}

/**
 * 文案开头自带的状态 emoji(toast 自身也会给图标,必须剥掉,否则出现「⚠️ ⚠️ …」重复)。
 * 注意「️」变体选择符可选:词典里两种写法都可能出现。
 */
const LEADING_STATUS_EMOJI = /^\s*(⚠️|⚠|ℹ️|ℹ|❗|❌|✅|☑️|☑|🚫|⛔)\s*/u;

/** 统一 emoji 写法(补上变体选择符),保证与 toast 图标一致。 */
function normalizeStatusEmoji(emoji: string): string {
  switch (emoji) {
    case "⚠":
      return "⚠️";
    case "ℹ":
      return "ℹ️";
    case "☑":
      return "☑️";
    default:
      return emoji;
  }
}

/** 浮动 toast:显示操作反馈(信息 4s / 错误 8s),点击 × 关闭;可带一个动作按钮。 */
function showToast(message: string, level: string, action?: { label: string; onClick: () => void }) {
  if (!message) return;
  // 文案可能自带状态 emoji(如「⚠️ 最多一次添加 8 张图片」):剥掉后统一由 toast 出一枚图标,
  // 但保留文案自身的语义 —— 成功类 ✅ 仍显示 ✅,而不是一律降级成 info 的 ℹ️。
  const leading = LEADING_STATUS_EMOJI.exec(message);
  const text = leading === null ? message : message.slice(leading[0].length);
  if (!text) return;
  const icon = leading === null ? (level === "info" ? "ℹ️" : "⚠️") : normalizeStatusEmoji(leading[1]);
  const toast = el("div", `toast toast-${level === "error" ? "error" : level === "warning" ? "warning" : "info"}`);
  toast.append(el("span", "toast-icon", icon));
  toast.append(el("span", "toast-text", text));
  if (action) {
    const btn = el("button", "toast-action", action.label);
    btn.addEventListener("click", () => {
      action.onClick();
      toast.classList.add("toast-hide");
      setTimeout(() => toast.remove(), 250);
    });
    toast.append(btn);
  }
  const close = el("button", "toast-close", "×");
  close.addEventListener("click", () => {
    toast.classList.add("toast-hide");
    setTimeout(() => toast.remove(), 250);
  });
  toast.append(close);
  toastBox.append(toast);
  // 最多保留 4 条,超出移除最旧的
  while (toastBox.children.length > 4) toastBox.firstElementChild?.remove();
  const ttl = level === "error" ? 8000 : level === "warning" ? 8000 : 4000;
  setTimeout(() => {
    toast.classList.add("toast-hide");
    setTimeout(() => toast.remove(), 250);
  }, ttl);
}

// ---------- 消息处理 ----------

/** 重设静态控件文案(语言切换后就地应用,不刷新页面)。 */
function applyStaticLabels() {
  btnNew.title = t("新建会话");
  btnMore.title = t("会话操作:分叉 / 重命名 / 归档");
  btnWorkspaces.title = t("工作区(分组 / 搜索 / 归档)");
  btnJobs.title = t("后台任务");
  btnSchedule.title = t("自动化任务");
  refreshSendKeyChip();
  btnTrajectory.title = t("轨迹(事件台账)");
  btnSettings.title = t("设置(常规 / 模型 / 预设)");
  btnSubagents.title = t("子代理目录");
  btnBrowser.title = t("在浏览器中打开");
  btnCordis.title = t("Cordis 插件");
  btnPlus.title = t("输入命令(/plan、/compact、.claude 命令…)");
  btnAddAttach.title = t("添加文件或文件夹到对话");
  btnBackToMain.title = t("回到主线(父会话)");
  input.placeholder = t("向 DeepSeek Harness 发送消息…");
  modelPillHead.title = t("模型与思考(推理强度)");
  thinkSeg.title = t("思考深度(推理强度)");
  mppThinkLabel.textContent = t("思考深度(推理强度)");
  presetPillHead.title = t("Agent 预设");
  ppPresetTitle.textContent = t("选择 Agent 预设(新会话生效)");
  permissionPillHead.title = t("读写权限(沙箱模式 + 审批策略)");
  ppTitle.textContent = t("应如何批准操作?");
  ppMore.textContent = t("了解更多");
  // 会话菜单:线性图标 + 文字(去 emoji 后语言切换只需更新文字)
  (menuRename.querySelector(".session-menu-label") as HTMLElement).textContent = t("重命名会话");
  (menuFork.querySelector(".session-menu-label") as HTMLElement).textContent = t("分叉会话");
  (menuCopyId.querySelector(".session-menu-label") as HTMLElement).textContent = t("复制会话 ID");
  (menuArchive.querySelector(".session-menu-label") as HTMLElement).textContent = t("归档会话");
  (btnNew.querySelector(".btn-new-label") as HTMLElement).textContent = t("新建对话");
  dialogCancel.textContent = t("取消");
  dialogConfirm2.textContent = t("清除");
  dialogConfirm.textContent = t("确定");
}

/** 语言切换后就地重建整个界面(替代 location.reload,避免 webview 空白)。 */
function applyLanguage() {
  applyStaticLabels();
  // 重建消息区:按新语言重新折叠全部事件
  const events = state.rawEvents.slice();
  const queue = state.queueItems.slice();
  state.nodes = [];
  state.seqs = new Set();
  state.queuedIds = new Map();
  state.rawEvents = [];
  state.streamBlock = null;
  state.streamKey = null;
  state.turnStarts = [];
  state.currentTurnTools = [];
  state.turnToolGroup = null;
  state.stepStarts = new Map();
  state.currentStreamTurn = undefined;
  state.streamedBlockKeys = new Set();
  state.streamedBlocks = new Map();
  state.rowBlocks = new Map();
  state.turnStartMs = new Map();
  state.turnEndMs = new Map();
  state.turnUsage = new Map();
  state.turnFirstTokenMs = new Map();
  state.turnLastDeltaMs = new Map();
  turnProduced = [];
  turnProducedSet.clear();
  turnCallViews.clear();
  messages.innerHTML = "";
  state.replaying = true;
  eventsSessionId = state.current ?? undefined;
  for (const wire of events) handleEvent(wire);
  applyQueueItems(queue);
  state.replaying = false;
  chipsSignature = "";
  renderSessions();
  renderThinkingSeg();
  renderModelPill();
  renderPresetPill();
  renderPermissionPill();
  renderGoal();
  renderModeChips();
  renderContextMeter();
  renderStatsLine();
  renderTodos();
  renderWorkingDirectoryChip();
  renderAttachments();
  updateSubagentButton();
  renderPending();
  renderLoadMoreButton();
  updateStatus(state.status);
  updateRunning();
  panels.refreshSettings();
  scrollToBottom();
}

function handleMessage(msg: any) {
  switch (msg.kind) {
    // 输入区偏好回执(切换发送快捷键后宿主回写设置,以设置为准回同步)
    case "composerPrefs": {
      applyComposerPrefs(msg.value);
      break;
    }
    case "init": {
      stopTurnStatus();
      // 输入区偏好(issue #21):发送快捷键 / 面板字体 / 产物列表默认折叠
      applyComposerPrefs(msg.composerPrefs);
      state.sessions = msg.sessions ?? [];
      state.current = msg.current ?? null;
      state.running = msg.running ?? false;
      state.status = msg.status ?? state.status;
      state.nodes = [];
      state.seqs = new Set();
      state.queuedIds = new Map();
      state.approvals = new Map();
      state.questions = new Map();
      state.hasMore = !!msg.hasMore;
      state.streamBlock = null;
      state.streamKey = null;
      state.goal = msg.goal;
      state.context = msg.context;
      state.breakdown = msg.breakdown;
      state.permissions = msg.permissions;
      state.stats = msg.stats;
      state.todos = msg.todos;
      // 0.2.1:当前生效目录与限时提问投影(会话头 cwd 只作回退显示)
      state.workingDirectory = typeof msg.workingDirectory === "string" ? msg.workingDirectory : (msg.workingDirectory === null ? null : undefined);
      state.userQuestions = msg.userQuestions;
      state.plan = msg.plan;
      state.planReview = undefined;
      if (msg.plan) state.planMode = msg.plan.active === true;
      state.lang = msg.lang ?? "zh-cn";
      state.languagePref = msg.languagePref ?? "auto";
      // 骨架期创建的静态控件文案(输入框 placeholder、按钮 title、工具标签等)在
      // 构建时用的是默认 zh-cn,init 拿到真实语言后必须就地刷新,否则首次打开显示中文
      applyStaticLabels();
      state.agentDirs = msg.agentDirs ?? { claude: true, codex: true, githubCopilot: true, dshUserSkills: true };
      state.models = null;
      state.presets = null;
      // 切换会话时清空技能与子代理,避免旧会话数据残留导致 / 菜单显示空标题
      state.skills = null;
      state.subagents = null;
      state.workspaces = msg.workspaces ?? [];
      state.workspaceOrder = msg.workspaceOrder ?? [];
      state.archivedSessionIds = msg.archivedSessionIds ?? [];
      state.workspaceFolder = typeof msg.workspaceFolder === "string" ? msg.workspaceFolder : null;
      state.jobs = msg.jobs ?? [];
      state.rawEvents = [];
      state.settingsDescribe = null;
      state.turnStarts = [];
      state.rollback = undefined;
      state.planMode = false;
      state.stepStarts = new Map();
      state.currentStreamTurn = undefined;
      state.streamedBlockKeys = new Set();
      state.streamedBlocks = new Map();
      state.rowBlocks = new Map();
      state.turnStartMs = new Map();
      state.turnEndMs = new Map();
      state.turnUsage = new Map();
      state.turnFirstTokenMs = new Map();
      state.turnLastDeltaMs = new Map();
      state.turnToolGroup = null;
      messages.innerHTML = "";
      state.replaying = true;
      eventsSessionId = state.current ?? undefined;
      for (const wire of msg.events ?? []) handleEvent(wire);
      applyQueueItems(msg.queue ?? []);
      state.replaying = false;
      renderLoadMoreButton();
      for (const approval of msg.approvals ?? []) state.approvals.set(approval.approvalId, approval);
      for (const question of msg.questions ?? []) state.questions.set(question.frameRpcId, question);
      // 0.2.x:限时提问投影还原(本轮没收到 waterfall 帧的待答提问)
      applyUserQuestionsProjection();
      // 持久化的计划文本文件:重启后重放时并入最后一个回合的产物卡,便于重新打开继续修改
      if (typeof msg.planFile === "string" && msg.planFile) {
        state.planFile = msg.planFile;
        const lastAssistant = [...state.nodes].reverse().find((n) => n.kind === "assistant");
        if (lastAssistant) {
          const files = [...(lastAssistant.deliverables ?? [])];
          if (!files.includes(msg.planFile)) files.push(msg.planFile);
          lastAssistant.deliverables = files;
          renderNodeFiles(lastAssistant);
        }
      }
      renderSessions();
      renderPending();
      renderGoal();
      renderThinkingSeg();
      renderModelPill();
      renderPresetPill();
      renderPermissionPill();
      renderContextMeter();
      renderStatsLine();
      renderTodos();
      renderWorkingDirectoryChip();
      // 计划模式芯片必须在这里重画:init 会先按 msg.plan 更新 state.plan,
      // 而模式芯片的绘制发生在渲染段(仅 plan 投影消息与 plan/mode 事件时才画),
      // 漏了这一句 → 切换会话/重载后芯片要等下一条事件才出现。
      chipsSignature = "";
      renderModeChips();
      updateRunning();
      updateStatus(state.status);
      if (state.current) {
        vscode.postMessage({ kind: "getModels" });
        vscode.postMessage({ kind: "getPresets" });
        vscode.postMessage({ kind: "getSkills" });
        vscode.postMessage({ kind: "getSubagents" });
        vscode.postMessage({ kind: "getActiveFile" });
      }
      // 智能体/技能目录扫描是工作区级的,与会话选择无关:
      // 无论当前是否已选会话都刷新,保证 @ 提及菜单始终可用(此前仅在已选会话时触发一次)
      vscode.postMessage({ kind: "getClaudeConfig" });
      scrollToBottom();
      break;
    }
    case "activeFile": {
      state.activeFile = msg.file ?? null;
      if (msg.file === null && state.autoAttachActive) {
        state.attachments = state.attachments.filter((a) => !a.auto);
      }
      syncActiveFileAttachment();
      break;
    }
    case "attachmentsPicked": {
      for (const a of msg.attachments ?? []) {
        if (state.attachments.some((x) => x.path === a.path)) continue;
        state.attachments.push({ kind: a.kind, path: a.path, label: a.label ?? a.path });
      }
      renderAttachments();
      break;
    }
    case "skills": {
      if (msg.sessionId && msg.sessionId !== state.current) break;
      state.skills = msg.value?.skills ?? [];
      break;
    }
    case "subagents": {
      if (msg.sessionId && msg.sessionId !== state.current) break;
      state.subagents = msg.value?.entries ?? [];
      updateSubagentButton();
      break;
    }
    case "claudeConfig": {
      state.claudeConfig = msg.value ?? {
        claudeMd: false,
        commands: [],
        skills: [],
        codexConfig: false,
        codexSkills: [],
        copilotInstructions: null,
        copilotInstructionFiles: [],
        copilotAgents: [],
        copilotPrompts: [],
        dshSkills: [],
        dshAgents: [],
        dshMemory: [],
      };
      break;
    }
    case "streamChunk": {
      // 0.1.5 assistant-stream 瞬态帧(宿主已翻译为与 assistant/chunk 同构的载荷)
      const value = msg.value as { turn?: number; step?: number; time?: number; chunk?: unknown } | undefined;
      if (!value || (msg.sessionId && msg.sessionId !== state.current)) break;
      applyAssistantChunk(
        { turn: value.turn ?? 0, step: value.step ?? 0, chunk: value.chunk },
        typeof value.time === "number" ? value.time : Date.now(),
      );
      break;
    }
    case "streamEnd": {
      // 尝试被放弃(重试/中断):丢弃该步已流出的内容,避免残留半截回答
      const value = msg.value as { turn?: number; step?: number; abandoned?: boolean } | undefined;
      if (!value || (msg.sessionId && msg.sessionId !== state.current)) break;
      if (value.abandoned === true && typeof value.turn === "number" && typeof value.step === "number") {
        const bucket = state.streamedBlocks.get(`${value.turn}:${value.step}`);
        state.streamBlock = null;
        if (bucket) {
          for (const block of bucket.values()) block.text = "";
          const node = [...state.nodes].reverse().find((n) => n.kind === "assistant" && n.turn === value.turn);
          if (node) refreshAssistantNode(node, undefined, true);
        }
      }
      break;
    }
    case "mentionCandidates": {
      // @ 菜单远端候选(文件与文件夹 / Session 对话)到达:替换加载行,与本地智能体合并渲染
      if (!mentionState || typeof msg.query !== "string" || msg.query !== mentionState.query) break;
      mentionRemoteLoading = false;
      mentionRemote = {
        query: msg.query,
        files: Array.isArray(msg.files) ? msg.files : [],
        sessions: Array.isArray(msg.sessions) ? msg.sessions : [],
      };
      mentionState.items = mentionItems();
      renderMentionMenu();
      break;
    }
    case "subagentPreview": {
      const anchor = (document.querySelector(".subagent-chip") as HTMLElement | null) ?? btnSubagents;
      // issue #21 第 9 条:预览浮窗同样走统一弹层(点击外部 / Esc / 滚动 / 失焦都能关掉)
      openAnchoredMenu(anchor, (pop) => {
        pop.classList.add("subagent-preview-pop");
        pop.append(el("div", "plus-menu-label", t("子代理最近回复")));
        pop.append(el("div", "subagent-preview", msg.preview ?? t("(暂无)")));
        pop.append(el("div", "plus-menu-label", t("完整历史请到 DSH 网页版查看")));
      });
      break;
    }
    case "delta": {
      eventsSessionId = typeof msg.sessionId === "string" ? msg.sessionId : (state.current ?? undefined);
      for (const wire of msg.events ?? []) handleEvent(wire);
      break;
    }
    case "sessions": {
      state.sessions = msg.sessions ?? [];
      renderSessions();
      renderPresetPill();
      panels.updateWorkspaces();
      break;
    }
    case "running": {
      state.running = !!msg.running;
      if (!state.running) stopTurnStatus();
      updateRunning();
      break;
    }
    case "models": {
      if (msg.sessionId && msg.sessionId !== state.current) break;
      state.models = msg.value;
      renderThinkingSeg();
      renderModelPill();
      // 模型信息到达后,回填所有已渲染回答头部的模型名(保留思考耗时与 token 消耗)
      const modelName = state.models?.current?.model ?? "DeepSeek";
      for (const n of state.nodes) {
        if (n.kind === "assistant" && n.roleEl) {
          n.roleEl.textContent = n.roleSuffix ? `${modelName} · ${n.roleSuffix}` : modelName;
        }
      }
      break;
    }
    case "presets": {
      state.presets = msg.value?.presets ?? [];
      renderPresetPill();
      panels.refreshSettings();
      break;
    }
    case "goal": {
      if (msg.sessionId && msg.sessionId !== state.current) break;
      state.goal = msg.value;
      renderGoal();
      break;
    }
    case "context": {
      if (msg.sessionId && msg.sessionId !== state.current) break;
      state.context = msg.value;
      renderContextMeter();
      break;
    }
    case "breakdown": {
      if (msg.sessionId && msg.sessionId !== state.current) break;
      state.breakdown = msg.value;
      renderContextMeter();
      break;
    }
    case "stats": {
      if (msg.sessionId && msg.sessionId !== state.current) break;
      // 宿主对 sessionStats 与 tokenUsage 各发一条消息(每条只带一个键):
      // 整对象赋值会让后到的那条抹掉先到的,于是只剩一枚胶囊(常见现象:
      // 只有「{轮}轮 {步}步」而看不到 token 胶囊),直到切换会话重推完整快照才恢复。
      // 因此这里按字段合并,两者互不覆盖。
      const incoming = (msg.value ?? {}) as { sessionStats?: unknown; tokenUsage?: unknown };
      const merged = { ...(state.stats ?? {}) };
      if (incoming.sessionStats !== undefined) merged.sessionStats = incoming.sessionStats;
      if (incoming.tokenUsage !== undefined) merged.tokenUsage = incoming.tokenUsage;
      state.stats = merged;
      renderStatsLine();
      break;
    }
    case "rollback": {
      // 回合级 Git 回退快照清单:更新状态并刷新已渲染消息的操作条(回退按钮出现/消失)
      if (typeof msg.sessionId === "string") {
        state.rollback = {
          sessionId: msg.sessionId,
          available: !!msg.available,
          checkpoints: Array.isArray(msg.checkpoints)
            ? msg.checkpoints.filter((c: any) => c && typeof c.turn === "number")
            : [],
        };
        if (msg.sessionId === state.current) {
          for (const n of state.nodes) {
            if (n.kind === "assistant" && n.actionsEl && typeof n.turn === "number") renderActions(n);
          }
        }
      }
      break;
    }
    case "rollbackPreviewData": {
      if (typeof msg.requestId !== "string" || msg.requestId !== rbState.requestId) break;
      rbState.targetSessionId = typeof msg.targetSessionId === "string" ? msg.targetSessionId : undefined;
      rbState.targetCommit = typeof msg.targetCommit === "string" ? msg.targetCommit : undefined;
      if (msg.preview) {
        renderRollbackReview(msg.preview as RbPreview);
      } else {
        rbMeta.textContent = String(msg.error ?? t("差异不可用"));
        rbBody.innerHTML = "";
        rbBody.append(el("div", "rb-empty", t("暂无检查点。检查点会在每个回合开始前自动创建(turn/start 时快照工作区)")));
      }
      break;
    }
    case "rollbackDiffData": {
      if (typeof msg.requestId !== "string") break;
      const pre = rbDiffTargets.get(msg.requestId);
      if (!pre) break;
      rbDiffTargets.delete(msg.requestId);
      if (typeof msg.diff === "string" && msg.diff) pre.innerHTML = renderGitDiffHtml(msg.diff);
      else pre.textContent = t("差异不可用");
      break;
    }
    case "rollbackCheckpointsData": {
      if (typeof msg.requestId !== "string" || msg.requestId !== rbState.requestId) break;
      if (msg.head && Array.isArray(msg.sessions)) {
        renderCheckpointsDialog(msg as { head: string; dirty: number; sessions: { sessionId: string; checkpoints: RbCheckpointRow[] }[] });
      } else {
        rbMeta.textContent = String(msg.error ?? t("差异不可用"));
        rbBody.innerHTML = "";
      }
      break;
    }
    case "rollbackUndoPreviewData": {
      if (typeof msg.requestId !== "string" || msg.requestId !== rbState.requestId) break;
      if (msg.preview) {
        renderUndoReview(msg.preview as RbUndoPreview);
      } else {
        rbMeta.textContent = String(msg.error ?? t("差异不可用"));
        rbBody.innerHTML = "";
        rbBody.append(el("div", "rb-empty", t("该回合没有可精确撤销的快照;可用「回退到此回合前」整体回退")));
      }
      break;
    }
    case "rollbackUndoDiffData": {
      if (typeof msg.requestId !== "string") break;
      const pre = rbDiffTargets.get(msg.requestId);
      if (!pre) break;
      rbDiffTargets.delete(msg.requestId);
      if (typeof msg.diff === "string" && msg.diff) pre.innerHTML = renderGitDiffHtml(msg.diff);
      else pre.textContent = t("差异不可用");
      break;
    }
    case "planFile": {
      // 计划审批文本文件:计入本轮产物(📦 产物卡,可点击打开)
      if (msg.sessionId && msg.sessionId !== state.current) break;
      const path: string | undefined = typeof msg.path === "string" ? msg.path : undefined;
      if (path && !turnProducedSet.has(path)) {
        turnProducedSet.add(path);
        turnProduced.push(path);
      }
      break;
    }
    case "todos": {
      if (msg.sessionId && msg.sessionId !== state.current) break;
      state.todos = msg.value;
      renderTodos();
      break;
    }
    case "workingDirectory": {
      if (msg.sessionId && msg.sessionId !== state.current) break;
      // 0.2.1:会话生效目录变化 → 更新底栏目录芯片(会话头 cwd 不随之改变)
      state.workingDirectory = typeof msg.cwd === "string" ? msg.cwd : null;
      renderWorkingDirectoryChip();
      break;
    }
    case "userQuestions": {
      if (msg.sessionId && msg.sessionId !== state.current) break;
      // 0.2.x 限时提问投影:刷新/切换会话后由投影还原待答卡片(在线期间仍由 waterfall 帧即时补)
      state.userQuestions = msg.value;
      applyUserQuestionsProjection();
      break;
    }
    case "plan": {
      if (msg.sessionId && msg.sessionId !== state.current) break;
      // 计划模式投影:权威的 {active, pending},芯片按 pending ? !active : active 折算
      state.plan = msg.value;
      if (msg.value) state.planMode = msg.value.active === true;
      renderModeChips();
      break;
    }
    case "permissions": {
      if (msg.sessionId && msg.sessionId !== state.current) break;
      state.permissions = msg.value;
      renderPermissionPill();
      break;
    }
    case "approval": {
      state.approvals.set(msg.approvalId, msg);
      renderPending();
      break;
    }
    case "approvalResolved": {
      state.approvals.delete(msg.approvalId);
      renderPending();
      break;
    }
    case "question": {
      state.questions.set(msg.frameRpcId, msg);
      renderPending();
      break;
    }
    case "questionCountdown": {
      // 0.2.0 异步问答:限时提问的剩余等待时间(remainingMs=null 表示等待已到期,卡片保留)
      const question = state.questions.get(msg.frameRpcId);
      if (question) {
        question.remainingMs = typeof msg.remainingMs === "number" ? msg.remainingMs : null;
        renderPending();
      }
      break;
    }
    case "sessionLocked": {
      // 会话被其他 DSH 实例占用:输入框上方常驻提示条(写操作被拒时出现,成功一次后自动消失)
      const locked = msg.locked !== false;
      if (locked) {
        lockNoticeText.textContent = t(
          "当前会话已被其他 DSH 实例占用(桌面端 / 另一个 dsh web),不能切换模型、重命名或发送消息;换一个会话或退出该实例后重试",
        );
      }
      lockNotice.hidden = !locked;
      break;
    }
    case "questionResolved": {
      state.questions.delete(msg.frameRpcId);
      questionFlows.delete(msg.frameRpcId);
      renderPending();
      break;
    }
    case "cordisRequest": {
      // Cordis 插件审批请求到达(网页端 Cordis 浮窗面板同款):入列并刷新浮窗卡
      if (msg.request && typeof msg.request.requestId === "string") {
        state.cordisRequests.set(msg.request.requestId, msg.request);
        renderPending();
        updateCordisBadge();
      }
      break;
    }
    case "cordisResolved": {
      // 审批已解决(授权/拒绝/失败):移除对应卡片
      if (msg.resolved && typeof msg.resolved.requestId === "string") {
        state.cordisRequests.delete(msg.resolved.requestId);
        renderPending();
        updateCordisBadge();
      }
      break;
    }
    case "cordisRefresh": {
      // 插件被移除 / 新包定义:审批卡的清理由 request-run-resolved 帧负责,这里仅刷新徽标
      updateCordisBadge();
      break;
    }
    case "cordisNotice": {
      showToast(msg.message ?? "", msg.level ?? "info");
      break;
    }
    case "queue": {
      // 权威快照:重建排队节点(含编辑 / 移除 / 插队后的收敛)
      applyQueueItems(msg.items ?? []);
      break;
    }
    case "historyMore": {
      const events = msg.events ?? [];
      state.seqs = new Set();
      state.rawEvents = [];
      state.nodes = [];
      state.rowBlocks = new Map();
      state.turnStartMs = new Map();
      state.turnEndMs = new Map();
      state.turnUsage = new Map();
      state.turnFirstTokenMs = new Map();
      state.turnLastDeltaMs = new Map();
      turnProduced = [];
      turnProducedSet.clear();
      turnCallViews.clear();
      messages.innerHTML = "";
      state.replaying = true;
      eventsSessionId = state.current ?? undefined;
      for (const wire of events) handleEvent(wire);
      state.replaying = false;
      state.hasMore = !!msg.hasMore;
      renderLoadMoreButton();
      break;
    }
    // ---------- 新增:工作区 / 任务 / 搜索 / 设置 / 子代理 / 图片 ----------
    case "workspaces": {
      state.workspaces = msg.workspaces?.workspaces ?? [];
      state.workspaceOrder = msg.workspaces?.workspaceOrder ?? [];
      state.archivedSessionIds = msg.workspaces?.archivedSessionIds ?? [];
      panels.updateWorkspaces();
      break;
    }
    case "workspaceFolder": {
      state.workspaceFolder = typeof msg.path === "string" ? msg.path : null;
      renderSessions();
      break;
    }
    case "jobs": {
      if (msg.sessionId && msg.sessionId !== state.current) break;
      state.jobs = msg.jobs ?? [];
      panels.updateJobs();
      break;
    }
    // ---------- 定时任务(0.1.7 schedule/*) ----------
    case "schedule": {
      panels.scheduleResult(msg);
      break;
    }
    case "scheduleHistory": {
      panels.scheduleHistoryResult(msg);
      break;
    }
    case "scheduleDeleted": {
      panels.scheduleDeleted(msg);
      break;
    }
    case "scheduleChanged": {
      panels.scheduleChanged();
      break;
    }
    // ---------- 逐消息反馈(0.1.7 messageFeedback/*) ----------
    case "feedback": {
      if (msg.sessionId && msg.sessionId !== state.current) break;
      state.feedback = Array.isArray(msg.items) ? msg.items : [];
      applyFeedbackToNodes();
      break;
    }
    case "searchResults":
      panels.renderSearchResults(msg);
      break;
    case "settingsDescribe":
      panels.updateSettingsDescribe(msg);
      break;
    case "settingsSaved":
      panels.settingsSaved(msg);
      break;
    case "credentialChanged":
      panels.credentialChanged(msg);
      break;
    case "llmInfo":
      panels.llmInfoResult(msg);
      break;
    case "discoveredModels":
      panels.discoveredModelsResult(msg);
      break;
    case "presetRead":
      panels.renderPresetReadResult(msg);
      break;
    case "presetFolderOpened":
      panels.presetFolderOpened(msg);
      break;
    case "subagentOpen":
      panels.subagentOpenResult(msg);
      break;
    case "imagesPicked": {
      for (const img of msg.images ?? []) {
        if (state.images.length >= 8) break;
        state.images.push({ data: img.data, mediaType: img.mediaType ?? "image/png", name: img.name ?? "image" });
      }
      renderAttachments();
      break;
    }
    case "attachmentData":
      applyAttachmentData(msg);
      break;
    case "status": {
      updateStatus(msg.status ?? state.status);
      break;
    }
    case "lang": {
      // 语言设置变更:就地全量重渲染,不刷新页面(避免 VS Code webview 重载后空白)
      const next = msg.lang ?? "zh-cn";
      const nextPref = msg.languagePref ?? state.languagePref;
      state.languagePref = nextPref;
      if (next !== state.lang) {
        state.lang = next;
        applyLanguage();
      } else {
        panels.refreshSettings();
      }
      break;
    }
    case "notice": {
      // 操作反馈走浮动 toast,不再作为对话条目插入聊天流
      showToast(msg.message ?? "", msg.level ?? "info");
      break;
    }
    case "permissionUnavailable": {
      // 部署未提供会话内权限切换通道:给出可操作的引导(跳转"默认权限预设"设置)
      showToast(t("当前部署未提供会话内权限切换通道,会话权限未变更。可为新会话设定默认权限。"), "warning", {
        label: t("默认权限设置"),
        onClick: () => panels.openSettings(),
      });
      break;
    }
    case "agentDirs": {
      state.agentDirs = { claude: true, codex: true, githubCopilot: true, dshUserSkills: true, ...(msg.value ?? {}) };
      panels.refreshSettings();
      break;
    }
    default:
      break;
  }
}

function sendCurrent() {
  const text = input.value.trim();
  const images = state.images.slice();
  if (!text && images.length === 0) return;
  if (!state.current) {
    appendNode({ kind: "note", key: `note:${Date.now()}`, el: null, text: t("⚠️ 尚未选择会话,点击 ＋ 新建一个会话") });
    return;
  }
  // 上下文守卫:接近/超出窗口时先把风险说清楚,并给一键压缩(issue #19);不阻断发送
  warnIfContextTight(state.current, text);
  vscode.postMessage({
    kind: "send",
    text,
    images,
    attachments: state.attachments.map(({ kind, path }) => ({ kind, path })),
  });
  // 记录输入历史(issue #20):↑/↓ 可调回;连续重复不重复入栈(与 shell 一致)
  if (text) rememberInput(text);
  state.images = [];
  renderAttachments();
  input.value = "";
  autoResize();
  updateSendButton();
}

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (msg && typeof msg === "object") handleMessage(msg);
});

vscode.postMessage({ kind: "ready" });
