import "./safety";
import { marked } from "marked";
import DOMPurify from "dompurify";

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
  updatedAt: number;
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
  name?: string;
  description?: string;
}

interface BlockState {
  type: "text" | "reasoning";
  text: string;
  el: HTMLElement | null;
}

interface NodeState {
  kind: "user" | "assistant" | "tool" | "queued" | "note" | "files" | "attach";
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
  /** 消息头后缀(思考耗时 · token 消耗),模型名变化时重建 */
  roleSuffix?: string;
  /** 所属回合/步骤,用于把流式内容定位到正确的节点 */
  turn?: number;
  step?: number;
  // files 卡片节点
  files?: string[];
  /** 附件上下文(注入模型的内容,界面默认折叠) */
  attachContext?: string;
  /** note 节点是否为命令行(斜杠命令执行记录) */
  cmd?: boolean;
  /** 排队消息节点对应的队列项 id(插话/移除等操作需要) */
  queueItemId?: string;
}

// ---------- 状态 ----------

const state = {
  sessions: [] as StoredSession[],
  current: null as string | null,
  mode: "chat" as "chat" | "list",
  locked: false,
  search: "",
  workspaces: [] as { workspaceId: string; path: string; title: string; sessionIds: string[] }[],
  collapsed: new Set<string>(),
  running: false,
  status: { serverUp: false, serverStartedByUs: false, serverStarting: false, muxConnected: false, hostConnected: false } as HubStatus,
  nodes: [] as NodeState[],
  seqs: new Set<number>(),
  queuedIds: new Map<string, NodeState>(),
  approvals: new Map<string, ApprovalInfo>(),
  questions: new Map<string, QuestionInfo>(),
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
  /** 计划模式状态(plan/mode 事件) */
  planMode: false,
  /** 本轮工具节点(回合结束时折叠为摘要) */
  currentTurnTools: [] as NodeState[],
  /** 附件:自动附加的激活文件 + 手动选择 */
  attachments: [] as { kind: "file" | "folder"; path: string; label: string; auto?: boolean }[],
  autoAttachActive: true,
  activeFile: null as { path: string; label: string; languageId?: string } | null,
  skills: null as { name: string; description: string; whenToUse?: string; modelInvocable: boolean }[] | null,
  subagents: null as { kind: string; id: string; mode?: string; activity?: string; label?: string }[] | null,
  /** 会话统计(sessionStats / tokenUsage 投影) */
  stats: undefined as { sessionStats?: any; tokenUsage?: any } | undefined,
  /** 待办事项(todos 投影) */
  todos: undefined as { content: string; status: "pending" | "in_progress" | "completed" }[] | null | undefined,
  /** 显示语言(宿主传入,zh-* 用中文源语言,其余用英文词典) */
  lang: "zh-cn",
  /** 每步开始时间,用于计算每条回答的思考耗时 */
  stepStarts: new Map<string, number>(),
  /** 当前流式回合,用于回合边界切分节点 */
  currentStreamTurn: undefined as number | undefined,
  /** 已流式输出的块键 `${turn}:${step}:${index}`,避免 assistant/message 重复追加 */
  streamedBlockKeys: new Set<string>(),
  /** 本回合的过程(工具调用)折叠组 */
  turnToolGroup: null as HTMLElement | null,
  /** 工作区智能体/技能配置(.claude / .codex / .github Copilot) */
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
  } | null,
};

/** 当前回合产出的文件(来自 turn/start 事件的 data.deliverables) */
let currentTurnDeliverables: string[] = [];

/** 输入框上方的回合活动指示(深度思考中… / 执行工具… + 已用时长,与网页版一致) */
let turnStatusStartedAt = 0;
let turnStatusActivity = "思考中…";
let turnStatusTimer: number | null = null;

// ---------- DOM 工具 ----------

const app = document.getElementById("app")!;

/** 去除文本中的 emoji(个人审美:任何来源的文本都不显示 emoji;保留 →、↪、✓ 等排版符号)。 */
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{2712}\u{2714}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{23E9}-\u{23FA}\u{2139}\u{2B06}\u{2B07}\u{25B6}\u{25C0}]/gu;
function clean(text: string): string {
  return text.replace(EMOJI_RE, "");
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = clean(text);
  return node;
}

function markdownHtml(text: string): string {
  try {
    const raw = marked.parse(clean(text), { async: false, breaks: true }) as string;
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  } catch {
    return "";
  }
}

function setHtml(node: HTMLElement, text: string) {
  node.innerHTML = markdownHtml(text);
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

  // 编辑(铅笔)
  // 归档(箱子)
  // 计划/审批(剪贴板)
  // 目标(靶心)
  // 完成(对勾)
  // 删除(垃圾桶)
  // 警告(三角)
  // 信息
  // 附件(回形针)
  // 向上箭头
  // 文件
  // 文件夹
  // 暂停
  // 播放
  // 刷新
  // 压缩
  // 对话(气泡)
  // 网格(插件/技能列表)
  // 闪电
  // 学位帽(技能)
  // 机器人(智能体)
  // 锁
  // 搜索(放大镜)
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z|M21 21l-4.35-4.35",
  // 分组折叠箭头
  chevron: "M6 9l6 6 6-6",
  // 任务清单(与 Web 端 todo 面板一致)
  checklist: "M4 6.5h12.5|M4 12h12.5|M4 17.5h8|M14.5 16l2 2 4-4.5",
  // 任务完成(圆 + 对勾)
  todoCheck: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M8.4 12.2l2.4 2.4 4.8-5.2",
  // 任务进行中(圆弧)
  todoProgress: "M12 3.2a8.8 8.8 0 1 1-7.9 4.9",
  // 任务待处理(虚线圆,虚线由 CSS stroke-dasharray 提供)
  todoPending: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
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

/** 权限预设的中文名称。 */
const PERMISSION_LABELS: Record<string, string> = {
  "read-only": "只读",
  "workspace-write": "工作区可写",
  "danger-full-access": "完全访问(危险)",
  custom: "自定义",
};

function permissionLabel(value: string, fallback?: string): string {
  return t(PERMISSION_LABELS[value] ?? fallback ?? value);
}

// ---------- 国际化(中文为源语言,英文词典翻译;宿主传入显示语言) ----------

const EN_TEXT: Record<string, string> = {
  "向 DeepSeek Harness 发送消息…": "Message DeepSeek Harness…",
  "Enter 发送 · Shift+Enter 换行": "Enter to send · Shift+Enter for newline",
  "运行中 · Enter 排队 / Ctrl+Enter 插话": "Running · Enter to queue / Ctrl+Enter to steer",
  "运行中 · 消息将排队发送": "Running · message will be queued",
  "运行中 · 停止": "Running · Stop",
  "新建会话": "New session",
  "会话操作:分叉 / 重命名 / 归档": "Session actions: fork / rename / archive",
  "在浏览器中打开": "Open in browser",
  "— 选择会话 —": "— Select session —",
  "思考深度(推理强度)": "Thinking depth (reasoning effort)",
  "思考": "Thinking",
  "预设": "Preset",
  "权限": "Permission",
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
  "从此处新建分支": "Branch from here",
  "分支并回退到更早位置": "Branch and rewind to an earlier point",
  "回到主线(父会话)": "Back to main line (parent session)",
  "重命名会话": "Rename session",
  "修改会话标题(已填入当前标题):": "Edit the session title (current title pre-filled):",
  "重命名": "Rename",
  "取消": "Cancel",
  "确定": "OK",
  "归档会话": "Archive session",
  "归档后该会话将从列表隐藏(仍保留在 DSH 服务器,可在浏览器 GUI 中恢复)。确定归档?": "The session will be hidden from the list (kept on the DSH server, restorable in the browser GUI). Archive it?",
  "归档": "Archive",
  "分叉会话": "Fork session",
  "计划模式": "Plan mode",
  "点击退出计划模式(发送 /plan)": "Click to exit plan mode (sends /plan)",
  "目标模式": "Goal mode",
  "点击管理目标(修改 / 完成 / 清除)": "Click to manage the goal (edit / complete / clear)",
  "修改目标": "Edit goal",
  "修改目标描述(已填入当前目标):": "Edit the goal description (current goal pre-filled):",
  "保存": "Save",
  "完成目标": "Complete goal",
  "清除目标(取消)": "Clear goal (cancel)",
  "压缩上下文": "Compact context",
  "设置目标": "Set goal",
  "记录反馈": "Record feedback",
  "切换权限(插入命令)": "Switch permission (inserts command)",
  "切换权限(直接应用)": "Switch permission (apply directly)",
  "技能(插入提示词)": "Skills (insert prompt)",
  ".claude 配置": ".claude configuration",
  "CLAUDE.md · DSH 已自动读取": "CLAUDE.md · auto-loaded by DSH",
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
  "尚未选择会话,点击 ＋ 新建一个会话": "No session selected; click ＋ to create one",
  "当前会话还没有可回退的回合": "This session has no turns to rewind",
  "还没有可选择的回退点": "No rewind point available yet",
  "没有更早的对话点": "No earlier conversation point",
  "附件上下文(已注入模型,点击展开)": "Attachment context (injected into the model, click to expand)",
  "激活文件 · ": "Active file · ",
  "加载更早的消息": "Load earlier messages",
  "选择回退点(在其后开启新分支)": "Pick a rewind point (a new branch starts after it)",
  "添加文件": "Add file",
  "添加文件夹": "Add folder",
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
  "子代理 {label}({state}) · 点击查看最近回复": "Subagent {label} ({state}) · click to view recent reply",
  "运行中": "running",
  "暂无统计": "No stats yet",
  "已结束": "finished",
  "系统提示词": "System note",
  "插入 .codex 技能说明(SKILL.md)": "Insert .codex skill description (SKILL.md)",
  "插入 Copilot 工作区指令": "Insert Copilot workspace instructions",
  "插入 Copilot 指令文件": "Insert Copilot instruction file",
  "插入 Copilot 智能体定义": "Insert Copilot agent definition",
  "插入 Copilot 提示词": "Insert Copilot prompt",
  "自定义回答(其他)": "Custom answer (other)",
  "输入自定义回答…": "Type a custom answer…",
  "提交回答": "Submit answer",
  "过程": "Process",
  "目标": "Goal",
  "暂停目标": "Pause goal",
  
  "取消目标": "Cancel goal",
  "继续目标": "Resume goal",
  "共 {n} 轮": "{n} rounds total",
  "等待推进": "awaiting progression",
  "第 {n} 轮": "round {n}",
  "任务 · {a} 进行中 · {b} 待处理": "Tasks · {a} in progress · {b} pending",
  "任务": "To-dos",
  "{done} 已完成": "{done} completed",
  "{active} 进行中": "{active} in progress",
  "{pending} 待处理": "{pending} pending",
  "插件(Cordis)": "Plugins (Cordis)",
  "列出插件状态": "List plugin status",
  "运行插件 <id>": "Run plugin <id>",
  "更新插件 <id>": "Update plugin <id>",
  "停止插件 <id>": "Stop plugin <id>",
  "删除插件 <id>": "Remove plugin <id>",
  "点击管理目标(暂停 / 修改 / 完成 / 取消)": "Manage goal (pause / edit / complete / cancel)",
  "跳过本题": "Skip this question",
  "推荐": "Recommended",
  "计划审批": "Plan review",
  "批准计划并开始执行": "Approve plan and start",
  "继续修改计划": "Keep editing the plan",
  "还有问题未回答,请作答或点击跳过本题": "Some questions are unanswered; answer or skip them",
  "对话列表": "Conversations",
  "新建对话": "New conversation",
  "暂无会话,点击新建对话": "No conversations yet, start a new one",
  "搜索会话": "Search conversations",
  "无匹配会话": "No matching conversations",
  "未分组会话": "Ungrouped",
  "插话发送": "Send as steer",
  "仅运行中可插话发送": "Steer is only available while running",
  "{a} 轮 · {b} 步": "{a} turns · {b} steps",
  "LLM {a} · 工具 {b}": "LLM {a} · tools {b}",
  "首 token 平均 {a}s": "avg first token {a}s",
  "缓存命中 {a}%": "cache hit {a}%",
  "输入 {a} tok · 输出 {b} tok": "in {a} tok · out {b} tok",
  "文件夹": "folder",
  "文件": "file",
  "移除附件": "Remove attachment",
  "已连接 · {model}": "Connected · {model}",
  "等待审批:{tool}": "Awaiting approval: {tool}",
};

function t(zh: string, params?: Record<string, string | number>): string {
  const lang = (state.lang ?? "zh-cn").toLowerCase();
  let text = lang.startsWith("zh") ? zh : EN_TEXT[zh] ?? zh;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.split(`{${k}}`).join(String(v));
    }
  }
  return clean(text);
}

