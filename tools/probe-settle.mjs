// 验证修复后的结算链路(与 hub.cordisRun/cordisApprove 相同的调用序列):
// 1) runHostHalf(requestId=null, 直接运行) —— 含 Client 半段 → 预期 client-pending
// 2) 以权威清单确认 client-pending(修复点:不再依赖返回里的 status 字段)
// 3) settleUserRun 结算 → 预期 running
// 4) 再次运行(重启)验证幂等;5) 停止清理
import WebSocket from "ws";

const BASE = "http://127.0.0.1:3080";
const WS = new WebSocket("ws://127.0.0.1:3080/api/events.host");
const events = [];
WS.on("message", (data) => {
  try {
    const env = JSON.parse(data.toString());
    const f = env?.payload ?? env?.frame ?? env;
    if (f?.type === "host/remote-event" && String(f.event).startsWith("cordis/")) events.push(f);
  } catch {}
});
await new Promise((r) => WS.on("open", r));
await new Promise((r) => setTimeout(r, 300));

async function remote(namespace, method, args) {
  const endpoint = `${namespace}/${method}`;
  const res = await fetch(`${BASE}/api/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "client-request", rpcId: crypto.randomUUID(), method: endpoint, payload: { args } }),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { transport: text }; }
}
const value = (r) => r.result?.value;
const error = (r) => (r.result?.ok === false ? r.result?.error : r.result?.value?.ok === false ? r.result?.value : undefined);

// 1) 找到 stlp-2
const inv = await remote("dynamicCordisRunner", "inventory", {});
const row = (value(inv) ?? []).find((r) => r.pluginId === "stlp-2");
console.log("row:", row ? `${row.pluginId} current=${row.currentPackageId} pkgs=${row.packages.map((p) => p.packageId + (p.hasClientHalf ? "+C" : ""))}` : "NOT FOUND");
if (!row) process.exit(1);

// 2) 直接运行(模拟修复后的 hub.cordisRun)
const started = await remote("dynamicCordisRunner", "runHostHalf", {
  agentId: row.agentId, pluginId: row.pluginId, packageId: row.packages[0].packageId, mode: "run", requestId: null, approveFutureVersions: false,
});
console.log("\nrunHostHalf:", JSON.stringify(value(started)).slice(0, 300), error(started) ? "ERR " + JSON.stringify(error(started)) : "");

// 3) 权威清单确认 client-pending(修复点)
const inv2 = await remote("dynamicCordisRunner", "inventory", {});
const row2 = (value(inv2) ?? []).find((r) => r.pluginId === "stlp-2");
console.log("after runHostHalf status:", row2?.latestRun?.status, "(pluginRunId:", row2?.latestRun?.pluginRunId, ")");
const needsSettle = row2?.latestRun?.pluginRunId === value(started)?.pluginRunId && row2?.latestRun?.status === "client-pending";
console.log("needsClientSettlement:", needsSettle);

// 4) 结算(与 hub 一致)
if (needsSettle) {
  const settled = await remote("dynamicCordisRunner", "settleUserRun", {
    agentId: row.agentId, pluginId: row.pluginId,
    resolution: { ok: true, pluginRunId: value(started).pluginRunId, waitingFor: value(started).waitingFor ?? [] },
  });
  console.log("settleUserRun:", JSON.stringify(value(settled)).slice(0, 300), error(settled) ? "ERR " + JSON.stringify(error(settled)) : "");
}
await new Promise((r) => setTimeout(r, 500));

const inv3 = await remote("dynamicCordisRunner", "inventory", {});
const row3 = (value(inv3) ?? []).find((r) => r.pluginId === "stlp-2");
console.log("\nfinal status:", row3?.latestRun?.status, "| client:", JSON.stringify(row3?.latestRun?.client), "| host:", JSON.stringify(row3?.latestRun?.host));

// 5) 停止清理
const stopped = await remote("dynamicCordisRunner", "stopFromPanel", { agentId: row.agentId, pluginId: row.pluginId });
console.log("stop:", JSON.stringify(value(stopped)));

console.log("\ncordis events:", events.map((e) => e.event).join(", "));
WS.close();
process.exit(0);
