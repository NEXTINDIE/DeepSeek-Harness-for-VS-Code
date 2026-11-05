import fs from "node:fs";
import { JSDOM } from "jsdom";

const bundle = fs.readFileSync("dist/webview/ui.js", "utf8");
const langs = ["zh-tw", "ja", "ko", "de", "fr", "es", "pt", "th", "id", "tr", "ru", "ar"];
const results = [];
for (const lang of langs) {
  const dict = JSON.parse(fs.readFileSync(`src/webview/texts/${lang}.json`, "utf8"));
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', { runScripts: "outside-only", pretendToBeVisual: true, url: "https://localhost/" });
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
  const post = (msg) => window.dispatchEvent(new window.MessageEvent("message", { data: msg }));
  const now = Date.now();
  post({
    kind: "init",
    lang,
    sessions: [{ sessionId: "s", title: "demo", running: false, blank: false, updatedAt: now }],
    current: "s",
    running: false,
    events: [
      { event: { type: "user/message", seq: 1, time: now, data: { content: [{ type: "text", text: "hello" }], source: { kind: "user" } } } },
      { event: { type: "assistant/message", seq: 2, time: now, data: { turn: 1, step: 1, message: { content: [{ type: "text", text: "world" }], source: { provider: "p", model: "m" } } } } },
    ],
  });
  post({
    kind: "schedule",
    available: true,
    api: "v2",
    entries: [{ id: "t", kind: "daily", title: "daily", prompt: "p", scheduledAt: new Date(now + 3600_000).toISOString(), time: "09:00", timeZone: "UTC", sessionId: "s", involvedSessionIds: ["s"], target: { kind: "session", sessionId: "s" }, status: "paused", updatedAt: new Date(now).toISOString() }],
  });
  const d = window.document;
  const counts = {
    newTask: dict["新建任务"],
    paused: dict["暂停"],
    menu: dict["复制完整会话(Markdown)"],
  };
  d.querySelector(`button[title="${dict["自动化任务"]}"]`)?.click();
  const body = d.body.textContent ?? "";
  const panelOk = body.includes(counts.newTask);
  d.querySelector(".sched-row")?.click();
  const detailOk = (d.body.textContent ?? "").includes(dict["编辑任务"]);
  d.querySelector(`button[title^="${dict["会话操作:分叉 / 重命名 / 归档"].split(":")[0]}"]`)?.click();
  const menuOk = (d.body.textContent ?? "").includes(counts.menu);
  const menuBtn = [...d.querySelectorAll(".session-menu-item")].find((b) => b.textContent.includes(counts.menu));
  menuBtn?.click();
  const md = sent.findLast((m) => m.kind === "copyText")?.text ?? "";
  const exportOk = md.includes(dict["用户"]) && md.includes(dict["助手"]);
  results.push([lang, panelOk, detailOk, menuOk, exportOk]);
  console.log(`${lang}: panel=${panelOk} detail=${detailOk} menu=${menuOk} export=${exportOk}`);
}
const failed = results.filter((r) => r.slice(1).some((v) => !v));
console.log(`\n${results.length - failed.length}/${results.length} languages OK`);
process.exit(failed.length ? 1 : 0);
