/**
 * 侧栏大面板:工作区浏览器 / 会话内容搜索 / 后台任务 / 轨迹视图 /
 * 设置(常规 + 模型与供应商 + Agent 预设)/ 子代理对话。
 *
 * 与网页端功能对齐:工作区分组管理、会话搜索、任务台账、事件轨迹、
 * 宿主设置(schema 驱动表单)、凭据管理、模型供应商目录与"发现模型"、
 * Agent 预设查看/复制/删除/打开目录、子代理追问与打断。
 *
 * 面板通过 PanelsContext 读取共享状态并 postMessage 回宿主。
 */

export interface PanelSession {
  sessionId: string;
  title?: string;
  running: boolean;
  blank: boolean;
  cwd?: string;
  agentPreset?: string;
  parentSessionId?: string;
  origin?: string;
  updatedAt: number;
  pending?: { kind: "approval" | "question" | "plan-review" };
}

export interface PanelWorkspace {
  workspaceId: string;
  path: string;
  title: string;
  sessionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PanelJob {
  id: string;
  kind: string;
  label: string;
  status: "running" | "stopping" | "completed" | "killed" | "failed";
  detail?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface PanelPreset {
  id: string;
  isDefault: boolean;
  trust?: "system" | "user";
  name?: string;
  description?: string;
  broken?: string;
}

export interface PanelsContext {
  state: {
    sessions: PanelSession[];
    workspaces: PanelWorkspace[];
    workspaceOrder: string[];
    archivedSessionIds: string[];
    jobs: PanelJob[];
    current: string | null;
    presets: PanelPreset[] | null;
    settingsDescribe: {
      writable: boolean;
      hasDocument: boolean;
      namespaces: PanelNamespace[];
    } | null;
    lang: string;
    languagePref: string;
    agentDirs: { claude: boolean; codex: boolean; githubCopilot: boolean };
  };
  post: (msg: Record<string, unknown>) => void;
  el: (tag: string, cls?: string, text?: string) => HTMLElement;
  t: (zh: string, params?: Record<string, string | number>) => string;
  setHtml: (node: HTMLElement, text: string) => void;
  lineIcon: (paths: string, size?: number) => SVGSVGElement;
  ICONS: Record<string, string>;
  showDialog: (opts: { title: string; text: string; input?: boolean; confirmLabel?: string; confirm2Label?: string; value?: string }) => Promise<string | null>;
  basename: (p: string) => string;
  fmtDuration: (ms: number) => string;
  fmtClock: (ms: number) => string;
  fmtTokens: (n: number) => string;
  /** 会话行点击 → 打开会话 */
  selectSession: (sessionId: string) => void;
  /** 打开文件(产物等) */
  openFile: (path: string) => void;
  /** 在系统资源管理器中显示 */
  reveal: (path: string) => void;
  /** 用户消息事件里有图片块时,请求会话图片数据 */
  requestAttachment: (sessionId: string, attachmentId: string, messageId: string) => void;
}

export interface PanelNamespace {
  ns: string;
  schema: unknown;
  value: unknown;
  base?: unknown;
  user?: unknown;
  applies: "live" | "restart";
  secrets: { path: string[]; set: boolean }[];
  revision: number;
}

// ---------- schemastery 序列化 schema 形状 ----------

interface SchemaNode {
  type?: string;
  meta?: {
    default?: unknown;
    required?: boolean;
    role?: string;
    min?: number;
    max?: number;
    step?: number;
    description?: string;
    [key: string]: unknown;
  };
  value?: unknown;
  dict?: Record<string, number>;
  inner?: number;
  list?: number[];
}

interface SchemaDoc {
  uid: number;
  refs: Record<string, SchemaNode>;
}

function parseSchema(schema: unknown): { root: SchemaNode; refs: Record<string, SchemaNode> } {
  const doc = (schema ?? {}) as Partial<SchemaDoc>;
  const refs = (doc.refs ?? {}) as Record<string, SchemaNode>;
  const root = refs[String(doc.uid ?? "")] ?? { type: "object", meta: {}, dict: {} };
  return { root, refs };
}

// ---------- 工具 ----------

let overlaySeq = 0;

function iconBtn(
  ctx: PanelsContext,
  paths: string,
  title: string,
  onClick: () => void,
  cls = "btn-icon-btn",
): HTMLElement {
  const b = ctx.el("button", cls) as HTMLButtonElement;
  b.title = title;
  b.append(ctx.lineIcon(paths, 14));
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

function textBtn(ctx: PanelsContext, label: string, title: string, onClick: () => void, cls = "mini-btn"): HTMLElement {
  const b = ctx.el("button", cls, label) as HTMLButtonElement;
  if (title) b.title = title;
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

/** 面板骨架:遮罩 + 面板容器。头部结构:标题 | 控件区 | 关闭按钮。 */
function makePanel(ctx: PanelsContext, title: string, wide = false): {
  overlay: HTMLElement;
  sheet: HTMLElement;
  body: HTMLElement;
  close: () => void;
  head: HTMLElement;
  headControls: HTMLElement;
} {
  const overlay = ctx.el("div", "panel-overlay");
  overlay.hidden = true;
  const sheet = ctx.el("div", wide ? "panel-sheet panel-wide" : "panel-sheet");
  const head = ctx.el("div", "panel-head");
  head.append(ctx.el("span", "panel-title", title));
  const headControls = ctx.el("div", "panel-head-controls");
  head.append(headControls);
  const closeBtn = iconBtn(ctx, ctx.ICONS.x, ctx.t("关闭"), () => close());
  closeBtn.classList.add("panel-close");
  head.append(closeBtn);
  const body = ctx.el("div", "panel-body");
  sheet.append(head, body);
  overlay.append(sheet);
  document.body.append(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  const esc = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", esc);
  const close = () => {
    overlay.hidden = true;
    document.removeEventListener("keydown", esc);
  };
  return { overlay, sheet, body, close, head, headControls };
}

function sessionRowTitle(ctx: PanelsContext, s: PanelSession): string {
  const id = s.sessionId.slice(0, 12);
  const cwd = s.cwd ? ctx.basename(s.cwd) : "";
  const branch = s.parentSessionId ? "↪ " : "";
  return `${branch}${s.title || (s.blank ? "🆕 新会话" : `💬 ${id}`)}${cwd && !s.title ? ` · ${cwd}` : ""}${s.agentPreset ? ` · ${s.agentPreset}` : ""}`;
}

function statusIconFor(s: PanelSession, ctx: PanelsContext): { icon: string; cls: string; title: string } {
  if (s.pending) {
    return {
      icon: s.pending.kind === "plan-review" ? "📋" : s.pending.kind === "question" ? "❓" : "🛡️",
      cls: "ws-status ws-pending",
      title: ctx.t(s.pending.kind === "approval" ? "等待审批" : s.pending.kind === "plan-review" ? "计划待审" : "等待回答"),
    };
  }
  if (s.running) return { icon: "●", cls: "ws-status ws-running", title: ctx.t("运行中") };
  return { icon: "", cls: "ws-status", title: "" };
}

// ============================================================
// 1. 工作区浏览器 + 会话搜索
// ============================================================

export function createPanels(ctx: PanelsContext) {
  const { state, post, t } = ctx;
  let requestSeq = 0;
  const nextRequestId = () => `r${Date.now()}-${overlaySeq++}-${requestSeq++}`;

  // ---------- 工作区面板 ----------

  let wsPanel: ReturnType<typeof makePanel> | undefined;
  let wsSearch = "";
  let wsSearchTimer: ReturnType<typeof setTimeout> | undefined;
  let wsResults: { sessionId: string; snippet: string }[] | null = null;
  let wsSearchError = "";

  function openWorkspaces() {
    if (!wsPanel) {
      wsPanel = makePanel(ctx, t("📁 工作区"), false);
      const controls = wsPanel.headControls;
      // 搜索框
      const searchWrap = ctx.el("div", "ws-search");
      const searchInput = ctx.el("input", "ws-search-input") as HTMLInputElement;
      searchInput.placeholder = t("搜索会话…");
      searchInput.value = wsSearch;
      searchInput.addEventListener("input", () => {
        wsSearch = searchInput.value.trim();
        if (wsSearchTimer !== undefined) clearTimeout(wsSearchTimer);
        if (!wsSearch) {
          wsResults = null;
          wsSearchError = "";
          renderWorkspaceBody();
          return;
        }
        const q = wsSearch;
        wsSearchTimer = setTimeout(() => {
          post({ kind: "searchSessions", query: q, requestId: nextRequestId() });
        }, 250);
      });
      searchWrap.append(searchInput);
      controls.append(searchWrap);
      // 添加工作区
      const addBtn = textBtn(ctx, t("＋ 添加工作区"), t("选择现有文件夹作为工作区"), () => post({ kind: "workspaceAdd" }), "mini-btn accent");
      controls.append(addBtn);
      renderWorkspaceBody();
    }
    wsPanel.overlay.hidden = false;
  }

  function workspaceOfSession(sessionId: string): PanelWorkspace | undefined {
    return state.workspaces.find((w) => w.sessionIds.includes(sessionId));
  }

  function renderWorkspaceBody() {
    if (!wsPanel) return;
    const body = wsPanel.body;
    body.innerHTML = "";
    const archived = new Set(state.archivedSessionIds);

    // 搜索模式:平铺结果(归档与子代理会话从搜索结果隐藏)
    if (wsSearch) {
      if (wsSearchError) {
        const warn = ctx.el("div", "ws-note", `⚠️ ${wsSearchError}`);
        body.append(warn);
      }
      if (wsResults === null) {
        body.append(ctx.el("div", "ws-note", t("搜索中…")));
        return;
      }
      const visibleResults = wsResults.filter((item) => {
        if (archived.has(item.sessionId)) return false;
        const s = state.sessions.find((x) => x.sessionId === item.sessionId);
        return s?.origin !== "subagent";
      });
      if (visibleResults.length === 0) {
        body.append(ctx.el("div", "ws-note", t("没有匹配的会话")));
        return;
      }
      for (const item of visibleResults) {
        const s = state.sessions.find((x) => x.sessionId === item.sessionId);
        const row = ctx.el("button", "ws-row ws-result");
        const icon = ctx.el("span", "ws-icon", s ? (s.blank ? "🆕" : "💬") : "💬");
        const main = ctx.el("span", "ws-main");
        main.append(ctx.el("span", "ws-title", s ? sessionRowTitle(ctx, s) : item.sessionId));
        if (item.snippet) main.append(ctx.el("span", "ws-snippet", item.snippet.slice(0, 240)));
        row.append(icon, main);
        row.addEventListener("click", () => {
          ctx.selectSession(item.sessionId);
          wsPanel?.close();
        });
        body.append(row);
      }
      return;
    }

    const accounted = new Set<string>();
    const ordered = state.workspaceOrder.slice();
    const wsList = [...state.workspaces].sort((a, b) => {
      const ia = ordered.indexOf(a.workspaceId);
      const ib = ordered.indexOf(b.workspaceId);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.title.localeCompare(b.title);
    });

    for (const w of wsList) {
      for (const sid of w.sessionIds) accounted.add(sid);
      const group = ctx.el("div", "ws-group");
      const head = ctx.el("div", "ws-group-head");
      const label = ctx.el("span", "ws-group-title", w.title);
      label.title = w.path;
      head.append(label);
      head.append(ctx.el("span", "ws-count", String(w.sessionIds.length)));
      const actions = ctx.el("span", "ws-actions");
      const idx = wsList.indexOf(w);
      const prevW = idx > 0 ? wsList[idx - 1] : undefined;
      const nextW = idx < wsList.length - 1 ? wsList[idx + 1] : undefined;
      actions.append(
        iconBtn(ctx, ctx.ICONS.up2, t("上移工作区"), () => post({ kind: "workspaceMove", workspaceId: w.workspaceId, beforeWorkspaceId: prevW?.workspaceId }), "mini-btn"),
        iconBtn(ctx, ctx.ICONS.down2, t("下移工作区"), () => {
          const afterNext = idx + 2 < wsList.length ? wsList[idx + 2] : undefined;
          post({ kind: "workspaceMove", workspaceId: w.workspaceId, beforeWorkspaceId: afterNext?.workspaceId });
        }, "mini-btn"),
        iconBtn(ctx, ctx.ICONS.edit, t("重命名工作区"), () => {
          void ctx.showDialog({ title: t("重命名工作区"), text: t("新标题(仅显示名,不影响目录)"), input: true, value: w.title }).then((v) => {
            if (v) post({ kind: "workspaceRename", workspaceId: w.workspaceId, title: v });
          });
        }, "mini-btn"),
        iconBtn(ctx, ctx.ICONS.trash, t("移除工作区(会话保留为未分组)"), () => {
          void ctx.showDialog({ title: t("移除工作区"), text: `${t("确定移除工作区")} "${w.title}"?\n${t("目录与会话日志都保留,会话变为未分组。")}` }).then((v) => {
            if (v) post({ kind: "workspaceDelete", workspaceId: w.workspaceId });
          });
        }, "mini-btn"),
      );
      head.append(actions);
      group.append(head);

      // 组内会话行(按工作区顺序;归档与子代理会话从分组表面隐藏)
      for (const sid of w.sessionIds) {
        const s = state.sessions.find((x) => x.sessionId === sid);
        if (archived.has(sid)) continue;
        if (s?.origin === "subagent") continue;
        group.append(sessionRow(w, s, sid));
      }
      body.append(group);
    }

    // 未分组会话
    const ungrouped = state.sessions.filter(
      (s) => !archived.has(s.sessionId) && !accounted.has(s.sessionId) && (!s.origin || s.origin !== "subagent"),
    );
    if (ungrouped.length > 0) {
      const group = ctx.el("div", "ws-group");
      const head = ctx.el("div", "ws-group-head");
      head.append(ctx.el("span", "ws-group-title", t("未分组")));
      head.append(ctx.el("span", "ws-count", String(ungrouped.length)));
      group.append(head);
      for (const s of ungrouped) group.append(sessionRow(undefined, s, s.sessionId));
      body.append(group);
    }

    // 归档会话(默认折叠,仅供查看;与网页端一致:归档会话从所有常规列表隐藏)
    const archivedList = state.sessions.filter((s) => archived.has(s.sessionId));
    if (archivedList.length > 0) {
      const group = ctx.el("details", "ws-group ws-archived-group");
      const summary = ctx.el("summary", "ws-group-head");
      summary.append(ctx.el("span", "ws-group-title", t("🗄️ 已归档")));
      summary.append(ctx.el("span", "ws-count", String(archivedList.length)));
      group.append(summary);
      for (const s of archivedList) {
        const row = ctx.el("button", "ws-row ws-row-archived");
        const st = statusIconFor(s, ctx);
        const status = ctx.el("span", st.cls, st.icon);
        if (st.title) status.title = st.title;
        const main = ctx.el("span", "ws-main");
        main.append(ctx.el("span", "ws-title", sessionRowTitle(ctx, s)));
        row.append(status, main);
        row.append(textBtn(ctx, t("打开"), t("归档会话仍保留在服务器,可继续查看"), () => ctx.selectSession(s.sessionId), "mini-btn"));
        group.append(row);
      }
      body.append(group);
    }
  }

  function sessionRow(workspace: PanelWorkspace | undefined, s: PanelSession | undefined, sid: string): HTMLElement {
    const row = ctx.el("button", "ws-row");
    const st = s ? statusIconFor(s, ctx) : { icon: "", cls: "ws-status", title: "" };
    const status = ctx.el("span", st.cls, st.icon);
    if (st.title) status.title = st.title;
    const main = ctx.el("span", "ws-main");
    main.append(ctx.el("span", "ws-title", s ? sessionRowTitle(ctx, s) : sid));
    if (s?.cwd) {
      const sub = ctx.el("span", "ws-sub");
      sub.textContent = s.cwd;
      sub.title = s.cwd;
      main.append(sub);
    }
    row.append(status, main);
    row.addEventListener("click", () => {
      ctx.selectSession(sid);
      wsPanel?.close();
    });
    if (!workspace || !s) return row;

    const actions = ctx.el("span", "ws-actions");
    const ids = workspace.sessionIds.filter((id) => id !== sid);
    const i = ids.indexOf(sid);
    const prevS = i > 0 ? ids[i - 1] : undefined;
    const nextS = i < ids.length - 1 ? ids[i + 1] : undefined;
    actions.append(
      iconBtn(ctx, ctx.ICONS.up2, t("在组内上移"), () => post({ kind: "sessionMove", workspaceId: workspace.workspaceId, sessionId: sid, beforeSessionId: prevS }), "mini-btn"),
      iconBtn(ctx, ctx.ICONS.down2, t("在组内下移"), () => {
        const afterNext = i + 2 < ids.length ? ids[i + 2] : undefined;
        post({ kind: "sessionMove", workspaceId: workspace.workspaceId, sessionId: sid, beforeSessionId: afterNext });
      }, "mini-btn"),
      iconBtn(ctx, ctx.ICONS.trash, t("归档会话"), () => post({ kind: "archiveSessionOnly", sessionId: sid }), "mini-btn"),
    );
    row.append(actions);
    return row;
  }

  function updateWorkspaces() {
    if (wsPanel && !wsPanel.overlay.hidden) renderWorkspaceBody();
  }

  function renderSearchResults(msg: { requestId?: string; value: { items: { sessionId: string; snippet: string }[]; hasMore: boolean } | null; error?: string }) {
    if (!wsPanel || !wsSearch) return;
    if (msg.value === null) {
      // 后端搜索失败(如部署禁用了搜索索引):回退为本地标题/工作区匹配
      wsSearchError = msg.error ?? t("搜索失败");
      const q = wsSearch.toLowerCase();
      const local = state.sessions
        .filter((s) => {
          if ((s.title ?? "").toLowerCase().includes(q)) return true;
          if (s.sessionId.toLowerCase().includes(q)) return true;
          const w = state.workspaces.find((x) => x.sessionIds.includes(s.sessionId));
          return (w?.title ?? "").toLowerCase().includes(q);
        })
        .map((s) => ({ sessionId: s.sessionId, snippet: "" }));
      wsResults = local;
    } else {
      wsSearchError = "";
      wsResults = msg.value.items;
    }
    renderWorkspaceBody();
  }

  // ---------- 2. 后台任务面板 ----------

  let jobsPanel: ReturnType<typeof makePanel> | undefined;

  function openJobs() {
    if (!jobsPanel) jobsPanel = makePanel(ctx, t("⚙️ 后台任务"), false);
    renderJobsBody();
    jobsPanel.overlay.hidden = false;
  }

  function renderJobsBody() {
    if (!jobsPanel) return;
    const body = jobsPanel.body;
    body.innerHTML = "";
    const jobs = state.jobs ?? [];
    if (jobs.length === 0) {
      body.append(ctx.el("div", "ws-note", t("当前会话没有后台任务。agent 启动的 bash/pwsh/子代理等任务会出现在这里。")));
      return;
    }
    for (const job of jobs) {
      const row = ctx.el("div", "job-row");
      const statusCls = job.status === "running" ? "job-running" : job.status === "stopping" ? "job-stopping" : job.status === "failed" ? "job-failed" : "job-done";
      const dot = ctx.el("span", `job-status ${statusCls}`, job.status === "running" ? "●" : job.status === "stopping" ? "◐" : job.status === "failed" ? "✕" : "✓");
      dot.title = job.status;
      const main = ctx.el("span", "job-main");
      const title = ctx.el("span", "job-title");
      title.textContent = `[${job.kind}] ${job.label}`;
      title.title = job.label;
      main.append(title);
      const meta = ctx.el("span", "job-meta");
      meta.textContent = `${job.id} · ${ctx.fmtClock(job.startedAt)}${job.finishedAt ? ` → ${ctx.fmtClock(job.finishedAt)} (${ctx.fmtDuration(job.finishedAt - job.startedAt)})` : ` · ${ctx.fmtDuration(Date.now() - job.startedAt)}`}${job.detail ? ` · ${job.detail}` : ""}`;
      main.append(meta);
      row.append(dot, main);
      body.append(row);
    }
    const hint = ctx.el("div", "ws-note", t("提示:后台任务的启动与终止由 agent 的 job 工具完成;若需终止,可让 agent 执行 job_kill。"));
    body.append(hint);
  }

  function updateJobs() {
    if (jobsPanel && !jobsPanel.overlay.hidden) renderJobsBody();
  }

  // ---------- 3. 轨迹视图 ----------

  let trajPanel: ReturnType<typeof makePanel> | undefined;
  let trajEvents: { event: { type: string; seq: number; time: number; data: any }; view?: unknown }[] = [];
  let trajTurn = 0;
  let trajFilter = "";
  const trajExpanded = new Set<string>();

  function openTrajectory(events: { event: { type: string; seq: number; time: number; data: any }; view?: unknown }[]) {
    trajEvents = events;
    if (!trajPanel) {
      trajPanel = makePanel(ctx, t("🧭 事件轨迹"), true);
      const filter = ctx.el("input", "ws-search-input traj-filter") as HTMLInputElement;
      filter.placeholder = t("筛选事件类型…");
      filter.addEventListener("input", () => {
        trajFilter = filter.value.trim().toLowerCase();
        renderTrajectoryBody();
      });
      trajPanel.headControls.append(filter);
    }
    renderTrajectoryBody();
    trajPanel.overlay.hidden = false;
  }

  function shortEventText(ev: { type: string; data: any }): string {
    const d = ev.data ?? {};
    switch (ev.type) {
      case "user/message": {
        const blocks = d.message?.content ?? [];
        return blocks
          .map((b: any) => (b.type === "text" ? b.text : b.type === "image" ? "🖼️ [图片]" : `[${b.type}]`))
          .join(" ")
          .slice(0, 200);
      }
      case "assistant/message": {
        const blocks = d.message?.content ?? [];
        return blocks
          .map((b: any) => (b.type === "text" ? b.text : b.type === "reasoning" ? `[思考] ${String(b.text).slice(0, 60)}` : `[${b.type}]`))
          .join(" ")
          .slice(0, 200);
      }
      case "assistant/chunk":
        return d.kind === "text-delta" ? String(d.text ?? "").slice(0, 120) : `[${d.kind}]`;
      case "tool/call":
        return `${d.name ?? d.toolName ?? ""} ${typeof d.arguments === "string" ? d.arguments.slice(0, 120) : ""}`;
      case "tool/result":
        return typeof d === "string" ? d.slice(0, 120) : JSON.stringify(d).slice(0, 120);
      case "step/start":
        return d.kind ? `step ${d.kind}` : "";
      case "turn/start":
        return d.deliverables?.length ? `产出 ${d.deliverables.length} 个文件` : "";
      case "turn/end":
        return d.turn !== undefined ? `回合 ${d.turn} 结束` : "";
      case "compaction/summary":
        return String(d.text ?? "").slice(0, 120);
      case "session/title":
        return `标题: ${d.title ?? ""}`;
      case "goal/change":
        return `目标: ${d.phase ?? d.objective ?? ""}`;
      case "plan/mode":
        return `计划模式: ${d.mode ?? JSON.stringify(d)}`;
      default:
        return JSON.stringify(d).slice(0, 120);
    }
  }

  function eventTokens(ev: { type: string; data: any }): string {
    const d = ev.data ?? {};
    const usage = d.usage ?? d.message?.usage ?? d.tokenUsage;
    if (!usage) return "";
    const input = usage.inputTokens ?? usage.promptTokens ?? usage.input;
    const output = usage.outputTokens ?? usage.completionTokens ?? usage.output;
    const parts: string[] = [];
    if (input !== undefined) parts.push(`入 ${ctx.fmtTokens(input)}`);
    if (output !== undefined) parts.push(`出 ${ctx.fmtTokens(output)}`);
    if (usage.cacheReadTokens !== undefined) parts.push(`缓存 ${ctx.fmtTokens(usage.cacheReadTokens)}`);
    return parts.join(" · ");
  }

  function renderTrajectoryBody() {
    if (!trajPanel) return;
    const body = trajPanel.body;
    body.innerHTML = "";
    const rows = trajEvents.filter((e) => !trajFilter || e.event.type.toLowerCase().includes(trajFilter));
    if (rows.length === 0) {
      body.append(ctx.el("div", "ws-note", t("(空)没有匹配的事件。轨迹来自当前会话的已加载历史。")));
      return;
    }
    for (const item of rows) {
      const ev = item.event;
      if (ev.type === "turn/start") {
        trajTurn = ev.data?.turn ?? trajTurn + 1;
        const sep = ctx.el("div", "traj-turn-sep", `━ 回合 ${trajTurn} ━`);
        body.append(sep);
      }
      const row = ctx.el("div", "traj-row");
      row.title = t("点击展开完整 JSON");
      const key = `${ev.seq}`;
      const seq = ctx.el("span", "traj-seq", String(ev.seq));
      seq.title = t("事件序号(seq)");
      const clock = ctx.el("span", "traj-clock", ctx.fmtClock(ev.time));
      const type = ctx.el("span", "traj-type", ev.type);
      const tokens = eventTokens(ev);
      const summary = ctx.el("span", "traj-summary");
      summary.textContent = shortEventText(ev);
      const tokEl = ctx.el("span", "traj-tokens", tokens);
      const caret = ctx.el("span", "traj-caret", trajExpanded.has(key) ? "▾" : "▸");
      const main = ctx.el("span", "traj-main");
      const line1 = ctx.el("span", "traj-line1");
      line1.append(type, tokEl ? tokEl : ctx.el("span"), summary);
      main.append(line1);
      const expanded = trajExpanded.has(key);
      if (expanded) {
        const detail = ctx.el("pre", "traj-detail");
        try {
          detail.textContent = JSON.stringify(ev.data, null, 2).slice(0, 8000);
        } catch {
          detail.textContent = String(ev.data);
        }
        main.append(detail);
      }
      row.append(caret, seq, clock, main);
      row.addEventListener("click", () => {
        if (trajExpanded.has(key)) trajExpanded.delete(key);
        else trajExpanded.add(key);
        renderTrajectoryBody();
      });
      body.append(row);
    }
    body.scrollTop = body.scrollHeight;
  }

  // ---------- 4. 设置面板 ----------

  let settingsPanel: ReturnType<typeof makePanel> | undefined;
  let settingsTab: "general" | "models" | "presets" = "general";
  let llmProviders: { provider: string; displayName: string; settingsNs: string; settingsPath: string[]; active: boolean; declared?: boolean }[] = [];
  let llmModelGroups: { id: string; name: string; models: { id: string; name: string; description?: string; reasoning?: unknown }[] }[] = [];
  let llmFailures: { id: string; name: string; message: string }[] = [];
  let discovered: { id: string; name?: string; contextWindow?: number; maxTokens?: number }[] | null = null;
  let discoverError = "";
  let discoverBusy = false;
  let presetReadValue: { agentPreset: string; trust: string; content: string; name?: string; description?: string } | null = null;
  /** 各命名空间本地已配置的凭据集合(ref → true) */
  const credentialCache = new Map<string, boolean>();

  function openSettings() {
    if (!settingsPanel) {
      settingsPanel = makePanel(ctx, t("⚙️ 设置"), true);
      const tabs = ctx.el("div", "settings-tabs");
      const mkTab = (id: "general" | "models" | "presets", label: string) => {
        const b = ctx.el("button", "settings-tab", label) as HTMLButtonElement;
        b.addEventListener("click", () => {
          settingsTab = id;
          renderSettingsBody();
        });
        tabs.append(b);
        return b;
      };
      mkTab("general", t("常规"));
      mkTab("models", t("模型与供应商"));
      mkTab("presets", t("Agent 预设"));
      settingsPanel.headControls.append(tabs);
      renderSettingsBody();
    }
    settingsPanel.overlay.hidden = false;
    if (!state.settingsDescribe) post({ kind: "settingsGet", requestId: nextRequestId() });
    if (llmProviders.length === 0 && llmModelGroups.length === 0) {
      post({ kind: "llmInfo", requestId: nextRequestId() });
    }
    if (!state.presets) post({ kind: "getPresets" });
  }

  function refreshSettings() {
    if (settingsPanel && !settingsPanel.overlay.hidden) renderSettingsBody();
  }

  function renderSettingsBody() {
    if (!settingsPanel) return;
    const body = settingsPanel.body;
    body.innerHTML = "";
    const tabBtns = settingsPanel.head.querySelectorAll(".settings-tab");
    tabBtns.forEach((b, i) => b.classList.toggle("active", (["general", "models", "presets"] as const)[i] === settingsTab));
    if (settingsTab === "general") renderGeneralTab(body);
    else if (settingsTab === "models") renderModelsTab(body);
    else renderPresetsTab(body);
  }

  function nsGroup(ns: string): "llm" | "general" {
    if (ns.startsWith("llm-") || ns.startsWith("web-search-")) return "llm";
    return "general";
  }

  /** 命名空间友好名称(中文源语言,经 t() 多语言化);未知命名空间回退原始 id。 */
  const NAMESPACE_TITLES: Record<string, string> = {
    "ui-onboarding": "引导设置",
    "web-search-deepseek": "网页搜索(DeepSeek)",
    "llm-deepseek": "DeepSeek 供应商",
    "llm-pi-ai": "其他模型供应商",
    "ui-theme": "界面主题",
    "locale": "网页端语言",
    "ui-conversation": "对话行为",
    "agent-presets": "Agent 预设(默认)",
    "agent-loop": "Agent 循环",
    shell: "Shell 执行",
    permission: "默认权限预设",
  };

  function nsTitle(ns: string): string {
    return t(NAMESPACE_TITLES[ns] ?? ns);
  }

  /** 已知字段名本地化;未知字段自动驼峰拆词(如 welcomeNoticeVersion → Welcome Notice Version)。 */
  const FIELD_LABELS: Record<string, string> = {
    welcomeNoticeVersion: "欢迎提示版本",
    apiKey: "API Key",
    apiKeyEnv: "API Key 环境变量",
    baseURL: "Base URL",
    model: "模型",
    apiVersion: "API 版本",
    maxTokens: "最大 Token 数",
    maxUses: "最大使用次数",
    defaultPreset: "默认权限预设",
    preference: "偏好",
    busyEnter: "忙碌时回车行为",
    maxParallelToolCalls: "最大并行工具调用",
    cwd: "工作目录",
    timeoutMs: "超时(毫秒)",
    maxTimeoutMs: "最大超时(毫秒)",
    maxOutputBytes: "最大输出字节",
    maxSpillBytes: "最大溢出字节",
    graceMs: "宽限(毫秒)",
    pwshPath: "pwsh 路径",
    default: "默认",
    initialDelayMs: "初始延迟(毫秒)",
    maxDelayMs: "最大延迟(毫秒)",
    jitterRatio: "抖动比例",
    mode: "模式",
    maxRetries: "最大重试次数",
    retryableCodes: "可重试错误码",
    backoff: "退避",
    providers: "供应商",
    api: "API 端点",
  };

  function fieldLabel(name: string): string {
    if (FIELD_LABELS[name] !== undefined) return t(FIELD_LABELS[name]);
    // 驼峰拆词:maxParallelToolCalls → Max Parallel Tool Calls
    const prettified = name.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
    return prettified === name ? name : prettified;
  }

  function renderGeneralTab(body: HTMLElement) {
    // 语言切换(便于快速验证多语言;写入 dsh.language 设置)
    const langSection = ctx.el("div", "settings-section");
    langSection.append(ctx.el("div", "settings-section-title", t("🌐 语言 / Language")));
    const langRow = ctx.el("div", "settings-language-row");
    const options: { id: string; label: string }[] = [
      { id: "auto", label: t("跟随 VS Code") },
      { id: "zh-cn", label: "简体中文" },
      { id: "zh-tw", label: "繁體中文" },
      { id: "en", label: "English" },
      { id: "ja", label: "日本語" },
      { id: "ko", label: "한국어" },
      { id: "de", label: "Deutsch" },
      { id: "fr", label: "Français" },
      { id: "es", label: "Español" },
      { id: "pt", label: "Português" },
      { id: "th", label: "ไทย" },
      { id: "id", label: "Bahasa Indonesia" },
      { id: "tr", label: "Türkçe" },
      { id: "ar", label: "العربية" },
    ];
    for (const opt of options) {
      const b = ctx.el("button", "settings-tab" + (state.languagePref === opt.id ? " active" : ""), opt.label) as HTMLButtonElement;
      b.title = opt.id === "auto" ? t("跟随 VS Code 显示语言") : opt.label;
      b.addEventListener("click", () => {
        if (state.languagePref === opt.id) return;
        post({ kind: "setLanguage", language: opt.id });
      });
      langRow.append(b);
    }
    langSection.append(langRow);
    langSection.append(ctx.el("div", "ws-note", t("切换后界面就地重渲染;默认跟随 VS Code 显示语言。")));
    body.append(langSection);

    // 智能体配置目录扫描开关(与 VS Code 设置 dsh.agentConfigDirs 同步)
    const dirsSection = ctx.el("div", "settings-section");
    dirsSection.append(ctx.el("div", "settings-section-title", t("智能体配置目录")));
    const dirsRow = ctx.el("div", "settings-perm-row");
    const dirOptions: { id: "claude" | "codex" | "githubCopilot"; label: string }[] = [
      { id: "claude", label: ".claude" },
      { id: "codex", label: ".codex" },
      { id: "githubCopilot", label: "GitHub Copilot" },
    ];
    for (const opt of dirOptions) {
      const on = state.agentDirs?.[opt.id] !== false;
      const b = ctx.el("button", "settings-tab" + (on ? " active" : ""), `${on ? "✅" : "☐"} ${opt.label}`) as HTMLButtonElement;
      b.title = opt.id === "claude" ? t("扫描 .claude(命令、技能)并报告 CLAUDE.md / AGENTS.md") : opt.id === "codex" ? t("扫描 .codex(config.toml、技能)") : t("扫描 .github Copilot 文件(指令、智能体、提示词)");
      b.addEventListener("click", () => {
        const next = {
          claude: state.agentDirs?.claude !== false,
          codex: state.agentDirs?.codex !== false,
          githubCopilot: state.agentDirs?.githubCopilot !== false,
        };
        next[opt.id] = !on;
        post({ kind: "setAgentDirs", value: next });
      });
      dirsRow.append(b);
    }
    dirsSection.append(dirsRow);
    dirsSection.append(ctx.el("div", "ws-note", t("控制 / 菜单中扫描列出的目录族;全部勾选则全部扫描。")));
    body.append(dirsSection);

    const desc = state.settingsDescribe;
    if (!desc) {
      body.append(ctx.el("div", "ws-note", t("加载设置中…")));
      return;
    }
    if (!desc.writable) {
      body.append(ctx.el("div", "ws-note", t("⚠️ 设置存储为只读,表单仅可查看。")));
    }
    // 默认权限预设(网页端同款:危险选项需显式风险确认)
    const permissionNs = desc.namespaces.find((n) => n.ns === "permission");
    if (permissionNs) renderPermissionDefaultSection(body, permissionNs);
    const general = desc.namespaces.filter((n) => nsGroup(n.ns) === "general" && n.ns !== "permission");
    for (const ns of general) body.append(renderNamespaceSection(ns));
    if (general.length === 0) body.append(ctx.el("div", "ws-note", t("没有可配置的常规设置项。")));
  }

  /** 默认权限预设专属行:带图标的按钮组 + 完全访问风险确认(网页端 ui-permission-presets 同款行为)。 */
  function renderPermissionDefaultSection(body: HTMLElement, ns: PanelNamespace) {
    const { root, refs } = parseSchema(ns.schema);
    const refId = root.dict?.["defaultPreset"];
    const node = refId !== undefined ? refs[String(refId)] : undefined;
    const values = node?.list ? node.list.map((id) => refs[String(id)]?.value).filter((v) => typeof v === "string") : [];
    if (values.length === 0) return;
    const current = (ns.value as { defaultPreset?: string } | undefined)?.defaultPreset;
    const icons: Record<string, string> = { "read-only": "🔒", "workspace-write": "🖊️", "danger-full-access": "⚠️" };
    const labelOf = (v: string): string =>
      v === "read-only" ? t("只读") : v === "workspace-write" ? t("工作区可写") : v === "danger-full-access" ? t("完全访问(危险)") : v;

    const section = ctx.el("div", "settings-section");
    section.append(ctx.el("div", "settings-section-title", t("默认权限预设")));
    const row = ctx.el("div", "settings-perm-row");
    for (const value of values) {
      const danger = value === "danger-full-access";
      const active = current === value;
      const b = ctx.el(
        "button",
        "settings-tab" + (active ? (danger ? " active perm-danger-active" : " active") : danger ? " perm-danger-chip" : ""),
        `${icons[value] ?? "🔒"} ${labelOf(value)}`,
      ) as HTMLButtonElement;
      b.title = danger ? t("危险:放开全部沙箱与审批限制") : value;
      b.addEventListener("click", () => {
        if (active) return;
        if (danger) {
          void ctx.showDialog({
            title: t("切换到完全访问(危险)"),
            text: t("完全访问会放开全部沙箱与审批限制,agent 可读取并修改任意文件。确定将其设为新会话的默认权限?"),
            confirmLabel: t("确认切换"),
          }).then((ok) => {
            if (ok) post({ kind: "settingsSave", ns: ns.ns, patch: { defaultPreset: value }, expectedRevision: ns.revision, requestId: nextRequestId() });
          });
          return;
        }
        post({ kind: "settingsSave", ns: ns.ns, patch: { defaultPreset: value }, expectedRevision: ns.revision, requestId: nextRequestId() });
      });
      row.append(b);
    }
    section.append(row);
    section.append(ctx.el("div", "ws-note", t("该设置对新会话生效;当前会话的权限用输入框旁的权限下拉切换。")));
    body.append(section);
  }

  function renderModelsTab(body: HTMLElement) {
    const desc = state.settingsDescribe;
    // 供应商目录
    const providersSection = ctx.el("div", "settings-section");
    providersSection.append(ctx.el("div", "settings-section-title", t("供应商路由")));
    if (llmProviders.length === 0) {
      providersSection.append(ctx.el("div", "ws-note", t("加载供应商目录中…")));
    } else {
      for (const p of llmProviders) {
        const row = ctx.el("div", "provider-row");
        const dot = ctx.el("span", `ws-status ${p.active ? "ws-running" : ""}`, p.active ? "●" : "○");
        dot.title = p.active ? t("已注册(可请求)") : t("未激活(配置后可用)");
        const main = ctx.el("span", "ws-main");
        main.append(ctx.el("span", "ws-title", p.displayName));
        main.append(ctx.el("span", "ws-sub", `${p.provider}${p.settingsNs ? ` · ${p.settingsNs}${p.settingsPath.length ? " → " + p.settingsPath.join(".") : ""}` : ""}`));
        row.append(dot, main);
        providersSection.append(row);
      }
    }
    body.append(providersSection);

    // 模型目录
    const modelsSection = ctx.el("div", "settings-section");
    modelsSection.append(ctx.el("div", "settings-section-title", t("模型目录")));
    for (const g of llmModelGroups) {
      const ghead = ctx.el("div", "ws-group-head");
      ghead.append(ctx.el("span", "ws-group-title", g.name));
      ghead.append(ctx.el("span", "ws-count", String(g.models.length)));
      modelsSection.append(ghead);
      for (const m of g.models) {
        const row = ctx.el("div", "provider-row");
        row.append(ctx.el("span", "ws-icon", "🧠"));
        const main = ctx.el("span", "ws-main");
        main.append(ctx.el("span", "ws-title", m.name));
        if (m.description) main.append(ctx.el("span", "ws-sub", m.description.slice(0, 160)));
        row.append(main);
        modelsSection.append(row);
      }
    }
    for (const f of llmFailures) {
      modelsSection.append(ctx.el("div", "ws-note", `⚠️ ${f.name}: ${f.message}`));
    }
    body.append(modelsSection);

    // 发现模型
    const discover = ctx.el("div", "settings-section");
    discover.append(ctx.el("div", "settings-section-title", t("发现模型(探测端点)")));
    const form = ctx.el("div", "settings-form-grid");
    const fields = {
      ns: makeFieldInput("settingsNs", t("适配器(namespace)"), "llm-deepseek"),
      provider: makeFieldInput("provider", t("路由名(可选)"), ""),
      baseURL: makeFieldInput("baseURL", t("baseURL"), ""),
      api: makeFieldInput("api", t("API 端点"), ""),
      apiKey: makeFieldInput("apiKey", t("API Key(临时,不保存)"), "", "password"),
    };
    for (const f of Object.values(fields)) form.append(f);
    const runBtn = textBtn(ctx, t("🔍 发现模型"), t("询问端点可用的模型,不写入任何设置"), () => {
      const payload: Record<string, unknown> = { settingsNs: (fields.ns.querySelector("input") as HTMLInputElement).value.trim() };
      const provider = (fields.provider.querySelector("input") as HTMLInputElement).value.trim();
      const baseURL = (fields.baseURL.querySelector("input") as HTMLInputElement).value.trim();
      const api = (fields.api.querySelector("input") as HTMLInputElement).value.trim();
      const apiKey = (fields.apiKey.querySelector("input") as HTMLInputElement).value.trim();
      if (!payload.settingsNs) return;
      if (provider) payload.provider = provider;
      if (baseURL) payload.baseURL = baseURL;
      if (api) payload.api = api;
      if (apiKey) payload.apiKey = apiKey;
      discoverBusy = true;
      discovered = null;
      renderSettingsBody();
      post({ kind: "discoverModels", requestId: nextRequestId(), ...payload });
    }, "mini-btn accent");
    discover.append(form, runBtn);
    if (discoverBusy) discover.append(ctx.el("div", "ws-note", t("探测中…")));
    if (discoverError) discover.append(ctx.el("div", "ws-note", `⚠️ ${discoverError}`));
    if (discovered) {
      const list = ctx.el("div", "discovered-list");
      for (const m of discovered) {
        const row = ctx.el("div", "provider-row");
        row.append(ctx.el("span", "ws-icon", "🧠"));
        const main = ctx.el("span", "ws-main");
        main.append(ctx.el("span", "ws-title", m.name ?? m.id));
        const meta: string[] = [m.id];
        if (m.contextWindow) meta.push(`上下文 ${m.contextWindow}`);
        if (m.maxTokens) meta.push(`最大输出 ${m.maxTokens}`);
        main.append(ctx.el("span", "ws-sub", meta.join(" · ")));
        row.append(main);
        list.append(row);
      }
      discover.append(list);
    }
    body.append(discover);

    // 各供应商的配置表单(来自 settings 命名空间)
    if (desc) {
      const llmNs = desc.namespaces.filter((n) => nsGroup(n.ns) === "llm");
      for (const ns of llmNs) body.append(renderNamespaceSection(ns));
    } else {
      body.append(ctx.el("div", "ws-note", t("设置描述未加载;关闭再打开面板重试。")));
    }
  }

  function makeFieldInput(name: string, label: string, value: string, type = "text"): HTMLElement {
    const wrap = ctx.el("label", "settings-field");
    wrap.append(ctx.el("span", "settings-field-label", label));
    const input = ctx.el("input", "settings-input") as HTMLInputElement;
    input.type = type;
    input.value = value;
    input.dataset.field = name;
    wrap.append(input);
    return wrap;
  }

  // ---------- schema 表单 ----------

  interface FieldDraft {
    path: string[];
    value: unknown;
    unset?: boolean;
    secretRef?: string;
    secretValue?: string;
    secretUnset?: boolean;
  }

  function deepClone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v)) as T;
  }

  /** 从命名空间描述构建一个可编辑表单。返回表单元素 + 读取草稿。 */
  function renderNamespaceSection(ns: PanelNamespace): HTMLElement {
    const section = ctx.el("div", "settings-section");
    const titleRow = ctx.el("div", "settings-section-title");
    // 标题用本地化友好名称,原始 id 以小字徽标保留(便于排查)
    titleRow.append(ctx.el("span", undefined, nsTitle(ns.ns)));
    titleRow.append(ctx.el("span", "settings-badge-soft", ns.ns));
    if (ns.applies === "restart") titleRow.append(ctx.el("span", "settings-badge", t("需重启")));
    titleRow.append(ctx.el("span", "settings-badge-soft", `rev ${ns.revision}`));
    section.append(titleRow);

    const { root, refs } = parseSchema(ns.schema);
    const form = ctx.el("div", "settings-form");
    const drafts = new Map<string, FieldDraft>();
    const secretRefs: string[] = [];

    const fieldKey = (path: string[]) => path.join("\u0000");
    const readValue = (path: string[]): unknown => {
      let v: unknown = ns.value;
      for (const p of path) {
        if (v && typeof v === "object") v = (v as Record<string, unknown>)[p];
        else return undefined;
      }
      return v;
    };
    const isUserOverridden = (path: string[]): boolean => {
      let v: unknown = ns.user;
      for (const p of path) {
        if (v && typeof v === "object") v = (v as Record<string, unknown>)[p];
        else return false;
      }
      return v !== undefined;
    };
    const secretSlot = (path: string[]): { path: string[]; set: boolean } | undefined =>
      ns.secrets.find((s) => s.path.join("\u0000") === path.join("\u0000"));

    const renderField = (container: HTMLElement, path: string[], fieldName: string, refId: number, depth: number) => {
      const node = refs[String(refId)];
      if (!node) {
        container.append(ctx.el("div", "ws-note", `⚠️ 未知字段引用 #${refId}`));
        return;
      }
      const meta = node.meta ?? {};
      const overridden = isUserOverridden(path);
      const wrap = ctx.el("div", "settings-field-row");
      // 字段名本地化:已知字段走词典,未知字段驼峰拆词
      const label = ctx.el("span", "settings-field-label", fieldLabel(fieldName));
      label.title = path.join(".");
      if (meta.description) label.title = `${path.join(".")} — ${String(meta.description)}`;
      wrap.style.paddingLeft = `${Math.min(depth, 4) * 14}px`;

      const nodeType = node.type ?? "";
      const variants = node.list ? node.list.map((id) => refs[String(id)]) : [];
      const allConst = nodeType === "union" && variants.length > 0 && variants.every((v) => v?.type === "const");
      const unionOfObjects = nodeType === "union" && variants.length > 0 && variants.every((v) => v?.type === "object");

      // 构造控件
      if (nodeType === "const") {
        const span = ctx.el("span", "settings-const", JSON.stringify(node.value));
        wrap.append(label, span);
        container.append(wrap);
        return;
      }
      if (nodeType === "boolean") {
        const input = ctx.el("input") as HTMLInputElement;
        input.type = "checkbox";
        input.checked = Boolean(readValue(path) ?? meta.default ?? false);
        const key = fieldKey(path);
        drafts.set(key, { path, value: input.checked });
        input.addEventListener("change", () => drafts.set(key, { path, value: input.checked }));
        wrap.append(label, input);
        container.append(wrap);
        return;
      }
      if (nodeType === "number") {
        const input = ctx.el("input", "settings-input") as HTMLInputElement;
        input.type = "number";
        const cur = readValue(path);
        input.value = cur === undefined ? String(meta.default ?? "") : String(cur);
        if (meta.min !== undefined) input.min = String(meta.min);
        if (meta.max !== undefined) input.max = String(meta.max);
        if (meta.step !== undefined) input.step = String(meta.step);
        const key = fieldKey(path);
        drafts.set(key, { path, value: cur === undefined ? (meta.default ?? null) : cur });
        input.addEventListener("input", () => {
          const num = input.value === "" ? null : Number(input.value);
          drafts.set(key, { path, value: num });
        });
        wrap.append(label, input);
        container.append(wrap);
        return;
      }
      if (nodeType === "union" && allConst) {
        const select = ctx.el("select", "settings-input") as HTMLSelectElement;
        const cur = readValue(path);
        for (const v of variants) {
          const opt = ctx.el("option", undefined, String(v?.value ?? "")) as HTMLOptionElement;
          opt.value = String(v?.value ?? "");
          if (String(cur ?? meta.default ?? "") === String(v?.value ?? "")) opt.selected = true;
          select.append(opt);
        }
        const key = fieldKey(path);
        drafts.set(key, { path, value: cur === undefined ? (meta.default ?? variants[0]?.value ?? "") : cur });
        select.addEventListener("change", () => drafts.set(key, { path, value: select.value }));
        wrap.append(label, select);
        container.append(wrap);
        return;
      }
      if (nodeType === "string") {
        const role = String(meta.role ?? "");
        if (role === "secret") {
          const slot = secretSlot(path);
          const input = ctx.el("input", "settings-input") as HTMLInputElement;
          input.type = "password";
          input.placeholder = slot?.set ? "••••••••(已配置)" : "未配置";
          const key = fieldKey(path);
          drafts.set(key, { path, value: undefined, secretRef: undefined });
          input.addEventListener("input", () => drafts.set(key, { path, value: undefined, secretValue: input.value }));
          const btn = textBtn(ctx, t("清除"), t("从凭据存储删除该密钥"), () => {
            const ref = resolveSecretRef(path);
            if (ref) {
              drafts.set(key, { path, value: undefined, secretUnset: true, secretRef: ref });
              input.value = "";
              input.placeholder = "未配置(保存后生效)";
            }
          }, "mini-btn");
          wrap.append(label, input, btn);
          container.append(wrap);
          return;
        }
        if (role === "credential-ref") {
          const input = ctx.el("input", "settings-input") as HTMLInputElement;
          const cur = readValue(path);
          input.value = cur === undefined ? String(meta.default ?? "") : String(cur);
          const key = fieldKey(path);
          drafts.set(key, { path, value: cur === undefined ? (meta.default ?? "") : cur });
          input.addEventListener("input", () => drafts.set(key, { path, value: input.value }));
          wrap.append(label, input);
          container.append(wrap);
          return;
        }
        const input = ctx.el("input", "settings-input") as HTMLInputElement;
        const cur = readValue(path);
        input.value = cur === undefined ? String(meta.default ?? "") : String(cur);
        const key = fieldKey(path);
        drafts.set(key, { path, value: cur === undefined ? (meta.default ?? "") : cur });
        input.addEventListener("input", () => drafts.set(key, { path, value: input.value }));
        wrap.append(label, input);
        container.append(wrap);
        return;
      }
      if (nodeType === "array") {
        const textarea = ctx.el("textarea", "settings-textarea") as HTMLTextAreaElement;
        const cur = readValue(path);
        const arr = Array.isArray(cur) ? cur : Array.isArray(meta.default) ? meta.default : [];
        textarea.value = arr.map((x) => String(x)).join("\n");
        const key = fieldKey(path);
        drafts.set(key, { path, value: arr });
        textarea.addEventListener("input", () => {
          drafts.set(key, { path, value: textarea.value.split("\n").filter((l) => l !== "") });
        });
        wrap.append(label, textarea);
        container.append(wrap);
        return;
      }
      if (nodeType === "object" && node.dict) {
        const group = ctx.el("details", "settings-group") as HTMLDetailsElement;
        group.open = depth < 2;
        const summary = ctx.el("summary", undefined, fieldLabel(fieldName));
        group.append(summary);
        for (const [childName, childRef] of Object.entries(node.dict)) {
          renderField(group, [...path, childName], childName, childRef, depth + 1);
        }
        wrap.append(label, group);
        container.append(wrap);
        return;
      }
      if (unionOfObjects) {
        // 变体选择 + 选中变体的字段;以变体索引命名
        const select = ctx.el("select", "settings-input") as HTMLSelectElement;
        const labelOf = (v: SchemaNode | undefined, i: number): string => {
          if (v?.type === "object" && v.dict) {
            for (const ref of Object.values(v.dict)) {
              const child = refs[String(ref)];
              if (child?.type === "const") return String(child.value);
            }
          }
          return `变体 ${i + 1}`;
        };
        variants.forEach((v, i) => {
          const opt = ctx.el("option", undefined, labelOf(v, i)) as HTMLOptionElement;
          opt.value = String(i);
          select.append(opt);
        });
        select.value = "0";
        const variantBox = ctx.el("div", "settings-group");
        const renderVariant = (i: number) => {
          variantBox.innerHTML = "";
          const v = variants[i];
          if (v?.type === "object" && v.dict) {
            for (const [childName, childRef] of Object.entries(v.dict)) {
              renderField(variantBox, [...path, childName], childName, childRef, depth + 1);
            }
          } else {
            variantBox.append(ctx.el("div", "ws-note", t("该变体无可用字段,使用 JSON 编辑器:")));
            const textarea = ctx.el("textarea", "settings-textarea") as HTMLTextAreaElement;
            const curV = readValue(path);
            textarea.value = JSON.stringify(curV ?? v?.meta?.default ?? {}, null, 2);
            const key = fieldKey(path);
            textarea.addEventListener("input", () => {
              try {
                drafts.set(key, { path, value: JSON.parse(textarea.value) });
              } catch {
                // 等待合法 JSON
              }
            });
            variantBox.append(textarea);
          }
        };
        select.addEventListener("change", () => renderVariant(Number(select.value)));
        renderVariant(0);
        wrap.append(label, select, variantBox);
        container.append(wrap);
        return;
      }
      // 兜底:JSON 编辑器(保证任何字段都可编辑)
      {
        const textarea = ctx.el("textarea", "settings-textarea") as HTMLTextAreaElement;
        const cur = readValue(path);
        textarea.value = JSON.stringify(cur ?? meta.default ?? null, null, 2);
        const key = fieldKey(path);
        drafts.set(key, { path, value: cur ?? meta.default ?? null });
        textarea.addEventListener("input", () => {
          try {
            drafts.set(key, { path, value: JSON.parse(textarea.value) });
          } catch {
            // 等待合法 JSON
          }
        });
        wrap.append(label, textarea);
        container.append(wrap);
        return;
      }
    };

    /** 查找与某 secret 字段同级的 credential-ref 字段当前值作为凭据名。 */
    function resolveSecretRef(path: string[]): string | undefined {
      if (path.length === 0) return undefined;
      const parent = path.slice(0, -1);
      const candidates = secretRefs.filter((r) => r.startsWith(parent.join("\u0000")));
      // 简单启发:同对象内字段名含 Env 的 credential-ref 值
      const siblings = [...secretRefs].filter((r) => {
        const p = r.split("\u0000");
        return p.length === path.length && p.slice(0, -1).join("\u0000") === parent.join("\u0000");
      });
      for (const s of siblings) {
        const p = s.split("\u0000");
        const val = readValue(p);
        if (typeof val === "string" && val) return val;
      }
      void candidates;
      return undefined;
    }

    // 预扫描 credential-ref 字段路径(供 secret 字段解析凭据名)
    const scanCredentialRefs = (node: SchemaNode, path: string[]) => {
      if (!node) return;
      if (node.type === "object" && node.dict) {
        for (const [name, ref] of Object.entries(node.dict)) {
          const child = refs[String(ref)];
          if (child?.meta?.role === "credential-ref") secretRefs.push([...path, name].join("\u0000"));
          scanCredentialRefs(child, [...path, name]);
        }
      }
    };
    scanCredentialRefs(root, []);

    if (root.type === "object" && root.dict) {
      for (const [name, ref] of Object.entries(root.dict)) {
        renderField(form, [name], name, ref, 0);
      }
    } else {
      form.append(ctx.el("div", "ws-note", t("该命名空间的根不是对象,暂不支持表单编辑。")));
    }

    section.append(form);

    // 操作行
    const actions = ctx.el("div", "settings-actions");
    const saveBtn = textBtn(ctx, t("💾 保存"), t("仅提交修改过的字段"), () => {
      const patch: Record<string, unknown> = {};
      const unsetPaths: string[][] = [];
      const secretOps: { ref: string; value?: string; unset?: boolean }[] = [];
      for (const draft of drafts.values()) {
        if (draft.secretUnset && draft.secretRef) {
          secretOps.push({ ref: draft.secretRef, unset: true });
          continue;
        }
        if (draft.secretValue !== undefined && draft.secretValue !== "") {
          const ref = resolveSecretRef(draft.path) ?? draft.secretRef;
          if (ref) {
            secretOps.push({ ref, value: draft.secretValue });
            continue;
          }
        }
        if (draft.unset) {
          unsetPaths.push(draft.path);
          continue;
        }
        if (draft.value === undefined) continue;
        // 只提交与当前值不同的字段
        const cur = readValue(draft.path);
        if (JSON.stringify(cur) === JSON.stringify(draft.value)) continue;
        let target = patch;
        for (let i = 0; i < draft.path.length - 1; i++) {
          const p = draft.path[i];
          if (typeof target[p] !== "object" || target[p] === null) target[p] = {};
          target = target[p] as Record<string, unknown>;
        }
        target[draft.path[draft.path.length - 1]] = deepClone(draft.value);
      }
      const submit = async () => {
        for (const op of secretOps) {
          if (op.unset) post({ kind: "credentialUnset", ref: op.ref });
          else post({ kind: "credentialSet", ref: op.ref, value: op.value });
        }
        if (unsetPaths.length > 0) {
          const ops = unsetPaths.map((p) => ({ op: "unset", path: p }));
          post({ kind: "settingsMutate", ns: ns.ns, ops, expectedRevision: ns.revision, requestId: nextRequestId() });
        }
        if (Object.keys(patch).length > 0) {
          post({ kind: "settingsSave", ns: ns.ns, patch, expectedRevision: ns.revision, requestId: nextRequestId() });
        }
        if (unsetPaths.length === 0 && Object.keys(patch).length === 0 && secretOps.length === 0) {
          // 无变化
        }
      };
      void submit();
    }, "mini-btn accent");
    const resetBtn = textBtn(ctx, t("↺ 重置命名空间"), t("清空该命名空间的用户层设置,恢复默认"), () => {
      void ctx.showDialog({ title: t("重置命名空间"), text: `${t("确定清除")} ${ns.ns} ${t("的全部自定义设置并恢复默认值?")}` }).then((v) => {
        if (v) post({ kind: "settingsReset", ns: ns.ns, expectedRevision: ns.revision, requestId: nextRequestId() });
      });
    }, "mini-btn");
    actions.append(saveBtn, resetBtn);
    section.append(actions);
    void secretRefs;
    return section;
  }

  function renderPresetsTab(body: HTMLElement) {
    const presets = state.presets ?? [];
    if (presets.length === 0) {
      body.append(ctx.el("div", "ws-note", t("部署未组合任何 Agent 预设,所有会话共享宿主组合。")));
      return;
    }
    for (const p of presets) {
      const row = ctx.el("div", "provider-row preset-row");
      const main = ctx.el("span", "ws-main");
      const titleLine = ctx.el("span", "ws-title");
      titleLine.textContent = p.name ?? p.id;
      main.append(titleLine);
      const badges = ctx.el("span", "ws-sub");
      const bits: string[] = [p.id];
      if (p.isDefault) bits.push(t("默认"));
      if (p.trust === "user") bits.push(t("用户预设"));
      if (p.broken) bits.push(`⚠️ ${p.broken}`);
      badges.textContent = bits.join(" · ");
      main.append(badges);
      if (p.description) {
        const d = ctx.el("span", "ws-sub");
        d.textContent = p.description.slice(0, 200);
        main.append(d);
      }
      row.append(main);
      const actions = ctx.el("span", "ws-actions");
      actions.append(
        iconBtn(ctx, ctx.ICONS.eye, t("查看组合文本"), () => {
          presetReadValue = null;
          post({ kind: "presetRead", preset: p.id, requestId: nextRequestId() });
        }, "mini-btn"),
        iconBtn(ctx, ctx.ICONS.copy, t("复制为新预设(本地作者)"), () => {
          void ctx.showDialog({ title: t("复制预设"), text: t("新预设 id(小写字母数字与连字符)"), input: true, value: `${p.id}-copy` }).then((v) => {
            if (!v) return;
            void ctx.showDialog({ title: t("复制预设"), text: t("显示名(可留空)"), input: true, value: p.name ?? "" }).then((name) => {
              post({ kind: "presetCopy", from: p.id, preset: v.trim(), name: name?.trim() || undefined });
            });
          });
        }, "mini-btn"),
      );
      if (p.trust === "user") {
        actions.append(
          iconBtn(ctx, ctx.ICONS.folder, t("打开预设目录"), () => post({ kind: "presetOpenFolder", preset: p.id }), "mini-btn"),
          iconBtn(ctx, ctx.ICONS.trash, t("删除预设"), () => {
            void ctx.showDialog({ title: t("删除预设"), text: `${t("确定删除预设")} ${p.id}?` }).then((v) => {
              if (v) post({ kind: "presetRemove", preset: p.id });
            });
          }, "mini-btn"),
        );
      }
      row.append(actions);
      body.append(row);
    }
    body.append(ctx.el("div", "ws-note", t("提示:预设组合文本是唯一编辑器。复制后通过\"打开预设目录\"在 VS Code 中编辑 cordis.yml;新会话创建时可选自定义预设。")));
  }

  function renderPresetReadResult(msg: { value: { agentPreset: string; trust: string; content: string; name?: string; description?: string } | null; error?: string }) {
    if (msg.value === null) {
      void ctx.showDialog({ title: t("读取预设失败"), text: msg.error ?? t("未知错误") });
      return;
    }
    presetReadValue = msg.value;
    const overlay = ctx.el("div", "panel-overlay");
    const sheet = ctx.el("div", "panel-sheet panel-wide");
    const head = ctx.el("div", "panel-head");
    head.append(ctx.el("span", "panel-title", `${msg.value.agentPreset} — ${t("组合")}`));
    const closeBtn = iconBtn(ctx, ctx.ICONS.x, t("关闭"), () => overlay.remove());
    closeBtn.classList.add("panel-close");
    head.append(closeBtn);
    const body = ctx.el("div", "panel-body");
    const pre = ctx.el("pre", "preset-content");
    pre.textContent = msg.value.content;
    body.append(pre);
    sheet.append(head, body);
    overlay.append(sheet);
    document.body.append(overlay);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  function updateSettingsDescribe(msg: { value: { writable: boolean; hasDocument: boolean; namespaces: PanelNamespace[] } | null; error?: string }) {
    if (msg.value === null) {
      if (settingsPanel) settingsPanel.body.innerHTML = "";
      void ctx.showDialog({ title: t("读取设置失败"), text: msg.error ?? t("未知错误") });
      return;
    }
    state.settingsDescribe = msg.value;
    if (settingsPanel && !settingsPanel.overlay.hidden) renderSettingsBody();
  }

  function settingsSaved(msg: { namespace?: PanelNamespace; error?: string }) {
    if (msg.error) {
      void ctx.showDialog({ title: t("保存失败"), text: msg.error });
      return;
    }
    if (msg.namespace && state.settingsDescribe) {
      const idx = state.settingsDescribe.namespaces.findIndex((n) => n.ns === msg.namespace!.ns);
      if (idx >= 0) state.settingsDescribe.namespaces[idx] = msg.namespace;
    }
    // 保存后重新拉取权威描述(秘密槽位/修订号随之刷新)
    post({ kind: "settingsGet", requestId: nextRequestId() });
    if (settingsPanel && !settingsPanel.overlay.hidden) renderSettingsBody();
  }

  function credentialChanged(msg: { ref: string; set: boolean }) {
    credentialCache.set(msg.ref, msg.set);
    post({ kind: "settingsGet", requestId: nextRequestId() });
    if (settingsPanel && !settingsPanel.overlay.hidden) renderSettingsBody();
  }

  function llmInfoResult(msg: { providers?: { providers: { provider: string; displayName: string; settingsNs: string; settingsPath: string[]; active: boolean; declared?: boolean }[] }; models?: { groups: { id: string; name: string; models: unknown[] }[]; failures: { id: string; name: string; message: string }[] }; error?: string }) {
    if (msg.error) {
      void ctx.showDialog({ title: t("读取模型信息失败"), text: msg.error });
      return;
    }
    llmProviders = msg.providers?.providers ?? [];
    llmModelGroups = (msg.models?.groups ?? []) as { id: string; name: string; models: { id: string; name: string; description?: string; reasoning?: unknown }[] }[];
    llmFailures = msg.models?.failures ?? [];
    if (settingsPanel && !settingsPanel.overlay.hidden) renderSettingsBody();
  }

  function discoveredModelsResult(msg: { value: { models: { id: string; name?: string; contextWindow?: number; maxTokens?: number }[] } | null; error?: string }) {
    discoverBusy = false;
    if (msg.value === null) {
      discoverError = msg.error ?? t("探测失败");
      discovered = [];
    } else {
      discoverError = "";
      discovered = msg.value.models;
    }
    if (settingsPanel && !settingsPanel.overlay.hidden) renderSettingsBody();
  }

  function presetFolderOpened(msg: { preset: string; path?: string }) {
    void msg.preset;
  }

  // ---------- 5. 子代理对话 ----------

  let subPanel: ReturnType<typeof makePanel> | undefined;
  let subChildId = "";
  let subMode: "one-shot" | "continuable" = "continuable";
  let subEvents: { event: { type: string; seq: number; time: number; data: any }; view?: unknown }[] = [];
  let subHasMore = false;
  let subLabel = "";

  function openSubagent(childId: string, mode: "one-shot" | "continuable", label?: string) {
    subChildId = childId;
    subMode = mode;
    subLabel = label ?? childId.slice(0, 12);
    subEvents = [];
    subHasMore = false;
    if (!subPanel) {
      subPanel = makePanel(ctx, t("🤖 子代理"), true);
      const interrupt = textBtn(ctx, t("⏹ 打断"), t("终止该子代理当前回合"), () => post({ kind: "subagentInterrupt", childId: subChildId }), "mini-btn");
      interrupt.classList.add("sub-interrupt");
      subPanel.headControls.append(interrupt);
      const composer = ctx.el("div", "sub-composer");
      const input = ctx.el("textarea", "sub-input") as HTMLTextAreaElement;
      input.placeholder = t("向子代理发送消息(仅 continuable)…");
      const send = textBtn(ctx, t("发送"), t("Enter 发送"), () => {
        const text = input.value.trim();
        if (!text || subMode !== "continuable") return;
        post({ kind: "subagentPrompt", childId: subChildId, text });
        input.value = "";
        const optimistic = ctx.el("div", "sub-user", text);
        subPanel?.body.append(optimistic);
        subPanel?.body.scrollTo(0, subPanel.body.scrollHeight);
      }, "mini-btn accent");
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          send.click();
        }
      });
      composer.append(input, send);
      subPanel.sheet.append(composer);
    }
    const title = subPanel.head.querySelector(".panel-title");
    if (title) title.textContent = `🤖 ${subLabel}${subMode === "continuable" ? "" : " (one-shot)"}`;
    renderSubBody();
    subPanel.overlay.hidden = false;
    post({ kind: "subagentOpen", childId, mode, requestId: nextRequestId() });
  }

