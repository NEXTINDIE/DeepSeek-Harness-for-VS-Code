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
  event: { type: string; seq: number; time: number; data: any };
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
}

interface BlockState {
  type: "text" | "reasoning";
  text: string;
  el: HTMLElement | null;
}

interface NodeState {
  kind: "user" | "assistant" | "tool" | "queued" | "note" | "files" | "attach" | "turn-divider";
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
  /** 用户消息携带的图片引用(官方 image 内容块) */
  images?: { attachmentId: string; mediaType?: string }[];
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
  context: undefined as { pressureTokens?: number; projectedTokens?: number; contextWindow?: number } | undefined,
  permissions: undefined as { options: { value: string; name: string; description?: string }[]; currentValue: string } | undefined,
  /** 各轮 turn/start 的 seq,用于"回退到上一轮" */
  turnStarts: [] as number[],
  /** 回合级 Git 回退快照(服务端插件写入 .dsh/rollback,宿主推送可用清单) */
  rollback: undefined as { sessionId: string; available: boolean; checkpoints: { turn: number; time: number }[] } | undefined,
  /** 计划模式状态(plan/mode 事件) */
  planMode: false,
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
    description: "功能完整的编码 Agent,支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。",
  },
  code: {
    name: "编码模式",
    description: "具备标准模式的全部能力,并通过 Code Mode SDK 呈现工具,让模型用一个 TypeScript 程序组合多步操作。",
  },
  minimal: {
    name: "极简模式",
    description: "仅提供持久 bash 与 str_replace_editor 的双工具编码 Agent。",
  },
  cordis: {
    name: "创造模式",
    description: "用于创建自定义 Agent preset:具备标准模式的全部能力,并提供运行时检查、插件实验和 preset 创作指导。",
  },
};

