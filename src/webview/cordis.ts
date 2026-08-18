// Cordis 动态插件面板(网页端 Cordis 浮窗面板同款):
// 插件清单 + 状态 + 审批(仅允许此版本 / 允许后续版本 / 拒绝)+ 运行 / 停止 / 移除。
import { createT } from "./dicts";

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void; getState(): any; setState(state: any): void };

const vscode = acquireVsCodeApi();

// ---------- 类型 ----------

interface CordisPackageInfo {
  packageId: string;
  name: string;
  purpose: string;
  hasHostHalf: boolean;
  hasClientHalf: boolean;
}

interface CordisRunAttempt {
  pluginRunId: string;
  packageId: string;
  mode: "run" | "update";
  status: string;
  approvalRequestId?: string;
  host: { status: string; waitingFor: string[] };
  client: { status: string; waitingFor: string[] };
  error?: { phase: string; message: string };
}

interface CordisPluginRow {
  pluginId: string;
  agentId: string;
  packages: CordisPackageInfo[];
  currentPackageId?: string;
  nextPackageId?: string;
  activeRun?: { pluginRunId: string; packageId: string };
  latestRun?: CordisRunAttempt;
}

interface PanelMessage {
  kind: string;
  rows?: CordisPluginRow[];
  agentId?: string;
  notice?: { message: string; level?: string };
  lang?: string;
}

// ---------- 工具 ----------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const { t, setLang } = createT("zh-cn");

let rows: CordisPluginRow[] = [];
let currentAgentId = "";
let busy = new Set<string>();

const root = document.getElementById("app")!;

// ---------- 渲染 ----------

function statusText(status: string): string {
  switch (status) {
    case "awaiting-approval": return t("待审批");
    case "running": return t("运行中");
    case "waiting": return t("等待");
    case "starting-host": return t("启动中");
    case "client-pending": return t("Client 待激活");
    case "stopped": return t("已停止");
    case "rejected": return t("已拒绝");
    case "cancelled": return t("已取消");
    case "failed": return t("运行失败");
    default: return status;
  }
}

function statusClass(status: string): string {
  switch (status) {
    case "running": return "st-running";
    case "awaiting-approval": return "st-approval";
    case "failed": case "rejected": return "st-failed";
    case "stopped": case "cancelled": return "st-stopped";
    default: return "st-waiting";
  }
}

function post(msg: unknown) {
  vscode.postMessage(msg);
}

function refresh() {
  post({ kind: "refresh" });
}

/** 行动作按钮(带 busy 禁用)。 */
function actionBtn(pluginId: string, label: string, fn: () => void, kind = ""): HTMLButtonElement {
  const b = el("button", "cordis-btn" + (kind ? ` ${kind}` : ""), label);
  b.addEventListener("click", fn);
  const applyBusy = () => {
    b.disabled = busy.has(pluginId);
  };
  applyBusy();
  return b;
}