  function renderSubBody() {
    if (!subPanel) return;
    const body = subPanel.body;
    body.innerHTML = "";
    if (subEvents.length === 0) {
      body.append(ctx.el("div", "ws-note", t("加载子代理记录中…")));
      return;
    }
    const nodes: { kind: string; text: string; name?: string; args?: string; done?: boolean }[] = [];
    let curAssistant: { kind: string; text: string } | null = null;
    let lastCall: { kind: string; name: string; args: string; text: string; done?: boolean } | null = null;
    for (const item of subEvents) {
      const ev = item.event;
      switch (ev.type) {
        case "user/message": {
          const blocks = ev.data?.message?.content ?? [];
          const text = blocks
            .map((b: any) => (b.type === "text" ? b.text : b.type === "image" ? "🖼️ [图片]" : `[${b.type}]`))
            .join("\n");
          nodes.push({ kind: "user", text });
          curAssistant = null;
          break;
        }
        case "assistant/chunk": {
          if (!curAssistant) {
            curAssistant = { kind: "assistant", text: "" };
            nodes.push(curAssistant);
          }
          if (ev.data?.kind === "text-delta") curAssistant.text += String(ev.data.text ?? "");
          else if (ev.data?.kind === "reasoning-delta") curAssistant.text += `\n\n💭 ${String(ev.data.text ?? "")}`;
          break;
        }
        case "assistant/message": {
          if (!curAssistant || !curAssistant.text) {
            const blocks = ev.data?.message?.content ?? [];
            const text = blocks
              .map((b: any) => (b.type === "text" ? b.text : b.type === "reasoning" ? `\n\n💭 ${String(b.text)}` : `[${b.type}]`))
              .join("\n");
            nodes.push({ kind: "assistant", text });
          }
          curAssistant = null;
          break;
        }
        case "tool/call": {
          lastCall = {
            kind: "tool",
            name: ev.data?.name ?? "",
            args: typeof ev.data?.arguments === "string" ? ev.data.arguments : JSON.stringify(ev.data?.arguments ?? {}),
            text: "",
          };
          nodes.push(lastCall);
          break;
        }
        case "tool/result": {
          if (lastCall) {
            const out = ev.data;
            lastCall.text = typeof out === "string" ? out : extractToolOutput(out);
            lastCall.done = true;
          }
          break;
        }
        case "turn/end":
          nodes.push({ kind: "sep", text: `— 回合 ${ev.data?.turn ?? ""} 结束 —` });
          break;
        default:
          break;
      }
    }
    for (const node of nodes) {
      const row = ctx.el("div", `sub-row sub-${node.kind}`);
      if (node.kind === "tool") {
        const head = ctx.el("div", "sub-tool-head", `🔧 ${node.name}`);
        head.title = node.args ?? "";
        row.append(head);
        if (node.text) {
          const out = ctx.el("div", "sub-tool-out");
          ctx.setHtml(out, "```\n" + node.text.slice(0, 4000) + "\n```");
          row.append(out);
        } else if (!node.done) {
          row.append(ctx.el("div", "sub-tool-out", t("执行中…")));
        }
      } else if (node.kind === "user") {
        const text = ctx.el("div", "sub-text");
        text.textContent = node.text;
        row.append(text);
      } else if (node.kind === "assistant") {
        const text = ctx.el("div", "sub-text");
        ctx.setHtml(text, node.text);
        row.append(text);
      } else {
        row.append(ctx.el("span", undefined, node.text));
      }
      body.append(row);
    }
    if (subHasMore) {
      const more = textBtn(ctx, t("加载更早的记录"), t("向前翻页"), () => {
        const min = Math.min(...subEvents.map((e) => e.event.seq));
        post({ kind: "subagentOpen", childId: subChildId, mode: subMode, beforeSeq: min, append: true, requestId: nextRequestId() });
      }, "mini-btn");
      body.prepend(more);
    }
    body.scrollTop = body.scrollHeight;
  }

