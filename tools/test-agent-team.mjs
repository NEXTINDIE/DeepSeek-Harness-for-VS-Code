/**
 * 0.2.2-rc.2 AgentTeam 开关回归:投影存在时显示,状态/点击/隐藏与本地化。
 */
import fs from "node:fs";
import { JSDOM } from "jsdom";

const bundle = fs.readFileSync("dist/webview/ui.js", "utf8");
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

function boot({ lang = "zh-cn", agentTeam = { enabled: false, tasks: [] } } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://localhost/",
  });
  const { window } = dom;
  const sent = [];
  window.acquireVsCodeApi = () => ({ postMessage: (m) => sent.push(m), getState: () => undefined, setState: () => undefined });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  window.eval(bundle);
  window.dispatchEvent(
    new window.MessageEvent("message", {
      data: {
        kind: "init",
        lang,
        sessions: [{ sessionId: "s", title: "t", running: false, blank: false, updatedAt: Date.now() }],
        current: "s",
        running: false,
        events: [],
        agentTeam,
        models: undefined,
      },
    }),
  );
  const d = window.document;
  d.querySelector(".model-pill-head")?.click();
  return { window, document: d, sent };
}

{
  const { document, sent } = boot({ agentTeam: { enabled: false, tasks: [] } });
  const team = document.querySelector(".mpp-team");
  const toggle = team?.querySelector(".mpp-switch");
  check("投影存在时显示开关", team && !team.hidden, team?.hidden);
  check("默认关闭", toggle?.classList.contains("on") !== true);
  toggle?.click();
  const msg = sent.findLast((m) => m.kind === "setAgentTeam");
  check("点击发送 setAgentTeam(true)", msg?.enabled === true, JSON.stringify(msg));
  check("点击后乐观打开", toggle?.classList.contains("on") === true);
}

{
  const { document } = boot({ agentTeam: { enabled: true, tasks: [] } });
  check("投影 enabled=true 时开关打开", document.querySelector(".mpp-switch")?.classList.contains("on") === true);
}

{
  const { document } = boot({ agentTeam: null });
  check("无投影(未组合插件)时隐藏", document.querySelector(".mpp-team")?.hidden === true);
}

{
  // rc.1 实验性投影 {members,tasks} 没有 enabled,也没有 setEnabled 端点:必须隐藏
  const { document } = boot({ agentTeam: { members: [{ id: "s", name: "lead", role: "lead", phase: "active" }], tasks: [] } });
  check("rc.1 旧投影(无 enabled)时隐藏", document.querySelector(".mpp-team")?.hidden === true);
}

{
  const { document } = boot({ agentTeam: { enabled: false, tasks: [] }, lang: "ja" });
  const label = document.querySelector(".mpp-team-label")?.textContent;
  check("日语本地化", label === "エージェントチームの連携を有効にする", label);
}

// ── 共享任务板(子代理目录底部) ───────────────────────────────────────────────
const boardTasks = [
  {
    id: "t1",
    revision: 1,
    subject: "设计数据模型",
    description: "确定字段与索引",
    status: "completed",
    blockedBy: [],
    writeScopes: ["src/data"],
    ownerName: "alice",
    ready: true,
    writeScopeWarnings: [],
  },
  {
    id: "t2",
    revision: 1,
    subject: "实现接口",
    description: "按设计实现 REST 接口",
    status: "in_progress",
    blockedBy: [],
    writeScopes: ["src/api"],
    ownerName: "bob",
    ready: true,
    writeScopeWarnings: [],
  },
  {
    id: "t3",
    revision: 1,
    subject: "联调",
    description: "等待接口完成",
    status: "pending",
    blockedBy: ["t2"],
    writeScopes: [],
    ready: false,
    writeScopeWarnings: [],
  },
];

{
  const { document } = boot({ agentTeam: { enabled: true, tasks: boardTasks } });
  document.querySelector('button[title="子代理目录"]')?.click();
  const board = document.querySelector(".team-board");
  check("开启且有任务时显示任务板", !!board);
  check("进度摘要", board?.textContent.includes("1 已完成 · 1 进行中 · 1 待处理"), board?.querySelector(".team-board-progress")?.textContent);
  const rows = board?.querySelectorAll(".team-board-row") ?? [];
  check("渲染全部任务", rows.length === 3, `rows=${rows.length}`);
  check("阻塞任务使用 warning 点", !!board?.querySelector(".team-board-task[data-status=pending] .team-dot.blocked"));
  rows[0]?.click();
  check("点击展开任务详情", board?.querySelector(".team-board-details")?.hidden === false);
  check("详情显示负责人", board?.textContent.includes("alice"));
}

{
  const { document } = boot({ agentTeam: { enabled: false, tasks: boardTasks } });
  document.querySelector('button[title="子代理目录"]')?.click();
  check("关闭时不显示任务板", !document.querySelector(".team-board"));
}

{
  const { document } = boot({ agentTeam: { enabled: true, tasks: [], failure: "bad record" } });
  document.querySelector('button[title="子代理目录"]')?.click();
  check("投影失败时显示错误", document.querySelector(".team-board-failure")?.textContent.includes("bad record"));
}

{
  const { document } = boot({ agentTeam: { enabled: true, tasks: boardTasks }, lang: "ja" });
  document.querySelector('button[title="サブエージェントカタログ"]')?.click();
  check("任务板日语标签", document.querySelector(".team-board-title")?.textContent === "共有タスク");
}

{
  const { window, document } = boot({ agentTeam: { enabled: true, tasks: boardTasks } });
  document.querySelector('button[title="子代理目录"]')?.click();
  const extra = {
    id: "t4",
    revision: 1,
    subject: "补充测试",
    description: "新增任务",
    status: "pending",
    blockedBy: [],
    writeScopes: [],
    ready: true,
    writeScopeWarnings: [],
  };
  window.dispatchEvent(
    new window.MessageEvent("message", {
      data: { kind: "agentTeam", sessionId: "s", value: { enabled: true, tasks: [...boardTasks, extra] } },
    }),
  );
  check("投影更新时原位刷新任务板", document.querySelectorAll(".team-board-row").length === 4, `rows=${document.querySelectorAll(".team-board-row").length}`);
  check("刷新后进度摘要同步", document.querySelector(".team-board-progress")?.textContent.includes("2 待处理"), document.querySelector(".team-board-progress")?.textContent);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) console.log("失败:", failed.map((f) => f.name).join("; "));
process.exit(failed.length ? 1 : 0);
