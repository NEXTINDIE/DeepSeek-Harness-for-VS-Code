// 端到端审批复现:新会话(无自动授权)让模型定义并运行一个 Cordis 插件 → 触发真实
// awaiting-approval → 用扩展同款序列(cordisApprove)授权 → 验证清单状态与 request-run-resolved 帧。
import WebSocket from "ws";

const BASE = "http://127.0.0.1:3080";
const CWD = process.env.USERPROFILE + "\\dsh-cordis-approve-probe";

async function post(method, payload, envelope = true) {
  const res = await fetch(`${BASE}/api/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(envelope ? { type: "client-request", rpcId: crypto.randomUUID(), method, payload } : payload),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { transport: text }; }
}

const events = [];
const ws = new WebSocket("ws://127.0.0.1:3080/api/events.host");
ws.on("message", (data) => {
  try {
    const env = JSON.parse(data.toString());
    const f = env?.payload ?? env?.frame ?? env;
    if (f?.type === "host/remote-event" && String(f.event).startsWith("cordis/")) {
      events.push(f);
      console.log(`[host] ${f.event}`, JSON.stringify(f.args).slice(0, 400));
    }
  } catch {}
});
await new Promise((r) => ws.on("open", r));
await new Promise((r) => setTimeout(r, 400));

// 1) 创建新会话(独立于本会话,无自动授权)
const created = await post("session.create", { cwd: CWD });
const sessionId = created.result?.value?.sessionId;
console.log("session:", sessionId);
await new Promise((r) => setTimeout(r, 600));

// 2) 让模型定义并运行一个最小插件(host 半段,不做任何事)
console.log("\n-- prompting model to define+run a cordis plugin --");
await post("session.prompt", { sessionId, mode: "queue", content: [{ type: "text", text: "请调用工具 cordis_define 定义一个新 Cordis 插件(idPrefix 用 tsta,host 代码返回 { apply(ctx) {} },name 为 approve-probe,purpose 为 审批链路测试),然后调用 cordis_run 运行它(pluginId 与 packageId 用返回的 id,mode 用 run)。运行完成后就停下来,不要再做任何事。" }] });

// 3) 等待审批请求帧
let request;
const deadline = Date.now() + 90000;
while (Date.now() < deadline && !request) {
  const found = events.find((e) => e.event === "cordis/request-run" && e.args?.[0]?.agentId === sessionId);
  if (found) request = found.args[0];
  if (!request) await new Promise((r) => setTimeout(r, 1000));
}
if (!request) {
  console.log("NO cordis/request-run frame within 90s");
  // 打印已见帧与清单,便于诊断
  const inv = await post("dynamicCordisRunner", "inventory", { args: {} }, false);
  console.log("inventory:", JSON.stringify(inv).slice(0, 1200));
  ws.close();
  process.exit(1);
}
console.log("\n== approval request ==");
console.log(JSON.stringify(request, null, 1));

// 4) 模拟扩展 hub.cordisApprove(request, false):
//    runHostHalf(agentId, pluginId, packageId, mode, requestId, approveFutureVersions)
const started = await post("dynamicCordisRunner", "runHostHalf", {
  args: {
    agentId: request.agentId,
    pluginId: request.pluginId,
    packageId: request.packageId,
    mode: request.mode,
    requestId: request.requestId,
    approveFutureVersions: false,
  },
}, false);
console.log("\n== runHostHalf(approve) ==");
console.log(JSON.stringify(started).slice(0, 500));
if (!started.result?.ok || !started.result?.value?.ok) {
  console.log("runHostHalf FAILED:", JSON.stringify(started));
  ws.close();
  process.exit(1);
}
const startedValue = started.result.value;

// 5) 若 client-pending(有 Client 半段),结算 resolveRequestRun —— 与扩展一致
if (startedValue.status === "client-pending") {
  const resolved = await post("dynamicCordisRunner", "resolveRequestRun", {
    args: {
      requestId: request.requestId,
      resolution: { ok: true, pluginRunId: startedValue.pluginRunId, waitingFor: startedValue.waitingFor ?? [] },
    },
  }, false);
  console.log("\n== resolveRequestRun ==");
  console.log(JSON.stringify(resolved).slice(0, 300));
}

await new Promise((r) => setTimeout(r, 1500));

// 6) 验证清单状态
const inv = await post("dynamicCordisRunner", "inventory", { args: {} }, false);
const row = (inv.result?.value ?? []).find((r) => r.pluginId === request.pluginId);
console.log("\n== final inventory row ==");
console.log(JSON.stringify(row?.latestRun ?? row, null, 1));

// 7) 汇总事件
console.log("\n== cordis events ==");
for (const e of events) console.log(e.event, JSON.stringify(e.args).slice(0, 200));

ws.close();
process.exit(0);