// ---------- 页面骨架 ----------

const root = el("div", "app-root");

// 头部:会话切换 + 操作
const header = el("div", "header");
const sessionSelectWrap = el("div", "session-select-wrap");
const sessionSelect = el("select", "session-select");
const btnNew = el("button", "btn btn-icon");
btnNew.title = t("新建会话");
btnNew.append(lineIcon(ICONS.plus));
const btnMore = el("button", "btn btn-icon");
btnMore.title = t("会话操作:分叉 / 重命名 / 归档");
btnMore.append(lineIcon(ICONS.more));
const btnBrowser = el("button", "btn btn-icon");
btnBrowser.title = t("在浏览器中打开");
btnBrowser.append(lineIcon(ICONS.globe));
const statusDot = el("span", "status-dot");
const statusText = el("span", "status-text", "未连接");
sessionSelectWrap.append(sessionSelect);
header.append(sessionSelectWrap, btnMore, btnNew, btnBrowser, statusDot, statusText);

// 会话操作菜单
const sessionMenu = el("div", "session-menu");
sessionMenu.hidden = true;
const menuRename = el("button", "session-menu-item", t("重命名会话"));
const menuFork = el("button", "session-menu-item", t("分叉会话"));
const menuArchive = el("button", "session-menu-item", t("归档会话"));
sessionMenu.append(menuRename, menuFork, menuArchive);
header.append(sessionMenu);

// 通用对话框(重命名输入 / 归档确认)
const dialogOverlay = el("div", "dialog-overlay");
dialogOverlay.hidden = true;
const dialogBox = el("div", "dialog-box");
const dialogTitle = el("div", "dialog-title");
const dialogText = el("div", "dialog-text");
const dialogInput = el("input", "dialog-input");
const dialogRow = el("div", "dialog-actions");
const dialogCancel = el("button", "btn dialog-cancel", "取消");
const dialogConfirm2 = el("button", "btn dialog-confirm2", "清除");
const dialogConfirm = el("button", "btn dialog-confirm", "确定");
dialogRow.append(dialogCancel, dialogConfirm2, dialogConfirm);
dialogBox.append(dialogTitle, dialogText, dialogInput, dialogRow);
dialogOverlay.append(dialogBox);
root.append(dialogOverlay);

