/**
 * 0.2.2-rc.2「继续生成」回归:conversationContinuation 投影 → 按钮可见 → 点击发
 * continueGeneration;运行中/无资格时隐藏。
 */
import fs from "node:fs";
import { JSDOM } from "jsdom";

const bundle = fs.readFileSync("dist/webview/ui.js", "utf8");
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

function boot({ lang = "zh-cn", continuation = 5, running = false } = {}) {
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
        sessions: [{ sessionId: "s", title: "t", running, blank: false, updatedAt: Date.now() }],
        current: "s",
        running,
        events: [],
        continuation,
      },
    }),
  );
  const d = window.document;
  return { window, document: d, sent };
}

{
  const { document, sent } = boot({ continuation: 5 });
  const area = document.querySelector(".continuation-area");
  const btn = area?.querySelector("button");
  check("有资格时显示继续生成", area && !area.hidden && btn?.textContent === "继续生成", btn?.textContent);
  btn?.click();
  check("点击发送 continueGeneration", sent.some((m) => m.kind === "continueGeneration"));
  check("点击后立即隐藏按钮", area.hidden);
}

{
  const { document } = boot({ continuation: null });
  check("无资格时隐藏", document.querySelector(".continuation-area")?.hidden === true);
}

{
  const { document } = boot({ continuation: 5, running: true });
  check("运行中隐藏", document.querySelector(".continuation-area")?.hidden === true);
}

{
  const { document } = boot({ continuation: 5, lang: "ja" });
  const label = document.querySelector(".continuation-area button")?.textContent;
  check("日语本地化", label === "生成を続ける", label);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) console.log("失败:", failed.map((f) => f.name).join("; "));
process.exit(failed.length ? 1 : 0);