  function extractToolOutput(out: any): string {
    if (!out) return "";
    if (typeof out === "string") return out;
    if (out.output !== undefined) return String(out.output).slice(0, 4000);
    if (out.content !== undefined) return String(out.content).slice(0, 4000);
    try {
      return JSON.stringify(out).slice(0, 4000);
    } catch {
      return String(out).slice(0, 4000);
    }
  }

  function subagentOpenResult(msg: { childId: string; events?: { event: { type: string; seq: number; time: number; data: any }; view?: unknown }[]; hasMore?: boolean; append?: boolean; error?: string }) {
    if (msg.error || !msg.events) {
      void ctx.showDialog({ title: t("读取子代理记录失败"), text: msg.error ?? t("未知错误") });
      return;
    }
    if (msg.append) {
      const known = new Set(subEvents.map((e) => e.event.seq));
      subEvents = [...msg.events.filter((e) => !known.has(e.event.seq)), ...subEvents];
    } else {
      subEvents = msg.events;
    }
    subHasMore = !!msg.hasMore;
    if (subPanel && !subPanel.overlay.hidden) renderSubBody();
  }

  return {
    openWorkspaces,
    updateWorkspaces,
    renderSearchResults,
    openJobs,
    updateJobs,
    openTrajectory,
    openSettings,
    refreshSettings,
    updateSettingsDescribe,
    settingsSaved,
    credentialChanged,
    llmInfoResult,
    discoveredModelsResult,
    renderPresetReadResult,
    presetFolderOpened,
    openSubagent,
    subagentOpenResult,
  };
}