function renderRow(row: CordisPluginRow, isCurrentSession: boolean): HTMLElement {
  const wrap = el("div", "cordis-row");
  const latest = row.latestRun;
  const head = el("div", "cordis-row-head");
  const name = latest ? row.packages.find((p) => p.packageId === latest.packageId)?.name ?? latest.packageId : row.pluginId;
  head.append(el("span", "cordis-row-name", name));
  head.append(el("span", "cordis-row-id", row.pluginId));
  if (isCurrentSession) head.append(el("span", "cordis-row-tag", t("当前会话")));
  const status = el("span", `cordis-status ${statusClass(latest?.status ?? "idle")}`, statusText(latest?.status ?? "idle"));
  head.append(status);
  wrap.append(head);

  // 用途
  const pkg = latest ? row.packages.find((p) => p.packageId === latest.packageId) : undefined;
  const purpose = pkg?.purpose ?? row.packages[0]?.purpose ?? "";
  if (purpose) wrap.append(el("div", "cordis-row-purpose", purpose));

  // 审批动作(待审批)
  const actions = el("div", "cordis-row-actions");
  if (latest?.status === "awaiting-approval" && latest.approvalRequestId) {
    const requestId = latest.approvalRequestId;
    actions.append(
      actionBtn(row.pluginId, `✓ ${t("仅允许此版本")}`, () => {
        busy.add(row.pluginId);
        render();
        post({ kind: "approve", requestId, approveFutureVersions: false });
      }, "btn-allow"),
    );
    actions.append(
      actionBtn(row.pluginId, `✓✓ ${t("允许后续版本")}`, () => {
        busy.add(row.pluginId);
        render();
        post({ kind: "approve", requestId, approveFutureVersions: true });
      }, "btn-allow"),
    );
    actions.append(
      actionBtn(row.pluginId, t("拒绝"), () => {
        busy.add(row.pluginId);
        render();
        post({ kind: "reject", requestId });
      }, "btn-reject"),
    );
  } else {
    // 运行 / 停止(运行态)
    const active = latest && ["running", "waiting", "client-pending", "starting-host"].includes(latest.status);
    if (active) {
      actions.append(
        actionBtn(row.pluginId, t("停止"), () => {
          busy.add(row.pluginId);
          render();
          post({ kind: "stop", agentId: row.agentId, pluginId: row.pluginId });
        }, "btn-warn"),
      );
    } else if (row.currentPackageId) {
      actions.append(
        actionBtn(row.pluginId, t("运行"), () => {
          busy.add(row.pluginId);
          render();
          post({ kind: "run", agentId: row.agentId, pluginId: row.pluginId, packageId: row.currentPackageId, mode: "run" });
        }, "btn-allow"),
      );
    }
  }
  actions.append(
    actionBtn(row.pluginId, t("移除"), () => {
      // VS Code webview 不支持 window.confirm:两步确认(按钮变为「再次点击确认」,4 秒后复原)
      const btn = actions.lastElementChild as HTMLButtonElement;
      btn.textContent = t("再次点击确认移除");
      btn.classList.add("btn-confirm");
      const timer = setTimeout(() => {
        btn.textContent = t("移除");
        btn.classList.remove("btn-confirm");
      }, 4000);
      btn.onclick = () => {
        clearTimeout(timer);
        busy.add(row.pluginId);
        render();
        post({ kind: "remove", agentId: row.agentId, pluginId: row.pluginId });
      };
    }, "btn-reject"),
  );
  if (actions.children.length > 0) wrap.append(actions);

  // 版本列表(可折叠)
  const details = el("details", "cordis-packages");
  const summary = el("summary", "cordis-packages-summary");
  summary.textContent = `${t("版本")} (${row.packages.length}) · ${row.currentPackageId ? t("当前:{packageId}", { packageId: row.currentPackageId }) : ""}`;
  details.append(summary);
  const list = el("div", "cordis-package-list");
  for (const p of row.packages) {
    const item = el("div", "cordis-package" + (p.packageId === row.currentPackageId ? " pkg-current" : ""));
    item.append(el("span", "cordis-pkg-id", p.packageId));
    item.append(el("span", "cordis-pkg-name", p.name));
    const halves = [p.hasHostHalf ? t("Host") : "", p.hasClientHalf ? t("Client") : ""].filter(Boolean).join(" + ");
    if (halves) item.append(el("span", "cordis-pkg-halves", halves));
    if (p.packageId !== row.currentPackageId && (!latest || latest.status !== "awaiting-approval")) {
      const runBtn = el("button", "cordis-btn cordis-btn-mini", t("运行此版本"));
      runBtn.addEventListener("click", () => {
        busy.add(row.pluginId);
        render();
        post({ kind: "run", agentId: row.agentId, pluginId: row.pluginId, packageId: p.packageId, mode: "update" });
      });
      item.append(runBtn);
    }
    list.append(item);
  }
  details.append(list);
  wrap.append(details);

  // 失败信息
  if (latest?.error) {
    wrap.append(el("div", "cordis-error", `${latest.error.phase}: ${latest.error.message}`));
  }
  // Client 半段提示
  if (pkg?.hasClientHalf && latest && ["running", "waiting"].includes(latest.status)) {
    wrap.append(el("div", "cordis-hint", `ℹ️ ${t("Client 半段仅在网页端生效")}`));
  }
  return wrap;
}

function render() {
  root.innerHTML = "";
  const current = rows.filter((r) => r.agentId === currentAgentId);
  const others = rows.filter((r) => r.agentId !== currentAgentId);
  const running = rows.filter((r) => ["running", "waiting"].includes(r.latestRun?.status ?? "")).length;

  const header = el("div", "cordis-header");
  header.append(el("span", "cordis-title", "🧩 " + t("Cordis 插件")));
  if (running > 0) header.append(el("span", "cordis-running", t("运行中 ({n})", { n: String(running) })));
  const refreshBtn = el("button", "cordis-btn", t("刷新"));
  refreshBtn.addEventListener("click", refresh);
  header.append(refreshBtn);
  root.append(header);

  if (rows.length === 0) {
    root.append(el("div", "cordis-empty", t("还没有定义任何插件")));
    return;
  }
  if (current.length > 0) {
    root.append(el("div", "cordis-group", t("当前会话")));
    for (const row of current) root.append(renderRow(row, true));
  }
  if (others.length > 0) {
    root.append(el("div", "cordis-group", t("其他会话")));
    for (const row of others) root.append(renderRow(row, false));
  }
}

// ---------- 消息 ----------

window.addEventListener("message", (event: MessageEvent<PanelMessage>) => {
  const msg = event.data;
  if (!msg || typeof msg.kind !== "string") return;
  switch (msg.kind) {
    case "inventory": {
      rows = msg.rows ?? [];
      if (typeof msg.agentId === "string") currentAgentId = msg.agentId;
      busy.clear(); // 动作完成后清单刷新,解除行内按钮的 busy 禁用
      render();
      break;
    }
    case "notice": {
      // 简短反馈:直接显示在标题行下方
      const existing = document.querySelector(".cordis-toast");
      existing?.remove();
      const toast = el("div", "cordis-toast" + (msg.notice?.level === "error" ? " toast-error" : ""), msg.notice?.message ?? "");
      root.prepend(toast);
      setTimeout(() => toast.remove(), 6000);
      break;
    }
    case "lang": {
      if (typeof msg.lang === "string") {
        setLang(msg.lang);
        render();
      }
      break;
    }
  }
});

// 初次渲染
render();