/** 与网页端 presetDisplayText 同款:内置(system)预设按 id 本地化,用户预设用文件元数据。 */
function presetDisplayText(preset: { id: string; name?: string; description?: string; trust?: string }): { name: string; description?: string } {
  const keys = preset.trust === "system" ? BUILT_IN_PRESET_TEXTS[preset.id] : undefined;
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
  "模型": "Model",
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
  "{turns} 轮 · {steps} 步": "{turns} turns · {steps} steps",
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
  "☑ 任务 · {a} 进行中 · {b} 待处理": "☑ Tasks · {a} in progress · {b} pending",
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
  "插入 /compact 到输入框,回车执行": "Insert /compact into the input; press Enter to run",
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
  "{n} 轮 · {m} 步": "{n} turns · {m} steps",
  "LLM {d} · 工具 {t}": "LLM {d} · tools {t}",
  "首 token 平均 {s}s": "first token avg {s}s",
  "缓存命中 {p}%": "cache hit {p}%",
  "输入 {i} tok · 输出 {o} tok": "in {i} tok · out {o} tok",
  "文件夹": "Folder",
  "文件": "File",
  "移除附件": "Remove attachment",
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
  // ---- 内置 Agent 预设(按 id 本地化,与网页端一致) ----
  "标准模式": "Standard mode",
  "功能完整的编码 Agent,支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。": "Full coding agent with file editing, shell, file and web search, skills, planning, goals, subagents, and workflows.",
  "编码模式": "PTC mode",
  "具备标准模式的全部能力,并通过 Code Mode SDK 呈现工具,让模型用一个 TypeScript 程序组合多步操作。": "All Standard mode capabilities, with tools exposed through the Code Mode SDK so the model can combine multi-step operations in one TypeScript program.",
  "极简模式": "Minimal mode",
  "仅提供持久 bash 与 str_replace_editor 的双工具编码 Agent。": "Two-tool coding agent with persistent bash and str_replace_editor.",
  "创造模式": "Creator mode",
  "用于创建自定义 Agent preset:具备标准模式的全部能力,并提供运行时检查、插件实验和 preset 创作指导。": "Built for creating custom agent presets, with all Standard mode capabilities plus runtime inspection, plugin experiments, and preset-authoring guidance.",
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
const btnNew = el("button", "btn btn-icon");
btnNew.title = t("新建会话");
btnNew.append(lineIcon(ICONS.plus));
const btnMore = el("button", "btn btn-icon");
btnMore.title = t("会话操作:分叉 / 重命名 / 归档");
btnMore.append(lineIcon(ICONS.more));
const btnWorkspaces = el("button", "btn btn-icon");
btnWorkspaces.title = t("工作区(分组 / 搜索 / 归档)");
btnWorkspaces.append(lineIcon(ICONS.box, 15));
const btnJobs = el("button", "btn btn-icon");
btnJobs.title = t("后台任务");
btnJobs.append(lineIcon(ICONS.list, 15));
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

// 会话操作菜单(挂在 ⋯ 按钮的锚点上,随按钮位置展开)
const sessionMenu = el("div", "session-menu");
sessionMenu.hidden = true;
const menuRename = el("button", "session-menu-item", t("✏️ 重命名会话"));
const menuFork = el("button", "session-menu-item", t("🔀 分叉会话"));
const menuArchive = el("button", "session-menu-item", t("🗄️ 归档会话"));
sessionMenu.append(menuRename, menuFork, menuArchive);
const moreAnchor = el("div", "session-menu-anchor");
moreAnchor.append(btnMore, sessionMenu);

headerSessionRow.append(sessionSelectWrap, moreAnchor, btnNew);
const toolLeft = el("div", "header-tools");
// 子代理目录按钮(网页端 session.header.actions 目录树同款定位:单个按钮 + 展开目录,不占对话空间)
const btnSubagents = el("button", "btn btn-icon");
btnSubagents.title = t("子代理目录");
btnSubagents.append(el("span", "btn-emoji", "🤖"));
const subagentsBadge = el("span", "btn-badge");
subagentsBadge.hidden = true;
btnSubagents.append(subagentsBadge);
toolLeft.append(btnWorkspaces, btnJobs, btnTrajectory, btnSettings, btnSubagents);
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
const dialogRow = el("div", "dialog-actions");
const dialogCancel = el("button", "btn dialog-cancel", t("取消"));
const dialogConfirm2 = el("button", "btn dialog-confirm2", t("清除"));
const dialogConfirm = el("button", "btn dialog-confirm", t("确定"));
dialogRow.append(dialogCancel, dialogConfirm2, dialogConfirm);
dialogBox.append(dialogTitle, dialogText, dialogInput, dialogRow);
dialogOverlay.append(dialogBox);
root.append(dialogOverlay);

/** 显示对话框;input=true 时返回输入内容(空串视为取消),否则确认返回 "yes"、第二确认返回 "alt"、取消返回 null。 */
function showDialog(opts: { title: string; text: string; input?: boolean; confirmLabel?: string; confirm2Label?: string; value?: string }): Promise<string | null> {
  return new Promise((resolve) => {
    dialogTitle.textContent = opts.title;
    dialogText.textContent = opts.text;
    dialogConfirm.textContent = opts.confirmLabel ?? t("确定");
    dialogConfirm2.textContent = opts.confirm2Label ?? t("清除");
    dialogConfirm2.hidden = !opts.confirm2Label || !!opts.input;
    dialogInput.value = opts.value ?? "";
    dialogInput.hidden = !opts.input;
    dialogOverlay.hidden = false;
    if (opts.input) {
      dialogInput.focus();
      dialogInput.select();
    } else {
      dialogConfirm.focus();
    }
    const finish = (value: string | null) => {
      dialogOverlay.hidden = true;
      dialogCancel.onclick = null;
      dialogConfirm.onclick = null;
      dialogConfirm2.onclick = null;
      dialogInput.onkeydown = null;
      resolve(value);
    };
    dialogCancel.onclick = () => finish(null);
    dialogConfirm.onclick = () => finish(opts.input ? dialogInput.value : "yes");
    dialogConfirm2.onclick = () => finish("alt");
    dialogInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish(opts.input ? dialogInput.value : "yes");
      } else if (e.key === "Escape") {
        finish(null);
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

// 附件行:左上角 + 添加文件按钮 + 附件芯片(自动附加激活文件 / 手动选择)
const attachmentsRow = el("div", "attachments-row");

// 图片附件行(官方 image 内容块,独立于文本附件)
const imagesRow = el("div", "images-row");
imagesRow.hidden = true;

function toolSelect(label: string, title: string): { wrap: HTMLElement; select: HTMLSelectElement; label: HTMLElement } {
  const wrap = el("label", "tool-item");
  wrap.title = title;
  const labelEl = el("span", "tool-label", label);
  wrap.append(labelEl);
  const select = el("select", "tool-select");
  wrap.append(select);
  return { wrap, select, label: labelEl };
}

// 思考:位于输入框右上角;模型:位于输入框右下角;预设:位于输入框右上角(仅新会话)
const thinkingTool = toolSelect(t("思考"), t("思考深度(推理强度)"));
const thinkingSelect = thinkingTool.select;
const modelTool = toolSelect(t("模型"), t("模型"));
const modelSelect = modelTool.select;
const presetTool = toolSelect(t("预设"), t("Agent 预设"));
const presetSelect = presetTool.select;
const composerRight = el("div", "composer-right");
composerRight.append(modelTool.wrap);

const inputWrap = el("div", "input-wrap");
const input = el("textarea", "input");
input.placeholder = t("向 DeepSeek Harness 发送消息…");
const sendCol = el("div", "send-col");
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
const todoPanel = el("details", "todo-panel");
todoPanel.hidden = true;
/** 会话统计行:位于输入框最底部(网页端 composer.dock 同款),始终可见 */
const statsLine = el("div", "stats-line");
statsLine.hidden = true;
const contextBar = el("div", "context-bar");
contextBar.hidden = true;
conversationBottom.append(btnBackToMain, todoPanel, contextBar);

// 状态行:回合活动指示(深度思考中… 3秒)与 计划模式/目标 芯片同行(位于输入框上方)
const statusRow = el("div", "status-row");
statusRow.append(turnStatus, modeChips);

// 输入框底部行:左下角 / 命令菜单、权限选择;右下角 模型
const composerBottom = el("div", "composer-bottom");
const btnPlus = el("button", "btn-icon-btn plus-btn");
btnPlus.title = t("输入命令(/plan、/compact、.claude 命令…)");
btnPlus.append(lineIcon(ICONS.slash, 15));
const btnAddAttach = el("button", "attach-add-btn");
btnAddAttach.title = t("添加文件或文件夹到对话");
btnAddAttach.append(lineIcon(ICONS.plus, 12));
const permissionTool = toolSelect(t("权限"), t("读写权限(沙箱模式 + 审批策略)"));
const permissionSelect = permissionTool.select;
// 底部行:左下角 / 命令菜单、权限选择;右下角 模型
composerBottom.append(btnPlus, permissionTool.wrap, composerRight);
// 发送提示:独占一行,位于输入框左下角
const hint = el("div", "hint", t("Enter 发送 · Shift+Enter 换行"));
const hintRow = el("div", "hint-row");
hintRow.append(hint);
// 对话框顶部行:左上角 ＋ 添加文件 + 附件芯片;右上角 预设胶囊(仅新会话) + 思考
const composerTop = el("div", "composer-top");
attachmentsRow.append(btnAddAttach);
composerTop.append(attachmentsRow, presetTool.wrap, thinkingTool.wrap);
composer.append(imagesRow, composerTop, inputWrap, composerBottom, hintRow);

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

/** 当前提及状态:替换起点、查询串、候选与选中下标。 */
let mentionState: { start: number; query: string; items: { name: string; description?: string }[]; selected: number } | null = null;

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

function closeMention() {
  mentionState = null;
  mentionMenu.hidden = true;
}

function renderMentionMenu() {
  if (!mentionState) return;
  mentionMenu.innerHTML = "";
  mentionMenu.append(el("div", "plus-menu-label", t("智能体")));
  mentionState.items.forEach((item, i) => {
    const row = el("button", "plus-menu-item" + (i === mentionState!.selected ? " mention-selected" : ""));
    const main = el("span", "mention-item-main");
    main.append(el("span", "mention-item-name", `@${item.name}`));
    if (item.description) main.append(el("span", "mention-item-desc", item.description));
    row.append("🤖 ", main);
    // 防止点击弹层时输入框先失焦(blur 会先关闭弹层)
    row.addEventListener("mousedown", (e) => e.preventDefault());
    row.addEventListener("click", () => selectMention(item.name));
    mentionMenu.append(row);
  });
  mentionMenu.hidden = false;
}

/** 用所选智能体替换当前部分 @token。 */
function selectMention(name: string) {
  if (!mentionState) return;
  const pos = input.selectionStart ?? input.value.length;
  input.value = input.value.slice(0, mentionState.start) + `@${name} ` + input.value.slice(pos);
  closeMention();
  input.focus();
  autoResize();
  updateSendButton();
}

/** 按光标前的 @partial 更新提及候选。 */
function updateMention() {
  const pos = input.selectionStart ?? input.value.length;
  const before = input.value.slice(0, pos);
  const m = before.match(/@([A-Za-z0-9][\w.-]*)$/);
  if (!m) {
    closeMention();
    return;
  }
  const query = m[1].toLowerCase();
  const items = availableAgents().filter((a) => a.name.toLowerCase().includes(query)).slice(0, 8);
  if (items.length === 0) {
    closeMention();
    return;
  }
  closeSlash(); // @ 提及优先
  mentionState = { start: pos - m[0].length, query: m[1], items, selected: 0 };
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
    row.append("⌘ ", main);
    row.addEventListener("mousedown", (e) => e.preventDefault());
    row.addEventListener("click", () => selectSlash(item.token));
    slashMenu.append(row);
  });
  slashMenu.hidden = false;
}

/** 用所选命令/技能替换当前部分 /token。 */
function selectSlash(token: string) {
  if (!slashState) return;
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
input.addEventListener("input", () => {
  autoResize();
  updateSendButton();
  updateMention();
  updateSlash();
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
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      selectMention(mentionState.items[mentionState.selected].name);
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
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      selectSlash(slashState.items[slashState.selected].token);
      return;
    }
  }
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendCurrent();
  }
});
input.addEventListener("blur", () => {
  closeMention();
  closeSlash();
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
thinkingSelect.addEventListener("change", () => {
  const m = state.models?.current;
  if (!m) return;
  vscode.postMessage({ kind: "selectModel", provider: m.provider, model: m.model, effort: thinkingSelect.value });
});
modelSelect.addEventListener("change", () => {
  const [provider, model] = modelSelect.value.split("|");
  if (!provider || !model) return;
  vscode.postMessage({ kind: "selectModel", provider, model, effort: state.models?.current?.reasoningEffort });
});
presetSelect.addEventListener("change", () => {
  if (presetSelect.value) vscode.postMessage({ kind: "selectPreset", preset: presetSelect.value });
});
permissionSelect.addEventListener("change", () => {
  // 直接应用:通过官方 /permission 命令切换(新回合即按该权限执行),命令消息以系统提示折叠显示,不进入输入框
  if (!permissionSelect.value) return;
  const preset = permissionSelect.value;
  // 乐观更新:立即显示所选值,服务器 projection 到达后再次校准
  state.permissions = { ...(state.permissions ?? { options: [], currentValue: "" }), currentValue: preset };
  renderPermissionsSelect();
  vscode.postMessage({ kind: "permission", preset });
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
  item("🗜️", t("压缩上下文"), () => insert("/compact"), t("插入 /compact 到输入框,回车执行"));
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
          renderPermissionsSelect();
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

// ---------- 渲染:消息 ----------

function appendNode(node: NodeState) {
  node.el = renderNode(node);
  messages.appendChild(node.el);
  state.nodes.push(node);
  scrollToBottom();
}

function renderNode(node: NodeState): HTMLElement {
  switch (node.kind) {
    case "user": {
      const wrap = el("div", "msg msg-user");
      const body = el("div", "msg-body");
      setHtml(body, node.text ?? "");
      wrap.append(body);
      if (node.images && node.images.length > 0) {
        const imgRow = el("div", "msg-images");
        for (const img of node.images) {
          const frame = el("div", "msg-image-frame");
          const placeholder = el("div", "msg-image-placeholder", "🖼️ …");
          frame.dataset.attachmentId = img.attachmentId;
          frame.append(placeholder);
          imgRow.append(frame);
          vscode.postMessage({ kind: "attachmentRead", attachmentId: img.attachmentId, messageId: node.key });
        }
        wrap.append(imgRow);
      }
      return wrap;
    }
    case "note": {
      const wrap = el("div", "msg msg-note");
      if (node.cmd) {
        // 斜杠命令执行记录:小字命令行,不展开
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
        void showDialog({ title: t("编辑排队消息"), text: t("修改后立即生效"), input: true, value: node.text ?? "" }).then((v) => {
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
      // 工具执行过程行(网页端 tool view 同款):图标 + 名称 + 状态 + 参数预览,点击展开参数/结果
      const wrap = el("details", "msg tool-card" + (node.done ? (node.failed ? " tool-failed" : " tool-done") : " tool-running"));
      const summary = el("summary", "tool-summary");
      const nameSpan = el("span", "tool-name");
      nameSpan.append(el("span", "tool-icon", toolIcon(node.name)));
      nameSpan.append(el("span", "tool-name-text", node.name ?? "tool"));
      summary.append(nameSpan);
      const statusSpan = el("span", "tool-status" + (node.done ? (node.failed ? " tool-status-failed" : " tool-status-done") : " tool-status-running"), node.done ? (node.failed ? "✗" : "✓") : "⏳");
      summary.append(statusSpan);
      if (node.args) {
        const preview = el("span", "tool-args-preview");
        preview.textContent = String(node.args).replace(/\s+/g, " ").slice(0, 90);
        summary.append(preview);
      }
      const body = el("div", "tool-body");
      const argsLabel = el("div", "tool-label", t("参数"));
      const argsPre = el("pre", "tool-pre", node.args ?? "");
      body.append(argsLabel, argsPre);
      if (node.result !== undefined) {
        body.append(el("div", "tool-label", t("结果")), el("pre", "tool-pre", node.result));
      }
      wrap.append(summary, body);
      return wrap;
    }
    case "files": {
      return buildFilesCard(node.files ?? []);
    }
  }
}

/** 产物文件列表框(网页端 ProducedFiles 同款:最多 6 条,余量折叠 +N;点击在 VS Code 打开)。 */
function buildFilesCard(files: string[]): HTMLElement {
  const wrap = el("div", "files-card");
  const head = el("div", "files-card-head");
  head.append(lineIcon(ICONS.box, 13), el("span", undefined, t("产物 ({n})", { n: String(files.length) })));
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

/** 把本轮产物渲染进助手消息的产物容器(位于操作条之前);无产物时隐藏容器。 */
function renderNodeFiles(node: NodeState) {
  if (!node.filesEl) return;
  node.filesEl.innerHTML = "";
  const files = node.deliverables ?? [];
  node.filesEl.hidden = files.length === 0;
  if (files.length > 0) node.filesEl.append(buildFilesCard(files));
}

function findAssistantTail(): NodeState | undefined {
  for (let i = state.nodes.length - 1; i >= 0; i--) {
    if (state.nodes[i].kind === "assistant") return state.nodes[i];
  }
  return undefined;
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
  const block: BlockState = { type: blockType === "reasoning" ? "reasoning" : "text", text: "", el: null };
  assistant.blocks!.push(block);
  state.streamedBlockKeys.add(`${turn}:${step}:${index}`);
  // 先把 streamBlock 指向新块再渲染:推理块开始时 detail 默认展开(思考中),文本块开始后自动收起
  state.streamBlock = block;
  refreshAssistantNode(assistant, block);
}

/** 思考折叠条文案:💭 思考过程 · 耗时(网页端 Think 折叠同款)。 */
function reasoningSummary(assistant: NodeState, first: boolean): string {
  const base = t("💭 思考过程");
  if (first && assistant.reasoningMs !== undefined) return `${base} · ${fmtDuration(assistant.reasoningMs)}`;
  return base;
}

/** 渲染助手内容:推理/文本块与内联工具行按执行顺序交错(Think → 工具 → Think → 答案)。 */
function renderAssistantBlocks(assistant: NodeState): HTMLElement {
  const container = el("div", "msg-blocks");
  const tools = assistant.tools ?? [];
  const appendToolsAfter = (index: number) => {
    for (const t of tools) {
      if ((t.afterBlock ?? -1) !== index) continue;
      if (!t.el) t.el = renderNode(t);
      container.append(t.el);
    }
  };
  appendToolsAfter(-1);
  let seenReasoning = false;
  (assistant.blocks ?? []).forEach((block, index) => {
    if (block.type === "reasoning") {
      const first = !seenReasoning;
      seenReasoning = true;
      // 思考进行中默认展开,思考结束(下一个块开始)后收起 —— 与网页端 Think 折叠一致
      const details = el("details", "block-reasoning-details");
      if (block === state.streamBlock && state.running) details.open = true;
      details.append(el("summary", "block-reasoning-summary", reasoningSummary(assistant, first)));
      const body = el("div", "block-body");
      setHtml(body, block.text);
      block.el = body;
      details.append(body);
      container.append(details);
    } else {
      const bwrap = el("div", "block");
      const body = el("div", "block-body");
      setHtml(body, block.text);
      block.el = body;
      bwrap.append(body);
      container.append(bwrap);
    }
    appendToolsAfter(index);
  });
  return container;
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
  if (!state.streamBlock) return;
  if ((state.streamBlock.type === "reasoning") !== (blockType === "reasoning")) return;
  state.streamBlock.text += text;
  if (state.replaying) return; // 重放期间仅累积文本,最终由 assistant/message 一次性渲染
  if (state.streamBlock.el) setHtml(state.streamBlock.el, state.streamBlock.text);
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
  // 名称/图标
  const icon = node.el.querySelector(".tool-icon");
  if (icon) icon.textContent = toolIcon(node.name);
  const name = node.el.querySelector(".tool-name-text");
  if (name) name.textContent = node.name ?? "tool";
  // 状态
  const status = node.el.querySelector(".tool-status");
  if (status) {
    status.textContent = node.done ? (node.failed ? "✗" : "✓") : "⏳";
    status.className = "tool-status" + (node.done ? (node.failed ? " tool-status-failed" : " tool-status-done") : " tool-status-running");
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

  // 点赞 / 点踩(官方 /feedback 命令记录)
  const up = actionBtn(ICONS.up, t("好的回答(记录反馈)"), () => {
    if (node.feedback === "positive") return;
    node.feedback = "positive";
    vscode.postMessage({ kind: "feedback", rating: "positive", snippet: node.plainText ?? "" });
    renderActions(node);
  });
  const down = actionBtn(ICONS.down, t("差的回答(记录反馈)"), () => {
    if (node.feedback === "negative") return;
    node.feedback = "negative";
    vscode.postMessage({ kind: "feedback", rating: "negative", snippet: node.plainText ?? "" });
    renderActions(node);
  });
  if (node.feedback === "positive") up.classList.add("selected-positive");
  if (node.feedback === "negative") down.classList.add("selected-negative");
}

// ---------- 事件折叠 ----------

function handleEvent(wire: WireEvent) {
  const ev = wire.event;
  if (state.seqs.has(ev.seq)) return;
  state.seqs.add(ev.seq);
  state.rawEvents.push(wire);
  const data = ev.data ?? {};

  switch (ev.type) {    case "user/message": {
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
      const images: { attachmentId: string; mediaType?: string }[] = (data?.message?.content ?? data?.content ?? [])
        .filter((b: any) => b?.type === "image" && b?.attachment?.attachmentId)
        .map((b: any) => ({ attachmentId: b.attachment.attachmentId, mediaType: b.attachment.mediaType }));
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
    case "assistant/chunk": {
      const chunk = data?.chunk ?? {};
      switch (chunk.type) {
        case "block-start":
          beginAssistantBlock(data?.turn ?? 0, data?.step ?? 0, chunk.index ?? 0, chunk.blockType ?? "text", ev.time);
          // 输入框上方活动指示:推理 → 深度思考中…,文本 → 生成回答…
          if (state.running && turnStatus.hidden) startTurnStatus(ev.time);
          setTurnStatusActivity(chunk.blockType === "reasoning" || chunk.blockType === "text" ? chunk.blockType : "reasoning");
          break;
        case "text-delta":
          appendToStream("text", chunk.text ?? "");
          break;
        case "reasoning-delta":
          appendToStream("reasoning", chunk.text ?? "");
          break;
        default:
          break;
      }
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
      // 追加未被流式覆盖的文本/推理块(流式期间已追加过的跳过)
      let addedText = "";
      for (let i = 0; i < content.length; i++) {
        const block = content[i];
        if (block?.type !== "text" && block?.type !== "reasoning") continue;
        if (typeof block.text !== "string") continue;
        const key = `${turn}:${step}:${i}`;
        if (state.streamedBlockKeys.has(key)) continue;
        state.streamedBlockKeys.add(key);
        assistant.blocks!.push({ type: block.type === "reasoning" ? "reasoning" : "text", text: block.text, el: null });
        if (block.type === "text") addedText += block.text + "\n";
      }
      if (addedText) assistant.plainText = ((assistant.plainText ?? "") + "\n" + addedText.trim()).trim();
      refreshAssistantNode(assistant, undefined, true); // 重放/实时均在此一次性渲染最终内容
      // 回合级元信息与操作条(最终一步的数据生效)
      assistant.seq = ev.seq;
      assistant.deliverables = [...turnProduced];
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
      setTurnStatusActivity("tool");
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
          const preview = existing.el.querySelector(".tool-args-preview");
          if (preview) preview.textContent = String(existing.args ?? "").replace(/\s+/g, " ").slice(0, 90);
          updateToolSummary(existing);
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
      state.nodes.push(node);
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
        // 与网页端一致:content[0].isError 才是失败标志(顶层 isError 仅兜底)
        const isError = data?.message?.isError === true || data?.isError === true || data?.message?.content?.[0]?.isError === true;
        existing.failed = isError;
        existing.done = true;
        existing.el?.classList.remove("tool-running");
        existing.el?.classList.add(existing.failed ? "tool-failed" : "tool-done");
        if (existing.el) {
          const pres = existing.el.querySelectorAll(".tool-pre");
          if (pres.length === 1) {
            const body = existing.el.querySelector(".tool-body");
            body?.append(el("div", "tool-label", t("结果")), el("pre", "tool-pre", existing.result ?? ""));
          }
          updateToolSummary(existing);
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
      renderModeChips();
      break;
    }
    case "turn/end": {
      state.running = false;
      state.streamBlock = null;
      state.streamKey = null;
      stopTurnStatus();
      const finishedTurn = state.currentStreamTurn;
      state.currentStreamTurn = undefined;
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
      break;
    }
    default:
      break;
  }
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

function truncateResult(text: string): string {
  const max = 4000;
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n" + t("…(已截断,共 {n} 字符)", { n: String(text.length) });
}

// ---------- 模式指示芯片(计划模式 / 目标模式) ----------

/** 当前打开的锚定弹层(全局唯一,避免重复堆叠)。 */
let activePopover: HTMLElement | null = null;

function closeActivePopover() {
  activePopover?.remove();
  activePopover = null;
}

/** 在锚点下方打开一个固定定位弹层(挂载到根节点,不受芯片重渲染影响)。 */
function openAnchoredMenu(anchor: HTMLElement, build: (menu: HTMLElement) => void): HTMLElement {
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
  menu.addEventListener("click", (ev) => ev.stopPropagation());
  const close = () => {
    if (activePopover === menu) {
      menu.remove();
      activePopover = null;
    }
  };
  setTimeout(() => document.addEventListener("click", close, { once: true }), 0);
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
  const sig = `${state.planMode}|${inner?.id ?? ""}|${inner?.phase ?? ""}`;
  if (sig === chipsSignature) return;
  chipsSignature = sig;
  modeChips.innerHTML = "";
  if (state.planMode) {
    const chip = el("span", "mode-chip plan-chip", t("📝 计划模式"));
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

/** 运行中指示(旋转动画的 ⏳ 沙漏)。 */
function runningEmoji(): HTMLElement {
  return el("span", "running-emoji", "⏳");
}

/** 会话状态徽标(待审批 / 计划待审 / 等待回答 / 运行中)。 */
function pendingBadge(pending: { kind: "approval" | "question" | "plan-review" }): HTMLElement {
  if (pending.kind === "approval") return el("span", "session-badge badge-approval", `🛡️ ${t("等待审批")}`);
  if (pending.kind === "plan-review") return el("span", "session-badge badge-plan", `📋 ${t("计划待审")}`);
  return el("span", "session-badge badge-question", `❓ ${t("等待回答")}`);
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
    badge.append(runningEmoji());
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
    const title = `${branch}${s.blank ? "🆕" : "💬"} ${s.sessionId.slice(0, 12)}`;
    main.append(el("span", "session-row-title", s.title || title));
    const subBits: string[] = [];
    if (s.cwd) subBits.push(basename(s.cwd));
    if (s.agentPreset) subBits.push(presetName(s.agentPreset));
    if (subBits.length) main.append(el("span", "session-row-sub", subBits.join(" · ")));
    row.append(main);
    if (s.pending) row.append(pendingBadge(s.pending));
    else if (s.running) {
      const badge = el("span", "session-badge badge-running");
      badge.append(runningEmoji());
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

function renderThinkingSelect() {
  const m = state.models?.current;
  const modelInfo = m ? findModel(m.provider, m.model) : undefined;
  const efforts = modelInfo?.reasoning?.efforts ?? [];
  thinkingSelect.innerHTML = "";
  const def = el("option", undefined, t("默认"));
  def.value = "";
  thinkingSelect.append(def);
  for (const effort of efforts) {
    const option = el("option", undefined, effort.name || effort.id);
    option.value = effort.id;
    if (m?.reasoningEffort === effort.id) option.selected = true;
    thinkingSelect.append(option);
  }
  thinkingSelect.disabled = efforts.length === 0;
}

function findModel(provider: string, model: string): ModelInfo | undefined {
  return state.models?.groups.find((g) => g.id === provider)?.models.find((m) => m.id === model);
}

function renderModelSelect() {
  const m = state.models?.current;
  const groups = state.models?.groups ?? [];
  const multiGroup = groups.length > 1;
  modelSelect.innerHTML = "";
  let currentInList = false;
  for (const g of groups) {
    for (const model of g.models) {
      const option = el("option", undefined, multiGroup ? `${g.name} / ${model.name}` : model.name);
      option.value = `${g.id}|${model.id}`;
      if (m && m.provider === g.id && m.model === model.id) {
        option.selected = true;
        currentInList = true;
      }
      modelSelect.append(option);
    }
  }
  // 当前模型不在目录(例如临时模型)时,补一个只读占位项
  if (m && !currentInList) {
    const option = el("option", undefined, modelName(m.provider, m.model));
    option.value = `${m.provider}|${m.model}`;
    option.selected = true;
    modelSelect.prepend(option);
  }
  modelSelect.disabled = groups.length === 0;
}

function groupName(id: string): string {
  return state.models?.groups.find((g) => g.id === id)?.name ?? id;
}

function modelName(provider: string, id: string): string {
  return findModel(provider, id)?.name ?? id;
}

function renderPresetSelect() {
  const current = state.sessions.find((s) => s.sessionId === state.current);
  const presets = state.presets ?? [];
  // 服务器限制:已开始的会话预设不可更改(agent preset is fixed),切换器只对新会话显示
  const switchable = (current?.blank ?? true);
  presetTool.wrap.hidden = !switchable;
  if (!switchable) return;
  presetSelect.innerHTML = "";
  let currentInList = false;
  for (const preset of presets) {
    const option = el("option", undefined, presetLabel(preset.id) + (preset.isDefault ? t(" · 默认") : ""));
    option.value = preset.id;
    if (current?.agentPreset === preset.id) {
      option.selected = true;
      currentInList = true;
    }
    presetSelect.append(option);
  }
  // 当前预设不在列表(自定义/已移除)时,补一个只读占位项
  if (current?.agentPreset && !currentInList) {
    const option = el("option", undefined, presetLabel(current.agentPreset));
    option.value = current.agentPreset;
    option.selected = true;
    presetSelect.prepend(option);
  }
  presetSelect.disabled = presets.length === 0;
}

function presetLabel(id: string): string {
  return presetName(id);
}

function renderPermissionsSelect() {
  const options = state.permissions?.options ?? [];
  permissionSelect.innerHTML = "";
  const current = state.permissions?.currentValue;
  let currentInList = false;
  for (const option of options) {
    // 选项文本带权限图标:完全访问(危险)使用红色 ⚠️ 警告标识
    const item = el("option", undefined, `${permissionIcon(option.value)} ${permissionLabel(option.value, option.name)}`);
    item.value = option.value;
    if (current === option.value) {
      item.selected = true;
      currentInList = true;
    }
    permissionSelect.append(item);
  }
  // 当前权限不在预设列表(自定义组合)时,补一个只读占位项
  if (current && !currentInList) {
    const item = el("option", undefined, `${permissionIcon(current)} ${permissionLabel(current)}`);
    item.value = current;
    item.selected = true;
    permissionSelect.prepend(item);
  }
  permissionSelect.disabled = options.length === 0;
}

function renderContextBar() {
  const c = state.context;
  if (!c || typeof c.pressureTokens !== "number" || typeof c.contextWindow !== "number" || c.contextWindow <= 0) {
    contextBar.hidden = true;
    return;
  }
  contextBar.hidden = false;
  const pct = Math.max(0, Math.min(100, Math.round((c.pressureTokens / c.contextWindow) * 100)));
  contextBar.innerHTML = "";
  contextBar.title =
    t("已用 {a} / {b} tokens", { a: c.pressureTokens.toLocaleString(), b: c.contextWindow.toLocaleString() }) +
    (typeof c.projectedTokens === "number" ? t("(预计本轮后 {n})", { n: c.projectedTokens.toLocaleString() }) : "");
  const label = el("span", "context-label", t("上下文 {p}%", { p: String(pct) }));
  const bar = el("span", "context-fill-wrap");
  const fill = el("span", "context-fill");
  fill.style.width = `${pct}%`;
  fill.className = pct > 85 ? "context-fill hot" : pct > 60 ? "context-fill warm" : "context-fill";
  bar.append(fill);
  contextBar.append(label, bar);
}

// ---------- 会话统计行(上下文条上方) ----------

/** 待办事项面板(Codex 风格:任务进度摘要 + 清单)。 */
function renderTodos() {
  todoPanel.innerHTML = "";
  const list = state.todos;
  if (!Array.isArray(list) || list.length === 0) {
    todoPanel.hidden = true;
    return;
  }
  todoPanel.hidden = false;
  const inProgress = list.filter((t) => t.status === "in_progress").length;
  const pending = list.filter((t) => t.status === "pending").length;
  const summary = el("summary", "todo-panel-summary");
  summary.append(lineIcon(ICONS.box, 12), el("span", undefined, t("☑ 任务 · {a} 进行中 · {b} 待处理", { a: String(inProgress), b: String(pending) })));
  todoPanel.append(summary);
  const body = el("div", "todo-panel-body");
  for (const item of list) {
    const row = el("div", "todo-row" + (item.status === "completed" ? " done" : item.status === "in_progress" ? " active" : ""));
    const statusEl = el("span", "todo-status");
    if (item.status === "completed") statusEl.textContent = "✅";
    else if (item.status === "in_progress") statusEl.append(runningEmoji());
    else statusEl.textContent = "○";
    row.append(statusEl);
    row.append(el("span", "todo-content", item.content));
    body.append(row);
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
          const out = data?.usage?.outputTokens;
          if (typeof out === "number") decodeTokens += out;
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
  return { turns: turns.size, steps: stepStart.size, llmMs, toolMs, ttftMs, ttftSteps, decodeMs, decodeTokens };
}

function renderStatsLine() {
  const projected = state.stats?.sessionStats as {
    steps?: number; turns?: number; llmMs?: number; toolMs?: number;
    ttftMs?: number; ttftSteps?: number; decodeMs?: number; decodeTokens?: number;
  } | undefined;
  const tu = state.stats?.tokenUsage;
  // 与网页端一致:优先投影;投影缺失时从事件推导 —— 保证统计栏始终显示(有回合时)
  const st = (projected?.steps ?? 0) > 0 ? projected : (() => {
    const derived = deriveStatsFromEvents(state.rawEvents);
    return derived.steps > 0 ? derived : undefined;
  })();
  const parts: string[] = [];
  if (st) {
    if (typeof st.turns === "number") parts.push(t("{n} 轮 · {m} 步", { n: String(st.turns), m: String(st.steps ?? 0) }));
    if (typeof st.llmMs === "number") parts.push(t("LLM {d} · 工具 {t}", { d: fmtDuration(st.llmMs), t: fmtDuration(st.toolMs ?? 0) }));
    if (typeof st.ttftMs === "number" && (st.ttftSteps ?? 0) > 0) parts.push(t("首 token 平均 {s}s", { s: (st.ttftMs / st.ttftSteps! / 1000).toFixed(1) }));
    if (typeof st.decodeMs === "number" && st.decodeMs > 0 && typeof st.decodeTokens === "number") {
      parts.push(`${Math.round(st.decodeTokens / (st.decodeMs / 1000))} tok/s`);
    }
  }
  if (tu) {
    const uncached = tu.uncachedInputTokens ?? 0;
    const cached = tu.cacheReadTokens ?? 0;
    const input = uncached + cached;
    if (input > 0) {
      if (cached > 0) parts.push(t("缓存命中 {p}%", { p: String(Math.round((cached / input) * 100)) }));
      parts.push(t("输入 {i} tok · 输出 {o} tok", { i: fmtTokens(input), o: fmtTokens(tu.outputTokens ?? 0) }));
    }
  }
  statsLine.textContent = parts.join(" | ");
  statsLine.hidden = parts.length === 0;
}

// ---------- 附件行 ----------

function renderAttachments() {
  attachmentsRow.innerHTML = "";
  attachmentsRow.append(btnAddAttach);
  const list = state.attachments;
  for (const a of list) {
    const chip = el("span", "attachment-chip" + (a.auto ? " auto" : ""));
    chip.title = `${a.kind === "folder" ? t("文件夹") : t("文件")}: ${a.path}`;
    chip.append(lineIcon(a.kind === "folder" ? ICONS.box : ICONS.copy, 12));
    chip.append(el("span", "attachment-label", (a.auto ? t("激活文件 · ") : "") + a.label));
    const close = el("button", "chip-close", "×");
    close.title = t("移除附件");
    chip.append(close);
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

// ---------- 图片附件(官方 image 内容块) ----------

function renderImageChips() {
  imagesRow.innerHTML = "";
  for (const img of state.images) {
    const chip = el("span", "attachment-chip image-chip");
    chip.title = img.name;
    chip.append(lineIcon(ICONS.image, 12));
    chip.append(el("span", "attachment-label", img.name));
    const close = el("button", "chip-close", "×");
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      state.images = state.images.filter((x) => x !== img);
      renderImageChips();
    });
    chip.append(close);
    imagesRow.append(chip);
  }
  imagesRow.hidden = state.images.length === 0;
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

/** 打开子代理目录弹层(网页端 header catalog 的扁平版):头部右上角刷新,列表限高滚动。 */
function openSubagentCatalog() {
  const entries = state.subagents ?? [];
  openAnchoredMenu(btnSubagents, (menu) => {
    menu.classList.add("subagent-catalog");
    // 头部:标题 + 右上角刷新按钮(固定在列表之外,滚动时保持可见)
    const head = el("div", "subagent-catalog-head");
    head.append(el("div", "plus-menu-label", t("子代理目录")));
    const refresh = el("button", "subagent-catalog-refresh", "🔄");
    refresh.title = t("刷新");
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
        row.append(running ? runningEmoji() : el("span", undefined, "🤖"), el("span", undefined, " " + label));
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
    hint.textContent = state.running ? t("运行中 · 消息将排队发送") : t("Enter 发送 · Shift+Enter 换行");
  }
  btnSendStop.disabled = !state.current;
}

function updateStatus(status: HubStatus) {
  state.status = status;
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

    // ---------- 计划审批卡片(与网页端 PlanReviewPanel 一致:去聊天里说 / 拒绝 / 确认执行) ----------
    for (const item of planItems) {
      const card = el("div", "pending-card pending-question plan-card");
      const head = el("div", "question-head");
      head.append(el("span", "question-head-title", "📋 " + t("计划待审")));
      card.append(head);
      const planBox = el("div", "plan-detail-box");
      setHtml(planBox, item.detail ?? "");
      card.append(planBox);
      const intent = (item as { intent?: { kind?: string; approve?: string } }).intent;
      const approveOption = item.options?.find((o) => o.label === intent?.approve);
      const declineOption = item.options?.find((o) => o.label !== intent?.approve);
      // 与 Claude Code 一致:直接在审批内输入修改意见,回车发送自定义回答(不批准也不拒绝)
      const customRow = el("div", "custom-row plan-custom-row");
      customRow.append(lineIcon(ICONS.edit, 13));
      const customInput = el("input", "custom-answer-input");
      customInput.type = "text";
      customInput.placeholder = t("输入修改意见,回车发送");
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
      customInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendCustom();
        }
      });
      customRow.append(customInput);
      card.append(customRow);
      const actions = el("div", "question-footer-actions");
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
      // 确认执行:提交批准选项
      const approveBtn = el("button", "btn btn-allow", `✅ ${t("确认执行")}`);
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
      const title = el("div", "question-title");
      title.append(lineIcon(ICONS.help, 13), el("span", undefined, " " + item.question));
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

      // 自定义回答:输入即视为自定义(与网页端一致 —— 无独立"其他"单选)
      const customRow = el("div", "custom-row");
      customRow.append(lineIcon(ICONS.edit, 13));
      const customInput = el("input", "custom-answer-input");
      customInput.type = "text";
      customInput.placeholder = t("输入你的答案(填写即视为自定义回答)");
      customInput.value = draft.custom;
      customInput.addEventListener("input", () => {
        draft.custom = customInput.value;
        if (customInput.value.trim() && !item.multiSelect) draft.selected = [];
        draft.skipped = false;
        feedback.textContent = "";
      });
      customInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          continueFlow();
        }
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
    head.append(el("span", "approval-dot cordis-dot"), el("span", "approval-title", "🧩 " + t("Cordis 插件审批")));
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
    const allowOnce = el("button", "btn btn-allow", `✓ ${t("仅允许此版本")}`);
    allowOnce.title = t("仅授权当前版本运行,后续版本更新时需再次审批");
    allowOnce.addEventListener("click", () => {
      vscode.postMessage({ kind: "cordisApprove", request, approveFutureVersions: false });
      state.cordisRequests.delete(request.requestId);
      renderPending();
    });
    const allowPlugin = el("button", "btn btn-allow btn-allow-plugin", `✓✓ ${t("允许后续版本")}`);
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

/** 浮动 toast:显示操作反馈(信息 4s / 错误 8s),点击 × 关闭;可带一个动作按钮。 */
function showToast(message: string, level: string, action?: { label: string; onClick: () => void }) {
  if (!message) return;
  const toast = el("div", `toast toast-${level === "error" ? "error" : level === "warning" ? "warning" : "info"}`);
  toast.append(el("span", "toast-icon", level === "info" ? "ℹ️" : "⚠️"));
  toast.append(el("span", "toast-text", message));
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
  btnTrajectory.title = t("轨迹(事件台账)");
  btnSettings.title = t("设置(常规 / 模型 / 预设)");
  btnSubagents.title = t("子代理目录");
  btnBrowser.title = t("在浏览器中打开");
  btnCordis.title = t("Cordis 插件");
  btnPlus.title = t("输入命令(/plan、/compact、.claude 命令…)");
  btnAddAttach.title = t("添加文件或文件夹到对话");
  btnBackToMain.title = t("回到主线(父会话)");
  input.placeholder = t("向 DeepSeek Harness 发送消息…");
  thinkingTool.label.textContent = t("思考");
  thinkingTool.wrap.title = t("思考深度(推理强度)");
  modelTool.label.textContent = t("模型");
  modelTool.wrap.title = t("模型");
  presetTool.label.textContent = t("预设");
  presetTool.wrap.title = t("Agent 预设");
  permissionTool.label.textContent = t("权限");
  permissionTool.wrap.title = t("读写权限(沙箱模式 + 审批策略)");
  menuRename.textContent = t("✏️ 重命名会话");
  menuFork.textContent = t("🔀 分叉会话");
  menuArchive.textContent = t("🗄️ 归档会话");
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
  turnProduced = [];
  turnProducedSet.clear();
  turnCallViews.clear();
  messages.innerHTML = "";
  state.replaying = true;
  for (const wire of events) handleEvent(wire);
  applyQueueItems(queue);
  state.replaying = false;
  chipsSignature = "";
  renderSessions();
  renderThinkingSelect();
  renderModelSelect();
  renderPresetSelect();
  renderPermissionsSelect();
  renderGoal();
  renderModeChips();
  renderContextBar();
  renderStatsLine();
  renderTodos();
  renderAttachments();
  renderImageChips();
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
    case "init": {
      stopTurnStatus();
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
      state.permissions = msg.permissions;
      state.stats = msg.stats;
      state.todos = msg.todos;
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
      state.turnToolGroup = null;
      messages.innerHTML = "";
      state.replaying = true;
      for (const wire of msg.events ?? []) handleEvent(wire);
      applyQueueItems(msg.queue ?? []);
      state.replaying = false;
      renderLoadMoreButton();
      for (const approval of msg.approvals ?? []) state.approvals.set(approval.approvalId, approval);
      for (const question of msg.questions ?? []) state.questions.set(question.frameRpcId, question);
      // 持久化的计划文本文件:重启后重放时并入最后一个回合的产物卡,便于重新打开继续修改
      if (typeof msg.planFile === "string" && msg.planFile) {
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
      renderThinkingSelect();
      renderModelSelect();
      renderPresetSelect();
      renderPermissionsSelect();
      renderContextBar();
      renderStatsLine();
      renderTodos();
      updateRunning();
      updateStatus(state.status);
      if (state.current) {
        vscode.postMessage({ kind: "getModels" });
        vscode.postMessage({ kind: "getPresets" });
        vscode.postMessage({ kind: "getSkills" });
        vscode.postMessage({ kind: "getSubagents" });
        vscode.postMessage({ kind: "getActiveFile" });
        vscode.postMessage({ kind: "getClaudeConfig" });
      }
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
    case "subagentPreview": {
      const anchor = document.querySelector(".subagent-chip");
      const pop = el("div", "msg-popover");
      pop.append(el("div", "plus-menu-label", t("子代理最近回复")));
      pop.append(el("div", "subagent-preview", msg.preview ?? t("(暂无)")));
      pop.append(el("div", "plus-menu-label", t("完整历史请到 DSH 网页版查看")));
      conversationBottom.append(pop);
      pop.addEventListener("click", (e) => e.stopPropagation());
      const close = () => pop.remove();
      setTimeout(() => document.addEventListener("click", close, { once: true }), 0);
      void anchor;
      break;
    }
    case "delta": {
      for (const wire of msg.events ?? []) handleEvent(wire);
      break;
    }
    case "sessions": {
      state.sessions = msg.sessions ?? [];
      renderSessions();
      renderPresetSelect();
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
      renderThinkingSelect();
      renderModelSelect();
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
      renderPresetSelect();
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
      renderContextBar();
      break;
    }
    case "stats": {
      if (msg.sessionId && msg.sessionId !== state.current) break;
      state.stats = msg.value;
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
    case "permissions": {
      if (msg.sessionId && msg.sessionId !== state.current) break;
      state.permissions = msg.value;
      renderPermissionsSelect();
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
      turnProduced = [];
      turnProducedSet.clear();
      turnCallViews.clear();
      messages.innerHTML = "";
      state.replaying = true;
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
      renderImageChips();
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
  vscode.postMessage({
    kind: "send",
    text,
    images,
    attachments: state.attachments.map(({ kind, path }) => ({ kind, path })),
  });
  state.images = [];
  renderImageChips();
  input.value = "";
  autoResize();
  updateSendButton();
}

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (msg && typeof msg === "object") handleMessage(msg);
});

vscode.postMessage({ kind: "ready" });
