/**
 * 0.2.2 webview 回归:宿主级自动化任务面板 + 完整会话 Markdown 导出。
 * 运行:node tools/test-schedule-tasks.mjs(先 npm run build)
 */
import fs from "node:fs";
import { JSDOM } from "jsdom";

const bundle = fs.readFileSync("dist/webview/ui.js", "utf8");

function boot() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://localhost/",
  });
  const { window } = dom;
  const sent = [];
  window.acquireVsCodeApi = () => ({ postMessage: (m) => sent.push(m), getState: () => undefined, setState: () => undefined });
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  window.eval(bundle);
  const post = (msg) => window.dispatchEvent(new window.MessageEvent("message", { data: msg }));
  const now = Date.now();
  post({
    kind: "init",
    lang: "zh-cn",
    sessions: [{ sessionId: "s", title: "test", running: false, blank: false, updatedAt: now }],
    workspaces: [],
    workspaceOrder: [],
    archivedSessionIds: [],
    current: "s",
    running: false,
    hasMore: false,
    events: [
      {
        event: { type: "turn/start", seq: 1, time: now, data: { turn: 1 } },
      },
      {
        event: { type: "user/message", seq: 2, time: now, data: { content: [{ type: "text", text: "你好" }], source: { kind: "user" } } },
      },
      {
        event: {
          type: "assistant/message",
          seq: 3,
          time: now,
          data: { turn: 1, step: 1, message: { content: [{ type: "text", text: "你好,这是回答" }], source: { provider: "deepseek", model: "m" } } },
        },
      },
    ],
  });
  return { window, document: window.document, sent, post };
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const text = (node) => (node?.textContent ?? "").trim();
const buttonByText = (root, label) => [...root.querySelectorAll("button")].find((b) => text(b) === label);

// ---------- 1. 自动化任务目录 + 状态 ----------
{
  const { window, document, sent, post } = boot();
  const entries = [
    {
      id: "t-active",
      kind: "daily",
      title: "晨间汇总",
      prompt: "汇总昨晚的提交",
      scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
      time: "09:00",
      timeZone: "Asia/Shanghai",
      sessionId: "s",
      involvedSessionIds: ["s"],
      target: { kind: "session", sessionId: "s" },
      status: "active",
      updatedAt: new Date().toISOString(),
    },
    {
      id: "t-paused",
      kind: "every",
      title: "夜间巡检",
      prompt: "巡检",
      scheduledAt: new Date(Date.now() + 7200_000).toISOString(),
      everySeconds: 3600,
      sessionId: "s",
      involvedSessionIds: ["s"],
      target: { kind: "session", sessionId: "s" },
      status: "paused",
      updatedAt: new Date().toISOString(),
    },
    {
      id: "t-ended",
      kind: "cron",
      title: "已结束任务",
      prompt: "done",
      scheduledAt: new Date(Date.now() - 3600_000).toISOString(),
      expression: "0 9 * * *",
      timeZone: "UTC",
      sessionId: "s",
      involvedSessionIds: [],
      target: { kind: "new", create: {} },
      status: "ended",
      updatedAt: new Date().toISOString(),
    },
  ];
  post({ kind: "schedule", available: true, api: "v2", entries, deliveryLimits: { newSessionIntervalSeconds: 60 } });
  document.querySelector('button[title="自动化任务"]')?.click();
  check("打开自动化任务面板", !document.querySelector(".panel-overlay")?.hidden);
  check("渲染 3 条宿主级任务", document.querySelectorAll(".sched-row").length === 3, `rows=${document.querySelectorAll(".sched-row").length}`);
  check("暂停任务有独立状态色", !!document.querySelector(".sched-paused"));
  check("v2 显示新建与清除已结束", !!buttonByText(document, "新建任务") && !!buttonByText(document, "清除已结束"));

  buttonByText(document, "新建任务")?.click();
  check("打开新建表单", !!document.querySelector(".sched-form"));
  const form = document.querySelector(".sched-form");
  const title = form?.querySelector('input.settings-input[type="text"]');
  const prompt = form?.querySelector("textarea.settings-textarea");
  if (title && prompt) {
    title.value = "新任务";
    title.dispatchEvent(new window.Event("input", { bubbles: true }));
    prompt.value = "到点提醒我";
    prompt.dispatchEvent(new window.Event("input", { bubbles: true }));
  }
  buttonByText(form, "保存")?.click();
  const create = sent.findLast((m) => m.kind === "scheduleCreate");
  check(
    "提交创建请求(默认延迟 300 秒 + 当前会话)",
    create?.request?.title === "新任务" &&
      create?.request?.prompt === "到点提醒我" &&
      create?.request?.timing?.kind === "after" &&
      create?.request?.timing?.after_seconds === 300 &&
      create?.request?.target?.kind === "session" &&
      create?.request?.target?.sessionId === "s",
    JSON.stringify(create?.request ?? null),
  );

  post({ kind: "scheduleSaved", created: true, entry: { ...entries[0], id: "t-new", title: "新任务" } });
  check("保存后关闭表单并提示", !document.querySelector(".sched-form") && document.body.textContent.includes("任务已创建"));

  const firstRow = document.querySelector(".sched-row");
  firstRow?.click();
  check("展开详情", !!document.querySelector(".sched-detail"));
  const pauseBtn = buttonByText(document.querySelector(".sched-detail"), "暂停");
  pauseBtn?.click();
  const edit = sent.findLast((m) => m.kind === "scheduleEdit");
  check(
    "暂停提交 active:false 与 CAS 版本",
    edit?.id === "t-active" && edit?.patch?.active === false && typeof edit?.expectedUpdatedAt === "string",
    JSON.stringify(edit ?? null),
  );

  post({ kind: "scheduleHistory", id: "t-active", value: { records: [{ scheduledAt: new Date().toISOString(), deliveredAt: new Date().toISOString(), messageId: "m1", prompt: "历史提示词" }] } });
  check("运行记录显示 prompt", document.body.textContent.includes("历史提示词"));
}