/** 显示对话框;input=true 时返回输入内容(空串视为取消),否则确认返回 "yes"、第二确认返回 "alt"、取消返回 null。 */
function showDialog(opts: { title: string; text: string; input?: boolean; confirmLabel?: string; confirm2Label?: string; value?: string }): Promise<string | null> {
  return new Promise((resolve) => {
    dialogTitle.textContent = clean(opts.title);
    dialogText.textContent = clean(opts.text);
    dialogConfirm.textContent = clean(opts.confirmLabel ?? "确定");
    dialogConfirm2.textContent = clean(opts.confirm2Label ?? "清除");
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

function toolSelect(label: string, title: string): { wrap: HTMLElement; select: HTMLSelectElement; labelEl: HTMLElement } {
  const wrap = el("label", "tool-item");
  wrap.title = title;
  const labelEl = el("span", "tool-label", label);
  wrap.append(labelEl);
  const select = el("select", "tool-select");
  wrap.append(select);
  return { wrap, select, labelEl };
}

// 思考 / 模型 / 预设:位于输入框右下角
const thinkingTool = toolSelect(t("思考"), t("思考深度(推理强度)"));
const thinkingSelect = thinkingTool.select;
const modelTool = toolSelect(t("模型"), t("模型"));
const modelSelect = modelTool.select;
const presetTool = toolSelect(t("预设"), t("Agent 预设"));
const presetSelect = presetTool.select;
const composerRight = el("div", "composer-right");
composerRight.append(thinkingTool.wrap, modelTool.wrap);

const inputWrap = el("div", "input-wrap");
const input = el("textarea", "input");
input.placeholder = t("向 DeepSeek Harness 发送消息…");
const sendCol = el("div", "send-col");
// 发送/停止共用一个按钮:空闲显示发送;运行中且无输入显示停止;运行中输入文字变回发送(消息将排队)
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
const statsLine = el("div", "stats-line");
statsLine.hidden = false;
const contextBar = el("div", "context-bar");
contextBar.hidden = true;
conversationBottom.append(btnBackToMain, modeChips, todoPanel, statsLine, contextBar);

// 输入框底部行:左下角 / 命令菜单、权限选择;右下角 思考/模型/预设
const composerBottom = el("div", "composer-bottom");
const btnPlus = el("button", "btn-icon-btn plus-btn");
btnPlus.title = t("输入命令(/plan、/compact、.claude 命令…)");
btnPlus.append(lineIcon(ICONS.slash, 15));
const btnAddAttach = el("button", "attach-add-btn");
btnAddAttach.title = t("添加文件或文件夹到对话");
btnAddAttach.append(lineIcon(ICONS.plus, 12));
const permissionTool = toolSelect(t("权限"), t("读写权限(沙箱模式 + 审批策略)"));
const permissionSelect = permissionTool.select;
const hint = el("div", "hint", t("Enter 发送 · Shift+Enter 换行"));
composerBottom.append(btnPlus, btnAddAttach, permissionTool.wrap, composerRight, hint);
// 对话框顶部行:左上角 ＋ 添加文件 + 芯片;右上角 预设胶囊(仅新会话显示)
const composerTop = el("div", "composer-top");
composerTop.append(attachmentsRow, presetTool.wrap);
composer.append(composerTop, inputWrap, composerBottom);

/** init 后按当前语言刷新模块级静态文案(模块加载时 state.lang 还是默认值 zh-cn)。 */
function applyStaticTexts() {
  btnNew.title = t("新建会话");
  btnMore.title = t("会话操作:分叉 / 重命名 / 归档");
  thinkingTool.labelEl.textContent = t("思考");
  thinkingTool.wrap.title = t("思考深度(推理强度)");
  modelTool.labelEl.textContent = t("模型");
  modelTool.wrap.title = t("模型");
  presetTool.labelEl.textContent = t("预设");
  presetTool.wrap.title = t("Agent 预设");
  permissionTool.labelEl.textContent = t("权限");
  permissionTool.wrap.title = t("读写权限(沙箱模式 + 审批策略)");
  input.placeholder = t("向 DeepSeek Harness 发送消息…");
  btnBackToMain.title = t("回到主线(父会话)");
  btnPlus.title = t("输入命令(/plan、/compact、.claude 命令…)");
  btnAddAttach.title = t("添加文件或文件夹到对话");
  hint.textContent = clean(t("Enter 发送 · Shift+Enter 换行"));
}

// 添加文件/文件夹选择菜单(挂在 composer 内)
const attachMenu = el("div", "plus-menu attach-menu");
attachMenu.hidden = true;
composer.append(attachMenu);

// + 命令菜单(挂在 composer 内,绝对定位基于 composer)
const plusMenu = el("div", "plus-menu");
plusMenu.hidden = true;
composer.append(plusMenu);

root.append(header, goalArea, messages, conversationBottom, pendingArea, turnStatus, composer);
app.append(root);

// ---------- 事件 ----------

input.rows = 1;
input.addEventListener("input", () => {
  autoResize();
  updateSendButton();
});
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    // Windows/Linux: Ctrl+Enter 插话;macOS: Cmd+Enter(metaKey)
    sendCurrent(e.ctrlKey || e.metaKey ? "steer" : "queue");
  }
});
btnSendStop.addEventListener("click", () => {
  const hasText = input.value.trim().length > 0;
  if (state.running && !hasText) {
    vscode.postMessage({ kind: "stop" });
    return;
  }
  sendCurrent("queue");
});
btnAddAttach.addEventListener("click", (e) => {
  e.stopPropagation();
  attachMenu.innerHTML = "";
  const item = (label: string, mode: "file" | "folder") => {
    const b = el("button", "plus-menu-item", label);
    b.addEventListener("click", () => {
      attachMenu.hidden = true;
      vscode.postMessage({ kind: "pickAttachments", mode });
    });
    attachMenu.append(b);
  };
  item(t("添加文件"), "file");
  item(t("添加文件夹"), "folder");
  attachMenu.hidden = !attachMenu.hidden;
});
document.addEventListener("click", (e) => {
  if (!attachMenu.hidden && e.target !== btnAddAttach && !attachMenu.contains(e.target as Node)) attachMenu.hidden = true;
});
btnNew.addEventListener("click", () => vscode.postMessage({ kind: "new" }));
btnBrowser.addEventListener("click", () => vscode.postMessage({ kind: "openBrowser" }));
sessionSelect.addEventListener("change", () => {
  const id = sessionSelect.value;
  if (id) vscode.postMessage({ kind: "select", sessionId: id });
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
  const item = (icon: string, label: string, action: () => void, hintText?: string) => {
    const b = el("button", "plus-menu-item");
    const iconSvg = ICONS[icon as keyof typeof ICONS];
    if (iconSvg) b.append(lineIcon(iconSvg, 14));
    b.append(el("span", "menu-item-label", label));
    if (hintText) b.title = hintText;
    b.addEventListener("click", action);
    plusMenu.append(b);
    return b;
  };
  item("plan", "计划模式", () => insert("/plan"), "插入 /plan 到输入框,回车后进入/退出计划模式");
  item("compact", "压缩上下文", () => insert("/compact"), "插入 /compact 到输入框,回车执行");
  item("target", "设置目标", () => insert("/goal "), "插入 /goal 命令,补全目标描述后回车");
  item("chat", "记录反馈", () => insert("/feedback "), "插入 /feedback 命令记录会话反馈");
  // 插件(Cordis)管理:由 agent 的 cordis 工具执行,插入指令让 agent 操作
  {
    const group = el("div", "plus-menu-label", t("插件(Cordis)"));
    plusMenu.append(group);
    item("box", t("列出插件状态"), () => insert("请列出当前所有动态 Cordis 插件及其运行状态(cordis_inspect)"), "让 agent 用 cordis_inspect 汇报插件清单");
    item("play", t("运行插件 <id>"), () => insert("请运行插件 rbak-1(cordis_run)"), "把 rbak-1 换成目标插件 ID");
    item("refresh", t("更新插件 <id>"), () => insert("请更新插件 rbak-1 并运行(cordis_define + cordis_run update)"), "把 rbak-1 换成目标插件 ID");
    item("stop", t("停止插件 <id>"), () => insert("请停止插件 rbak-1(cordis_stop)"), "把 rbak-1 换成目标插件 ID");
    item("trash", t("删除插件 <id>"), () => insert("请删除插件 rbak-1(cordis_undefine)"), "把 rbak-1 换成目标插件 ID");
  }
  const perms = state.permissions?.options ?? [];
  if (perms.length > 0) {
    const group = el("div", "plus-menu-label", t("切换权限(直接应用)"));
    plusMenu.append(group);
    for (const option of perms) {
      const active = state.permissions?.currentValue === option.value;
      item(active ? "check" : "lock", permissionLabel(option.value, option.name), () => {
        state.permissions = { ...(state.permissions ?? { options: [], currentValue: "" }), currentValue: option.value };
        renderPermissionsSelect();
        vscode.postMessage({ kind: "permission", preset: option.value });
      }, option.description ?? "");
    }
  }
  // 技能列表(来自 DSH skill.list,模型可调用)
  const skills = state.skills ?? [];
  if (skills.length > 0) {
    const group = el("div", "plus-menu-label", "技能(插入提示词)");
    plusMenu.append(group);
    for (const skill of skills.slice(0, 12)) {
      item("grid", skill.name, () => insert(`请使用技能「${skill.name}」处理:`), skill.description || skill.whenToUse || "");
    }
  }
  // 智能体/技能配置:.claude(DSH 核心自动读 CLAUDE.md/AGENTS.md)/ .codex / .github(Copilot)
  const claude = state.claudeConfig;
  const hasClaude = claude && (claude.claudeMd || claude.commands.length > 0 || claude.skills.length > 0);
  const hasCodex = claude && (claude.codexConfig || claude.codexSkills.length > 0);
  const hasCopilot =
    claude && (claude.copilotInstructions !== null || claude.copilotInstructionFiles.length > 0 || claude.copilotAgents.length > 0 || claude.copilotPrompts.length > 0);
  if (hasClaude) {
    const group = el("div", "plus-menu-label", ".claude 配置");
    plusMenu.append(group);
    if (claude!.claudeMd) {
      const info = el("button", "plus-menu-item", "CLAUDE.md · DSH 已自动读取");
      info.title = "工作区根目录的 CLAUDE.md / AGENTS.md 已由 DeepSeek Harness 核心自动加载到上下文,无需手动处理";
      info.style.cursor = "default";
      plusMenu.append(info);
    }
    for (const cmd of claude!.commands) {
      item("zap", `/${cmd.name}`, () => insert(cmd.content), t("插入 .claude 命令模板"));
    }
    for (const skill of claude!.skills) {
      item("cap", `技能 ${skill.name}`, () => insert(skill.content), t("插入 .claude 技能说明(SKILL.md)"));
    }
  }
  if (hasCodex) {
    const group = el("div", "plus-menu-label", ".codex 配置");
    plusMenu.append(group);
    if (claude!.codexConfig) {
      const info = el("button", "plus-menu-item", ".codex/config.toml 已存在");
      info.title = ".codex/config.toml 由 Codex CLI 使用;DSH 不读取该配置,可通过 AGENTS.md(已自动加载)承载共享指令";
      info.style.cursor = "default";
      plusMenu.append(info);
    }
    for (const skill of claude!.codexSkills) {
      item("cap", `技能 ${skill.name}`, () => insert(skill.content), t("插入 .codex 技能说明(SKILL.md)"));
    }
  }
  if (hasCopilot) {
    const group = el("div", "plus-menu-label", "GitHub Copilot 配置");
    plusMenu.append(group);
    if (claude!.copilotInstructions !== null) {
      item("file", "copilot-instructions.md", () => insert(claude!.copilotInstructions!), t("插入 Copilot 工作区指令"));
    }
    for (const file of claude!.copilotInstructionFiles) {
      item("file", `指令 ${file.name}`, () => insert(file.content), t("插入 Copilot 指令文件"));
    }
    for (const agent of claude!.copilotAgents) {
      item("bot", `智能体 ${agent.name}`, () => insert(agent.content), t("插入 Copilot 智能体定义"));
    }
    for (const prompt of claude!.copilotPrompts) {
      item("chat", `提示词 ${prompt.name}`, () => insert(prompt.content), t("插入 Copilot 提示词"));
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
    title: "重命名会话",
    text: "修改会话标题(已填入当前标题):",
    input: true,
    confirmLabel: "重命名",
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
    title: "归档会话",
    text: "归档后该会话将从列表隐藏(仍保留在 DSH 服务器,可在浏览器 GUI 中恢复)。确定归档?",
    confirmLabel: "归档",
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
      // 系统提示词:默认折叠,左上角标注"系统提示词"
      const details = el("details", "system-note-details");
      details.append(el("summary", "system-note-summary", t("系统提示词")));
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
      details.append(el("summary", "attach-context-summary", t("附件上下文(已注入模型,点击展开)")));
      const body = el("div", "msg-body attach-context-body");
      setHtml(body, node.text ?? "");
      details.append(body);
      wrap.append(details);
      return wrap;
    }
    case "queued": {
      const wrap = el("div", "msg msg-queued");
      const body = el("div", "msg-body");
      setHtml(body, node.text ?? "");
      wrap.append(body);
      // 插话发送按钮(对应 Web 端排队消息操作:打断当前回合,立即发送这条排队消息)
      if (node.queueItemId) {
        const actions = el("div", "msg-queued-actions");
        const btn = el("button", "btn btn-queued-steer");
        btn.type = "button";
        btn.disabled = !state.running;
        btn.title = state.running ? t("插话发送") : t("仅运行中可插话发送");
        btn.append(lineIcon(ICONS.send, 12), el("span", undefined, t("插话发送")));
        btn.addEventListener("click", () => {
          vscode.postMessage({ kind: "queueAction", itemId: node.queueItemId, action: { kind: "steer" } });
        });
        actions.append(btn);
        wrap.append(actions);
      }
      return wrap;
    }
    case "assistant": {
      const wrap = el("div", "msg msg-assistant");
      const role = el("div", "msg-role", state.models?.current?.model ?? "DeepSeek");
      node.roleEl = role;
      const blocks = el("div", "msg-blocks");
      for (const block of node.blocks ?? []) {
        if (block.type === "reasoning") {
          const details = el("details", "block-reasoning-details");
          details.append(el("summary", "block-reasoning-summary", t("思考过程")));
          const body = el("div", "block-body");
          setHtml(body, block.text);
          block.el = body;
          details.append(body);
          blocks.append(details);
          continue;
        }
        const bwrap = el("div", "block");
        const body = el("div", "block-body");
        setHtml(body, block.text);
        block.el = body;
        bwrap.append(body);
        blocks.append(bwrap);
      }
      const actions = el("div", "msg-actions");
      node.actionsEl = actions;
      wrap.append(role, blocks, actions);
      return wrap;
    }
    case "tool": {
      const wrap = el("details", "msg tool-card");
      const summary = el("summary", "tool-summary");
      const nameSpan = el("span", "tool-name", node.name ?? "tool");
      summary.append(nameSpan);
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
      // 本轮生成的文件列表框(Codex 风格)
      const wrap = el("div", "msg files-card");
      const head = el("div", "files-card-head");
      head.append(lineIcon(ICONS.box, 13), el("span", undefined, `本轮生成的文件 (${node.files?.length ?? 0})`));
      wrap.append(head);
      for (const path of node.files ?? []) {
        const row = el("button", "files-card-row");
        row.append(lineIcon(ICONS.copy, 12), el("span", "files-card-name", basename(path)));
        row.title = path;
        row.addEventListener("click", () => vscode.postMessage({ kind: "openFile", path }));
        wrap.append(row);
      }
      return wrap;
    }
  }
}

function findAssistantTail(): NodeState | undefined {
  for (let i = state.nodes.length - 1; i >= 0; i--) {
    if (state.nodes[i].kind === "assistant") return state.nodes[i];
  }
  return undefined;
}

function beginAssistantBlock(turn: number, step: number, index: number, blockType: string) {
  state.streamBlock = null;
  state.streamKey = null;
  // 网页版布局:一个回合一个 assistant 节点,各步骤的文本块追加到同一节点
  let assistant = findAssistantTail();
  if (!assistant || assistant.turn !== turn) {
    assistant = { kind: "assistant", key: `a:${turn}:${state.nodes.length}`, el: null, blocks: [], turn };
    appendNode(assistant);
  }
  state.currentStreamTurn = turn;
  const block: BlockState = { type: blockType === "reasoning" ? "reasoning" : "text", text: "", el: null };
  assistant.blocks!.push(block);
  state.streamedBlockKeys.add(`${turn}:${step}:${index}`);
  refreshAssistantNode(assistant, block);
  state.streamBlock = block;
}

function refreshAssistantNode(assistant: NodeState, activeBlock?: BlockState) {
  if (!assistant.el || !assistant.blocks) return;
  const container = assistant.el.querySelector(".msg-blocks") as HTMLElement;
  container.innerHTML = "";
  for (const block of assistant.blocks) {
    if (block.type === "reasoning") {
      // 思考过程:可折叠,默认隐藏
      const details = el("details", "block-reasoning-details");
      details.append(el("summary", "block-reasoning-summary", "思考过程"));
      const body = el("div", "block-body");
      setHtml(body, block.text);
      block.el = body;
      details.append(body);
      container.append(details);
      continue;
    }
    const bwrap = el("div", "block");
    const body = el("div", "block-body");
    setHtml(body, block.text);
    block.el = body;
    bwrap.append(body);
    container.append(bwrap);
  }
  if (activeBlock) {
    activeBlock.el = container.querySelector(".block:last-child .block-body") as HTMLElement;
    if (!activeBlock.el) {
      activeBlock.el = container.querySelector(".block-reasoning-details:last-child .block-body") as HTMLElement;
    }
  }
  scrollToBottom();
}

function appendToStream(blockType: string, text: string) {
  if (!state.streamBlock) return;
  if ((state.streamBlock.type === "reasoning") !== (blockType === "reasoning")) return;
  state.streamBlock.text += text;
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
  const span = node.el.querySelector(".tool-name");
  if (span) span.textContent = clean(node.name ?? "tool");
}

// ---------- 消息操作条(复制 / ↪分支回退 / 点赞 / 点踩 / 产物) ----------

function renderActions(node: NodeState) {
  if (!node.actionsEl) return;
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

  // ↪ 分支 / 回退:单图标,点击显示 3 个方法
  if (typeof node.seq === "number") {
    actionBtn(ICONS.branch, t("分支 / 回退"), () => {
      const menu = el("div", "msg-popover");
      const add = (iconPaths: string, label: string, action: () => void) => {
        const row = el("button", "plus-menu-item");
        row.append(lineIcon(iconPaths), el("span", "menu-item-label", label));
        row.addEventListener("click", () => {
          menu.remove();
          action();
        });
        menu.append(row);
      };
      // 方法 1:回退到此处(去掉这条及之后)
      add(ICONS.rewind, t("回退到此处"), () => {
        vscode.postMessage({ kind: "forkAt", seq: lastTurnStartAtOrBefore(node.seq!) });
      });
      // 方法 2:从此处新建分支(保留到此)
      add(ICONS.branch, t("从此处新建分支"), () => {
        vscode.postMessage({ kind: "forkAt", seq: node.seq });
      });
      // 方法 3:分支并回退到更早位置(选择更早的对话点)
      add(ICONS.corner, t("分支并回退到更早位置"), () => {
        const candidates = state.nodes
          .filter((n) => n.kind === "assistant" && typeof n.seq === "number" && (n.seq ?? 0) < (node.seq ?? 0))
          .slice(-8);
        if (candidates.length === 0) {
          appendNode({ kind: "note", key: `note:${Date.now()}`, el: null, text: "没有更早的对话点" });
          return;
        }
        const picker = el("div", "msg-popover");
        picker.append(el("div", "plus-menu-label", "选择回退点(在其后开启新分支)"));
        for (const n of candidates) {
          const preview = (n.plainText ?? "").replace(/\s+/g, " ").slice(0, 50) || "(无文本)";
          const row = el("button", "plus-menu-item", `↩ ${preview}`);
          row.addEventListener("click", () => {
            picker.remove();
            vscode.postMessage({ kind: "forkAt", seq: n.seq });
          });
          picker.append(row);
        }
        node.el?.append(picker);
        picker.addEventListener("click", (e) => e.stopPropagation());
        const closePicker = () => picker.remove();
        setTimeout(() => document.addEventListener("click", closePicker, { once: true }), 0);
      });
      // 若当前是分叉分支,追加"回到主线"
      const currentSession = state.sessions.find((s) => s.sessionId === state.current);
      if (currentSession?.parentSessionId) {
        add(ICONS.backMain, t("回到主线(父会话)"), () => {
          vscode.postMessage({ kind: "select", sessionId: currentSession.parentSessionId });
        });
      }
      node.el?.append(menu);
      menu.addEventListener("click", (e) => e.stopPropagation());
      const closeMenu = () => menu.remove();
      setTimeout(() => document.addEventListener("click", closeMenu, { once: true }), 0);
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

/** 找到 seq 之前(含)最近的回合开始点;没有则回退到该消息自身。 */
function lastTurnStartAtOrBefore(seq: number): number {
  let found = seq;
  for (const ts of state.turnStarts) {
    if (ts <= seq) found = ts;
    else break;
  }
  return found;
}

// ---------- 事件折叠 ----------

function handleEvent(wire: WireEvent) {
  const ev = wire.event;
  if (state.seqs.has(ev.seq)) return;
  state.seqs.add(ev.seq);
  const data = ev.data ?? {};

  switch (ev.type) {
    case "user/message": {
      const text = extractText(data?.content);
      const id: string | undefined = data?.id;
      if (id && state.queuedIds.has(id)) {
        const queued = state.queuedIds.get(id)!;
        state.queuedIds.delete(id);
        removeNode(queued);
      }
      if (!text && !id) break;
      if (data?.source?.kind === "user") {
        const split = splitAttachmentContext(text);
        if (split.attachContext) {
          appendNode({ kind: "attach", key: `at:${ev.seq}`, el: null, text: split.attachContext });
        }
        if (isSlashCommandOnly(split.userText)) {
          // 纯斜杠命令(权限切换/计划模式等):不显示为用户气泡,以小字命令行呈现
          appendNode({ kind: "note", key: `cmd:${ev.seq}`, el: null, text: `⌘ ${split.userText.trim()}`, cmd: true });
        } else {
          appendNode({ kind: "user", key: `u:${ev.seq}`, el: null, text: split.userText });
        }
      } else if (text) appendNode({ kind: "note", key: `n:${ev.seq}`, el: null, text });
      break;
    }
    case "assistant/chunk": {
      const chunk = data?.chunk ?? {};
      switch (chunk.type) {
        case "block-start":
          beginAssistantBlock(data?.turn ?? 0, data?.step ?? 0, chunk.index ?? 0, chunk.blockType ?? "text");
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
      refreshAssistantNode(assistant);
      // 回合级元信息与操作条(最终一步的数据生效)
      assistant.seq = ev.seq;
      assistant.deliverables = [...currentTurnDeliverables];
      const modelName = state.models?.current?.model ?? "DeepSeek";
      const stepStart = state.stepStarts.get(`${turn}:${step}`);
      const usage = data?.usage;
      const suffixParts: string[] = [];
      if (stepStart !== undefined) suffixParts.push(`思考 ${fmtDuration(ev.time - stepStart)}`);
      if (usage && typeof usage.inputTokens === "number") {
        const input = usage.inputTokens + (usage.cacheReadTokens ?? 0);
        suffixParts.push(`入 ${fmtTokens(input)} tok`);
      }
      if (usage && typeof usage.outputTokens === "number") suffixParts.push(`出 ${fmtTokens(usage.outputTokens)} tok`);
      const suffix = suffixParts.join(" · ");
      assistant.roleSuffix = suffix;
      if (assistant.roleEl) {
        assistant.roleEl.textContent = clean(suffix ? `${modelName} · ${suffix}` : modelName);
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
      const existing = findToolNode(callId);
      if (existing) {
        existing.name = data?.name ?? existing.name;
        existing.args = data?.arguments ?? existing.args;
        if (existing.el) {
          const pre = existing.el.querySelectorAll(".tool-pre")[0];
          if (pre) pre.textContent = clean(existing.args ?? "");
          updateToolSummary(existing);
        }
        break;
      }
      // 网页版布局:本回合的工具卡片直接进入"过程"折叠组,不再逐条占屏
      let group = state.turnToolGroup;
      if (!group) {
        group = el("details", "tool-group");
        const summary = el("summary", "tool-group-summary");
        summary.append(lineIcon(ICONS.box, 12), el("span", "tool-group-summary-text", t("过程")));
        group.append(summary);
        group.append(el("div", "tool-group-body"));
        const turnAssistant = [...state.nodes].reverse().find((n) => n.kind === "assistant" && n.turn === state.currentStreamTurn);
        if (turnAssistant?.el) turnAssistant.el.before(group);
        else messages.appendChild(group);
        state.turnToolGroup = group;
      }
      const node: NodeState = { kind: "tool", key: `t:${callId}`, el: null, callId, name: data?.name, args: data?.arguments ?? "", done: false };
      node.el = renderNode(node);
      group.querySelector(".tool-group-body")!.append(node.el!);
      state.nodes.push(node);
      state.currentTurnTools.push(node);
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
        existing.done = true;
        if (existing.el) {
          const pres = existing.el.querySelectorAll(".tool-pre");
          if (pres.length === 1) {
            const body = existing.el.querySelector(".tool-body");
            body?.append(el("div", "tool-label", "结果"), el("pre", "tool-pre", existing.result ?? ""));
          }
          updateToolSummary(existing);
        }
      }
      break;
    }
    case "turn/start": {
      state.running = true;
      state.currentTurnTools = [];
      state.turnToolGroup = null;
      state.turnStarts.push(ev.seq);
      const deliverables = data?.deliverables;
      currentTurnDeliverables =
        deliverables && typeof deliverables === "object" && !Array.isArray(deliverables) ? Object.keys(deliverables) : [];
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
      collapseToolGroup();
      // 回合结束后才渲染操作条(复制/分支/点赞)
      if (finishedTurn !== undefined) {
        const node = [...state.nodes].reverse().find((n) => n.kind === "assistant" && n.turn === finishedTurn);
        if (node) renderActions(node);
      }
      // 本轮产物:对话末尾显示文件列表框(Codex 风格)
      if (currentTurnDeliverables.length > 0) {
        appendNode({ kind: "files", key: `files:${ev.seq}`, el: null, files: [...currentTurnDeliverables] });
        currentTurnDeliverables = [];
      }
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

/** 回合结束时确定"过程"组的摘要文案(工具卡片一直位于折叠组内)。 */
function collapseToolGroup() {
  const nodes = state.currentTurnTools.filter((n) => n.el);
  state.currentTurnTools = [];
  const group = state.turnToolGroup;
  state.turnToolGroup = null;
  if (!group) return;
  if (nodes.length === 0) {
    group.remove();
    return;
  }
  const names = nodes
    .map((n) => n.name ?? "tool")
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 4)
    .join(" · ");
  const textEl = group.querySelector(".tool-group-summary-text");
  if (textEl) {
    textEl.textContent = clean(t("本轮调用 {n} 个工具", { n: String(nodes.length) }) + (names ? ` · ${names}` : ""));
  }
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
  return text.slice(0, max) + `\n…(已截断,共 ${text.length} 字符)`;
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
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 230))}px`;
  menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 240)}px`;
  menu.style.zIndex = "300";
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
      const row = el("button", "plus-menu-item");
      const iconSvg = ICONS[icon as keyof typeof ICONS];
      if (iconSvg) row.append(lineIcon(iconSvg, 14));
      row.append(el("span", "menu-item-label", label));
      row.addEventListener("click", () => {
        closeActivePopover();
        action();
      });
      menu.append(row);
    };
    const ref = { id: inner.id, revision: inner.revision };
    add("edit", t("修改目标"), async () => {
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
    add("pause", t("暂停目标"), () => vscode.postMessage({ kind: "goalPause", ref }));
    add("check", t("完成目标"), () => vscode.postMessage({ kind: "goalComplete", ref }));
    add("trash", t("取消目标"), () => vscode.postMessage({ kind: "goalClear", ref }));
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
    const chip = el("span", "mode-chip plan-chip", "计划模式");
    chip.title = "点击退出计划模式(发送 /plan)";
    const close = el("button", "chip-close", "×");
    chip.append(close);
    chip.addEventListener("click", () => vscode.postMessage({ kind: "command", line: "/plan" }));
    modeChips.append(chip);
  }
  if (inner && inner.phase !== "complete") {
    // 仅当对话存在实际目标(进行中/暂停/阻塞)时显示目标芯片;已完成或无目标时隐藏
    const phase = inner.phase ?? "active";
    const cls: Record<string, string> = { active: "goal-chip", complete: "goal-chip done", blocked: "goal-chip blocked", paused: "goal-chip paused" };
    const chip = el("span", "mode-chip " + (cls[phase] ?? "goal-chip"), t("目标"));
    chip.title = t("点击管理目标(暂停 / 修改 / 完成 / 取消)");
    const close = el("button", "chip-close", "×");
    chip.append(close);
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      openAnchoredMenu(chip, (menu) => {
        const add = (icon: string, label: string, action: () => void) => {
          const row = el("button", "plus-menu-item");
      const iconSvg = ICONS[icon as keyof typeof ICONS];
      if (iconSvg) row.append(lineIcon(iconSvg, 14));
      row.append(el("span", "menu-item-label", label));
          row.addEventListener("click", () => {
            closeActivePopover();
            action();
          });
          menu.append(row);
        };
        const ref = { id: inner.id, revision: inner.revision };
        if (phase === "active") {
          add("pause", t("暂停目标"), () => vscode.postMessage({ kind: "goalPause", ref }));
        } else if (phase === "paused" || phase === "blocked") {
          add("play", t("继续目标"), () => vscode.postMessage({ kind: "goalResume", ref }));
        }
        add("edit", t("修改目标"), async () => {
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
          add("check", t("完成目标"), () => vscode.postMessage({ kind: "goalComplete", ref }));
        }
        add("trash", t("取消目标"), () => vscode.postMessage({ kind: "goalClear", ref }));
      });
    });
    modeChips.append(chip);
  }
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
  const title = el("div", "goal-title", inner.objective);
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

function renderSessions() {
  const current = state.current;
  sessionSelect.innerHTML = "";
  const empty = el("option", undefined, t("— 选择会话 —"));
  empty.value = "";
  sessionSelect.append(empty);
  for (const s of state.sessions) {
    const option = el("option", undefined, s.title || sessionLabel(s));
    option.value = s.sessionId;
    if (s.sessionId === current) option.selected = true;
    sessionSelect.append(option);
  }
  // 回到主线按钮:仅当前会话是分叉分支时显示
  const currentSession = state.sessions.find((s) => s.sessionId === current);
  btnBackToMain.hidden = !currentSession?.parentSessionId;
}

function sessionLabel(s: StoredSession): string {
  const id = s.sessionId.slice(0, 12);
  const cwd = s.cwd ? basename(s.cwd) : "";
  const branch = s.parentSessionId ? "↪ " : "";
  return `${branch}${id}${cwd ? ` · ${cwd}` : ""}${s.agentPreset ? ` · ${s.agentPreset}` : ""}`;
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

function renderThinkingSelect() {
  const m = state.models?.current;
  const modelInfo = m ? findModel(m.provider, m.model) : undefined;
  const efforts = modelInfo?.reasoning?.efforts ?? [];
  thinkingSelect.innerHTML = "";
  const def = el("option", undefined, "默认");
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
    const option = el("option", undefined, presetLabel(preset.id) + (preset.isDefault ? " · 默认" : ""));
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
  return state.presets?.find((p) => p.id === id)?.name ?? id;
}

function renderPermissionsSelect() {
  const options = state.permissions?.options ?? [];
  permissionSelect.innerHTML = "";
  const current = state.permissions?.currentValue;
  let currentInList = false;
  for (const option of options) {
    const item = el("option", undefined, permissionLabel(option.value, option.name));
    item.value = option.value;
    if (current === option.value) {
      item.selected = true;
      currentInList = true;
    }
    permissionSelect.append(item);
  }
  // 当前权限不在预设列表(自定义组合)时,补一个只读占位项
  if (current && !currentInList) {
    const item = el("option", undefined, permissionLabel(current));
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
  contextBar.title = `已用 ${c.pressureTokens.toLocaleString()} / ${c.contextWindow.toLocaleString()} tokens` + (typeof c.projectedTokens === "number" ? `(预计本轮后 ${c.projectedTokens.toLocaleString()})` : "");
  const label = el("span", "context-label", `上下文 ${pct}%`);
  const bar = el("span", "context-fill-wrap");
  const fill = el("span", "context-fill");
  fill.style.width = `${pct}%`;
  fill.className = pct > 85 ? "context-fill hot" : pct > 60 ? "context-fill warm" : "context-fill";
  bar.append(fill);
  contextBar.append(label, bar);
}

// ---------- 会话统计行(上下文条上方) ----------

/** 待办事项面板(Codex 风格:任务进度摘要 + 清单)。 */
/** 待办事项面板(Web 端风格:任务标题 + 计数摘要 + 展开清单)。 */
function applyQueueItems(items: any[]) {
  // 差集清理:已从队列移除的项(如插话后转正、被移除)删除对应节点
  const alive = new Set(items.map((i: any) => i.id));
  for (const [id, node] of state.queuedIds) {
    if (!alive.has(id)) {
      state.queuedIds.delete(id);
      removeNode(node);
    }
  }
  for (const item of items) {
    if (item.placement !== "queued") continue;
    const id: string = item.id;
    if (state.queuedIds.has(id)) continue;
    const text = extractText(item.message?.content);
    const split = splitAttachmentContext(text);
    if (split.attachContext) {
      appendNode({ kind: "attach", key: `qat:${id}`, el: null, text: split.attachContext });
    }
    const node: NodeState = {
      kind: "queued",
      key: `q:${id}`,
      el: null,
      queueItemId: id,
      text: isSlashCommandOnly(split.userText) ? `⌘ ${split.userText.trim()}` : split.userText,
    };
    state.queuedIds.set(id, node);
    appendNode(node);
  }
}

function renderTodos() {
  todoPanel.innerHTML = "";
  const list = state.todos;
  if (!Array.isArray(list) || list.length === 0) {
    todoPanel.hidden = true;
    return;
  }
  todoPanel.hidden = false;
  // 摘要与 Web 端一致:按状态计数,非零段才显示,· 连接(任务 1 进行中 · 2 待处理)
  const done = list.filter((t) => t.status === "completed").length;
  const active = list.filter((t) => t.status === "in_progress").length;
  const pending = list.length - done - active;
  const parts: string[] = [];
  if (done > 0) parts.push(t("{done} 已完成", { done: String(done) }));
  if (active > 0) parts.push(t("{active} 进行中", { active: String(active) }));
  if (pending > 0) parts.push(t("{pending} 待处理", { pending: String(pending) }));
  const summary = el("summary", "todo-panel-summary");
  summary.append(lineIcon(ICONS.checklist, 13));
  summary.append(el("span", "todo-panel-title", t("任务")));
  summary.append(el("span", "todo-panel-progress", parts.join(" · ")));
  const chev = el("span", "todo-panel-chevron");
  chev.append(lineIcon(ICONS.chevron, 12));
  summary.append(chev);
  todoPanel.append(summary);
  const body = el("div", "todo-panel-body");
  for (const item of list) {
    const row = el("div", "todo-row" + (item.status === "completed" ? " done" : item.status === "in_progress" ? " active" : " pending"));
    const glyph = el("span", "todo-status");
    glyph.append(
      item.status === "completed"
        ? lineIcon(ICONS.todoCheck, 13)
        : item.status === "in_progress"
          ? lineIcon(ICONS.todoProgress, 13)
          : lineIcon(ICONS.todoPending, 13),
    );
    row.append(glyph);
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

function renderStatsLine() {
  const st = state.stats?.sessionStats;
  const tu = state.stats?.tokenUsage;
  const parts: string[] = [];
  if (st) {
    if (typeof st.turns === "number") parts.push(t("{a} 轮 · {b} 步", { a: String(st.turns), b: String(st.steps ?? 0) }));
    if (typeof st.llmMs === "number") parts.push(t("LLM {a} · 工具 {b}", { a: fmtDuration(st.llmMs), b: fmtDuration(st.toolMs ?? 0) }));
    if (typeof st.ttftMs === "number" && st.ttftSteps > 0) parts.push(t("首 token 平均 {a}s", { a: (st.ttftMs / st.ttftSteps / 1000).toFixed(1) }));
    if (typeof st.decodeMs === "number" && st.decodeMs > 0 && typeof st.decodeTokens === "number") {
      parts.push(`${Math.round(st.decodeTokens / (st.decodeMs / 1000))} tok/s`);
    }
  }
  if (tu) {
    const uncached = tu.uncachedInputTokens ?? 0;
    const cached = tu.cacheReadTokens ?? 0;
    const input = uncached + cached;
    if (input > 0) {
      if (cached > 0) parts.push(t("缓存命中 {a}%", { a: String(Math.round((cached / input) * 100)) }));
      parts.push(t("输入 {a} tok · 输出 {b} tok", { a: fmtTokens(input), b: fmtTokens(tu.outputTokens ?? 0) }));
    }
  }
  statsLine.textContent = parts.length > 0 ? clean(parts.join(" | ")) : t("暂无统计");
  statsLine.hidden = false;
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

// ---------- 子代理芯片 ----------

function renderSubagentChips() {
  const old = document.querySelectorAll(".subagent-chip");
  old.forEach((n) => n.remove());
  const entries = state.subagents ?? [];
  if (entries.length === 0) return;
  for (const entry of entries) {
    const label = entry.label ?? entry.id.slice(0, 12);
    const running = entry.activity === "running";
    const chip = el("span", "mode-chip subagent-chip" + (running ? " running-chip" : ""));
    chip.append(el("span", undefined, label));
    chip.title = `子代理 ${label}(${running ? "运行中" : "已结束"}) · 点击查看最近回复`;
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      vscode.postMessage({ kind: "subagentPreview", childId: entry.id, mode: entry.mode });
    });
    conversationBottom.append(chip);
  }
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
  turnStatusText.textContent = clean(`${t(turnStatusActivity)} · ${fmtClock(Date.now() - turnStatusStartedAt)}`);
}

function startTurnStatus(time: number) {
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
  // 排队消息的插话按钮:仅运行中可用(与 Web 端一致)
  const canSteer = state.running;
  document.querySelectorAll<HTMLButtonElement>(".btn-queued-steer").forEach((b) => {
    b.disabled = !canSteer;
    b.title = canSteer ? t("插话发送") : t("仅运行中可插话发送");
  });
}

/** 发送/停止合一按钮 + 提示语状态。 */
function updateSendButton() {
  const hasText = input.value.trim().length > 0;
  btnSendStop.innerHTML = "";
  if (state.running && !hasText) {
    btnSendStop.append(lineIcon(ICONS.stop, 15));
    btnSendStop.className = "btn-icon-btn send-btn stop-active";
    btnSendStop.title = t("停止回复");
    hint.textContent = clean(t("运行中 · 停止"));
  } else {
    btnSendStop.append(lineIcon(ICONS.send, 16));
    btnSendStop.className = "btn-icon-btn send-btn";
    btnSendStop.title = state.running ? t("发送(运行中,消息将排队)") : t("发送(Enter)");
    hint.textContent = clean(state.running ? t("运行中 · Enter 排队 / Ctrl+Enter 插话") : t("Enter 发送 · Shift+Enter 换行"));
  }
  btnSendStop.disabled = !state.current;
}

function updateStatus(status: HubStatus) {
  state.status = status;
  if (status.serverUp && status.muxConnected) {
    statusDot.className = "status-dot ok";
    statusText.textContent = clean(status.model ? t("已连接 · {model}", { model: status.model }) : t("已连接"));
  } else if (status.serverStarting) {
    statusDot.className = "status-dot starting";
    statusText.textContent = clean(t("启动中…"));
  } else if (status.serverUp) {
    statusDot.className = "status-dot starting";
    statusText.textContent = clean(t("连接中…"));
  } else {
    statusDot.className = "status-dot err";
    statusText.textContent = clean(t("未连接 · 点击重试"));
    statusDot.onclick = () => vscode.postMessage({ kind: "startServer" });
    return;
  }
  statusDot.onclick = null;
}

function scrollToBottom() {
  const nearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 260;
  if (nearBottom) messages.scrollTop = messages.scrollHeight;
}

/** 顶部"加载更早的消息"按钮:仅在服务器确认还有更早历史时显示。 */
function renderLoadMoreButton() {
  if (!state.hasMore || !state.current) return;
  const loadMore = el("button", "btn btn-load-more", t("加载更早的消息"));
  loadMore.addEventListener("click", () => vscode.postMessage({ kind: "loadMore" }));
  messages.prepend(loadMore);
}

// ---------- 审批 / 提问 ----------

function renderPending() {
  pendingArea.innerHTML = "";
  for (const approval of state.approvals.values()) {
    const card = el("div", "pending-card pending-approval");
    card.append(el("div", "pending-title", t("等待审批:{tool}", { tool: approval.toolName })));
    if (approval.reason) card.append(el("div", "pending-detail", approval.reason));
    const row = el("div", "pending-actions");
    const allow = el("button", "btn btn-allow", t("允许"));
    const reject = el("button", "btn btn-reject", t("拒绝"));
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
    row.append(allow, reject);
    card.append(row);
    pendingArea.append(card);
  }
  for (const question of state.questions.values()) {
    // 网页版布局:一个提问集合一张卡片;每个问题可单独跳过;提交时提交全部
    const card = el("div", "pending-card pending-question");
    const sections: {
      item: { id: string; question: string; detail?: string; options?: { label: string; description?: string }[]; multiSelect?: boolean; intent?: unknown };
      picks: { input: HTMLInputElement; label: string }[];
      customInput: HTMLInputElement;
      customRadio: HTMLInputElement;
      skipped: boolean;
    }[] = [];

    const submitQuestion = (frameRpcId: string, answers: { id: string; selected: string[]; custom?: string }[], removeEntry: boolean) => {
      vscode.postMessage({ kind: "answer", frameRpcId, answers });
      if (removeEntry) {
        state.questions.delete(frameRpcId);
        renderPending();
      }
    };

    for (const item of question.questions) {
      // 计划审批(plan-review):网页版样式,批准 / 继续修改两个主按钮
      const intent = (item as { intent?: { kind?: string; approve?: string } }).intent;
      if (intent?.kind === "plan-review" && item.detail) {
        const section = el("div", "question-section plan-review-section");
        section.append(el("div", "pending-title", t("计划审批")));
        const planBox = el("div", "plan-detail-box");
        setHtml(planBox, item.detail);
        section.append(planBox);
        const approveOption = item.options?.find((o) => o.label === intent.approve);
        const declineOption = item.options?.find((o) => o.label !== intent.approve);
        const actions = el("div", "pending-actions");
        const approveBtn = el("button", "btn btn-allow", t("批准计划并开始执行"));
        approveBtn.title = approveOption?.description ?? "";
        approveBtn.addEventListener("click", () => {
          submitQuestion(question.frameRpcId, [{ id: item.id, selected: approveOption ? [approveOption.label] : [] }], true);
        });
        const declineBtn = el("button", "btn btn-reject", t("继续修改计划"));
        declineBtn.title = declineOption?.description ?? "";
        declineBtn.addEventListener("click", () => {
          submitQuestion(question.frameRpcId, [{ id: item.id, selected: declineOption ? [declineOption.label] : [] }], true);
        });
        actions.append(approveBtn, declineBtn);
        section.append(actions);
        card.append(section);
        continue;
      }

      // 普通问题
      const section = el("div", "question-section");
      const title = el("div", "pending-title");
      title.append(lineIcon(ICONS.up, 13), el("span", "pending-title-text", " " + item.question));
      section.append(title);
      if (item.detail) section.append(el("div", "pending-detail", item.detail));
      const form = el("div", "pending-form");
      const picks: { input: HTMLInputElement; label: string }[] = [];
      for (const option of item.options ?? []) {
        const parsed = parseRecommendedLabel(option.label);
        const row = el("label", "option-row");
        const inputEl = document.createElement("input");
        inputEl.type = item.multiSelect ? "checkbox" : "radio";
        inputEl.name = `q-${question.frameRpcId}-${item.id}`;
        const textSpan = el("span", "option-label", parsed.base);
        row.append(inputEl, textSpan);
        if (parsed.recommended) {
          const badge = el("span", "rec-badge", t("推荐"));
          badge.title = option.description ?? "";
          row.append(badge);
        }
        form.append(row);
        picks.push({ input: inputEl, label: option.label });
      }
      // 自定义回答(玩家输入)
      const customRow = el("label", "option-row custom-row");
      const customRadio = document.createElement("input");
      customRadio.type = "radio";
      customRadio.name = `q-${question.frameRpcId}-${item.id}`;
      customRow.append(customRadio, el("span", "option-label", t("自定义回答(其他)")));
      form.append(customRow);
      const customInput = el("input", "custom-answer-input");
      customInput.placeholder = t("输入自定义回答…");
      customInput.addEventListener("input", () => {
        if (customInput.value.trim()) customRadio.checked = true;
      });
      form.append(customInput);
      // 跳过本题(网页版:直接提交空选择)
      const actions = el("div", "pending-actions");
      const skip = el("button", "btn skip-btn", t("跳过本题"));
      const sectionEntry: { skipped: boolean } = { skipped: false };
      skip.addEventListener("click", () => {
        sectionEntry.skipped = true;
        submitQuestion(question.frameRpcId, [{ id: item.id, selected: [] }], false);
        section.remove();
        if (card.querySelectorAll(".question-section").length === 0) {
          card.remove();
          state.questions.delete(question.frameRpcId);
        }
      });
      actions.append(skip);
      section.append(form, actions);
      card.append(section);
      sections.push({ item, picks, customInput, customRadio, skipped: false });
    }

    // 卡片级提交:提交全部剩余问题
    const submitAll = el("button", "btn btn-allow", t("提交回答"));
    submitAll.addEventListener("click", () => {
      const answers: { id: string; selected: string[]; custom?: string }[] = [];
      let missing = false;
      for (const s of sections) {
        if (s.skipped) continue;
        const selected = s.picks.filter((p) => p.input.checked).map((p) => p.label);
        const custom = s.customInput.value.trim();
        const useCustom = s.customRadio.checked && custom;
        if (selected.length === 0 && !useCustom) {
          missing = true;
          continue;
        }
        answers.push({
          id: s.item.id,
          selected: useCustom ? [] : selected,
          ...(useCustom ? { custom } : {}),
        });
      }
      if (missing) {
        appendNode({ kind: "note", key: `qn:${Date.now()}`, el: null, text: t("还有问题未回答,请作答或点击跳过本题") });
        return;
      }
      if (answers.length > 0) submitQuestion(question.frameRpcId, answers, true);
    });
    const submitRow = el("div", "pending-actions submit-row");
    submitRow.append(submitAll);
    card.append(submitRow);
    pendingArea.append(card);
  }
}

/** 解析选项标签中的"(推荐)"/"(recommended)"后缀,返回基础标签与推荐标记。 */
function parseRecommendedLabel(label: string): { base: string; recommended: boolean } {
  const m = label.match(/\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i);
  if (!m || m.index === undefined) return { base: label, recommended: false };
  return { base: label.slice(0, m.index).trim() || label, recommended: true };
}

// ---------- 消息处理 ----------

function handleMessage(msg: any) {
  // 列表模式只关心会话列表相关消息;聊天渲染类消息直接忽略(列表布局没有消息区,渲染到游离树纯属浪费)
  if (state.mode === "list" && msg.kind !== "init") {
    if (!["sessions", "workspaces", "running", "status", "lang", "openTab", "newTab"].includes(msg.kind)) return;
  }
  switch (msg.kind) {
    case "init": {
      stopTurnStatus();
      state.sessions = msg.sessions ?? [];
      state.current = msg.current ?? null;
      state.mode = msg.mode === "list" ? "list" : "chat";
      state.locked = !!msg.locked;
      state.lang = msg.lang ?? "zh-cn";
      applyLayout();
      refreshList();
      // 语言就绪后刷新模块级静态文案(英文界面不再停留在中文)
      applyStaticTexts();
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
      state.models = null;
      state.presets = null;
      state.turnStarts = [];
      state.planMode = false;
      state.stepStarts = new Map();
      state.currentStreamTurn = undefined;
      state.streamedBlockKeys = new Set();
      state.turnToolGroup = null;
      messages.innerHTML = "";
      for (const wire of msg.events ?? []) handleEvent(wire);
      renderLoadMoreButton();
      for (const approval of msg.approvals ?? []) state.approvals.set(approval.approvalId, approval);
      for (const question of msg.questions ?? []) state.questions.set(question.frameRpcId, question);
      // 恢复排队消息(重连/切会话时队列可能非空)
      applyQueueItems(msg.queue ?? []);
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
      renderSubagentChips();
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
      };
      break;
    }
    case "subagentPreview": {
      const pop = el("div", "msg-popover");
      pop.append(el("div", "plus-menu-label", t("子代理最近回复")));
      pop.append(el("div", "subagent-preview", msg.preview ?? t("(暂无)")));
      pop.append(el("div", "plus-menu-label", t("完整历史请到 DSH 网页版查看")));
      conversationBottom.append(pop);
      pop.addEventListener("click", (e) => e.stopPropagation());
      const close = () => pop.remove();
      setTimeout(() => document.addEventListener("click", close, { once: true }), 0);
      break;
    }
    case "delta": {
      for (const wire of msg.events ?? []) handleEvent(wire);
      break;
    }
    case "workspaces": {
      state.workspaces = msg.workspaces ?? [];
      refreshList();
      break;
    }
    case "sessions": {
      state.sessions = msg.sessions ?? [];
      renderSessions();
      renderPresetSelect();
      refreshList();
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
          n.roleEl.textContent = clean(n.roleSuffix ? `${modelName} · ${n.roleSuffix}` : modelName);
        }
      }
      break;
    }
    case "presets": {
      state.presets = msg.value?.presets ?? [];
      renderPresetSelect();
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
      if (msg.value) state.context = msg.value;
      renderContextBar();
      break;
    }
    case "stats": {
      if (msg.sessionId && msg.sessionId !== state.current) break;
      // 合并部分更新(null 保留旧值),避免部分投影帧互相覆盖导致统计消失
      if (msg.value && typeof msg.value === "object") {
        state.stats = { ...(state.stats ?? {}), ...msg.value };
      }
      renderStatsLine();
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
      renderPending();
      break;
    }
    case "queue": {
      applyQueueItems(msg.items ?? []);
      break;
    }
    case "historyMore": {
      const events = msg.events ?? [];
      state.seqs = new Set();
      state.turnStarts = [];
      state.stepStarts = new Map();
      state.currentStreamTurn = undefined;
      state.streamedBlockKeys = new Set();
      state.turnToolGroup = null;
      state.queuedIds = new Map();
      messages.innerHTML = "";
      state.nodes = [];
      for (const wire of events) handleEvent(wire);
      state.hasMore = !!msg.hasMore;
      renderLoadMoreButton();
      break;
    }
    case "status": {
      updateStatus(msg.status ?? state.status);
      break;
    }
    case "lang": {
      // 语言设置变更:重载 webview 以全量应用新语言(重载后自动重连并恢复状态)
      const next = msg.lang ?? "zh-cn";
      if (next !== state.lang) {
        state.lang = next;
        setTimeout(() => location.reload(), 150);
      }
      break;
    }
    case "notice": {
      appendNode({ kind: "note", key: `notice:${Date.now()}`, el: null, text: msg.message ?? "" });
      break;
    }
    default:
      break;
  }
}

function sendCurrent(mode: "queue" | "steer" = "queue") {
  const text = input.value.trim();
  if (!text) return;
  if (!state.current) {
    appendNode({ kind: "note", key: `note:${Date.now()}`, el: null, text: "尚未选择会话,点击 ＋ 新建一个会话" });
    return;
  }
  vscode.postMessage({
    kind: "send",
    mode,
    text,
    attachments: state.attachments.map(({ kind, path }) => ({ kind, path })),
  });
  input.value = "";
  autoResize();
  updateSendButton();
}

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (msg && typeof msg === "object") handleMessage(msg);
});


// ---------- 布局模式(侧边栏会话列表 / 编辑器标签页聊天) ----------

let listRoot: HTMLDivElement | undefined;

/** 按 state.mode 切换整体布局:列表模式渲染会话列表,聊天模式渲染完整聊天 UI。 */
function applyLayout() {
  if (state.mode === "list") {
    if (!listRoot) listRoot = buildListApp();
    app.replaceChildren(listRoot);
  } else {
    app.replaceChildren(root);
    // 编辑器标签页模式:标签即会话,隐藏会话切换下拉与新建按钮
    sessionSelectWrap.style.display = state.locked ? "none" : "";
    btnNew.style.display = state.locked ? "none" : "";
  }
}

function buildListApp(): HTMLDivElement {
  const wrap = el("div", "list-view");
  const head = el("div", "list-header");
  head.append(el("span", "list-title", t("对话列表")));
  const btnNewChat = el("button", "btn btn-list-new");
  btnNewChat.append(lineIcon(ICONS.plus, 14), el("span", undefined, t("新建对话")));
  btnNewChat.addEventListener("click", () => vscode.postMessage({ kind: "newTab" }));
  head.append(btnNewChat);
  const search = el("input", "list-search");
  search.placeholder = t("搜索会话");
  search.value = state.search;
  search.addEventListener("input", () => {
    state.search = search.value;
    updateListRows(rows);
  });
  const searchWrap = el("div", "list-search-wrap");
  searchWrap.append(lineIcon(ICONS.search, 13), search);
  const rows = el("div", "list-rows");
  wrap.append(head, searchWrap, rows);
  updateListRows(rows);
  return wrap;
}

function refreshList() {
  if (state.mode !== "list" || !listRoot) return;
  const rows = listRoot.querySelector(".list-rows");
  if (rows) updateListRows(rows as HTMLElement);
}

function updateListRows(rows: HTMLElement) {
  rows.replaceChildren();
  const sessions = state.sessions;
  const q = state.search.trim().toLowerCase();
  const filtered = (sessions ?? []).filter((s) => {
    if (!q) return true;
    return (
      (s.title ?? "").toLowerCase().includes(q) ||
      s.sessionId.toLowerCase().includes(q) ||
      (s.cwd ?? "").toLowerCase().includes(q)
    );
  });
  if (filtered.length === 0) {
    rows.append(el("div", "list-empty", q ? t("无匹配会话") : t("暂无会话,点击新建对话")));
    return;
  }
  // 按工作区分组(会话归属以 workspace.sessionIds 为准,cwd 兜底)
  const groups: { id: string; title: string; path?: string; items: typeof filtered }[] = [];
  const used = new Set<string>();
  for (const w of state.workspaces) {
    const items = filtered.filter(
      (s) =>
        w.sessionIds.includes(s.sessionId) ||
        (!!s.cwd && !!w.path && s.cwd.toLowerCase() === w.path.toLowerCase()),
    );
    if (items.length === 0) continue;
    const title = w.title || (w.path ? w.path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? w.path : w.path);
    groups.push({ id: w.workspaceId, title, path: w.path, items });
    for (const s of items) used.add(s.sessionId);
  }
  const ungrouped = filtered.filter((s) => !used.has(s.sessionId));
  if (ungrouped.length > 0) groups.push({ id: "", title: t("未分组会话"), items: ungrouped });
  for (const g of groups) {
    const collapsed = state.collapsed.has(g.id);
    const head = el("div", "list-group-head");
    const chev = lineIcon(ICONS.chevron, 12);
    if (collapsed) chev.classList.add("collapsed");
    const headTitle = el("span", "list-group-title", g.title + " (" + g.items.length + ")");
    head.append(chev, headTitle);
    head.addEventListener("click", () => {
      if (collapsed) state.collapsed.delete(g.id);
      else state.collapsed.add(g.id);
      updateListRows(rows);
    });
    rows.append(head);
    if (!collapsed) {
      const body = el("div", "list-group-body");
      for (const s of g.items) {
        const item = el("div", "list-item" + (s.sessionId === state.current ? " active" : ""));
        const titleRow = el("div", "list-item-title");
        if (s.running) titleRow.append(el("span", "list-item-running"));
        titleRow.append(document.createTextNode(s.title || s.sessionId.slice(0, 16)));
        item.append(titleRow, el("div", "list-item-sub", s.cwd ?? ""));
        item.addEventListener("click", () => vscode.postMessage({ kind: "openTab", sessionId: s.sessionId }));
        body.append(item);
      }
      rows.append(body);
    }
  }
}

vscode.postMessage({ kind: "ready" });