// ---------- 1b. 编辑 / 继续 / 立即运行 / v1 降级 ----------
{
  const { window, document, sent, post } = boot();
  const entries = [
    {
      id: "t-paused",
      kind: "every",
      title: "夜间巡检",
      prompt: "巡检",
      scheduledAt: new Date(Date.now() + 7200_000).toISOString(),
      everySeconds: 3600,
      sessionId: "s",
      involvedSessionIds: ["s"],
      target: { kind: "session", sessionId: "s" },
      status: "paused",
      updatedAt: new Date().toISOString(),
    },
  ];
  post({ kind: "schedule", available: true, api: "v2", entries });
  document.querySelector('button[title="自动化任务"]')?.click();
  document.querySelector(".sched-row")?.click();
  const detail = document.querySelector(".sched-detail");
  buttonByText(detail, "继续")?.click();
  const resume = sent.findLast((m) => m.kind === "scheduleEdit");
  check("暂停任务可继续(active:true)", resume?.patch?.active === true, JSON.stringify(resume ?? null));
  buttonByText(document.querySelector(".sched-detail"), "立即运行")?.click();
  check("立即运行发送 scheduleRun", sent.some((m) => m.kind === "scheduleRun" && m.id === "t-paused"));
  buttonByText(document.querySelector(".sched-detail"), "编辑任务")?.click();
  const form = document.querySelector(".sched-form");
  const nameInput = form?.querySelector('input.settings-input[type="text"]');
  check("编辑表单回填任务名", nameInput?.value === "夜间巡检", nameInput?.value);
  nameInput.value = "夜间巡检 2";
  nameInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  buttonByText(form, "保存")?.click();
  const edit = sent.findLast((m) => m.kind === "scheduleEdit");
  check(
    "编辑保存提交 patch(timing + CAS)",
    edit?.patch?.title === "夜间巡检 2" && edit?.patch?.timing?.kind === "every" && edit?.patch?.timing?.every_seconds === 3600 && !!edit?.expectedUpdatedAt,
    JSON.stringify(edit ?? null),
  );

  post({ kind: "scheduleSaved", id: "t-paused", entry: { ...entries[0], title: "夜间巡检 2" } });
  // 校验:清空任务名后保存不发消息
  const before = sent.length;
  buttonByText(document.querySelector(".sched-detail"), "编辑任务")?.click();
  const form2 = document.querySelector(".sched-form");
  const name2 = form2?.querySelector('input.settings-input[type="text"]');
  name2.value = "";
  name2.dispatchEvent(new window.Event("input", { bubbles: true }));
  buttonByText(form2, "保存")?.click();
  check("空任务名被拦截", sent.length === before && document.body.textContent.includes("请填写任务名称"));
}

// ---------- 1c. v1 老宿主:隐藏新建/清除,状态归一化 ----------
{
  const { document, post } = boot();
  post({
    kind: "schedule",
    available: true,
    api: "v1",
    entries: [
      {
        id: "old",
        kind: "daily",
        title: "老任务",
        prompt: "p",
        scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
        time: "09:00",
        timeZone: "Asia/Shanghai",
        sessionId: "s",
        status: "ended",
      },
    ],
  });
  document.querySelector('button[title="自动化任务"]')?.click();
  check("v1 不显示新建任务", !buttonByText(document, "新建任务"));
  check("v1 不显示清除已结束", !buttonByText(document, "清除已结束"));
  check("v1 任务行正常渲染", document.querySelectorAll(".sched-row").length === 1);
}

// ---------- 2. 完整会话 Markdown 导出 ----------
{
  const { document, sent } = boot();
  document.querySelector('button[title^="会话操作"]')?.click();
  const copyItem = buttonByText(document, "复制完整会话(Markdown)");
  check("会话菜单出现完整会话导出", !!copyItem);
  copyItem?.click();
  const copied = sent.findLast((m) => m.kind === "copyText");
  const md = copied?.text ?? "";
  check("导出含会话标题与 ID", md.startsWith("# test") && md.includes("`s`"), md.split("\n").slice(0, 4).join(" | "));
  check("导出含用户与助手正文", md.includes("## 用户") && md.includes("你好") && md.includes("## 助手") && md.includes("你好,这是回答"));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) console.log("失败:", failed.map((f) => f.name).join("; "));
process.exit(failed.length ? 1 : 0);
