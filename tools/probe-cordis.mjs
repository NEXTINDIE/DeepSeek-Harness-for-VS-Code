// 验证 Cordis 远程链路:
// 1) host 流是否送达 cordis/* remote-event 帧(扩展 store 的输入)
// 2) 面板直接运行链路:runHostHalf(requestId=null) + settleUserRun(模拟扩展 hub.cordisRun)
// 3) 停止 / 移除(stopFromPanel / undefineFromPanel)
import WebSocket from "ws";

const BASE = "http://127.0.0.1:3080";

async function post(namespace, method, args) {
  const endpoint = `${namespace}/${method}`;
  const res = await fetch(`${BASE}/api/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "client-request", rpcId: crypto.randomUUID(), method: endpoint, payload: { args } }),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { return { transport: text }; }
  if (json.result?.ok === false) return { ok: false, error: json.result.error };
  return { ok: true, value: json.result?.value };
}

const cordisEvents = [];
const ws = new WebSocket("ws://127.0.0.1:3080/api/events.host");
ws.on("message", (data) => {
  try {
    const env = JSON.parse(data.toString());
    const f = env?.payload ?? env?.frame ?? env;
    if (f?.type === "host/remote-event" && String(f.event).startsWith("cordis/")) {
      cordisEvents.push(f);
      console.log(`[host-stream] ${f.event}`, JSON.stringify(f.args));
    }
  } catch {}
});
await new Promise((r) => ws.on("open", r));
await new Promise((r) => setTimeout(r, 400));

// 1) 清单
const inv = await post("dynamicCordisRunner", "inventory", {});
console.log("\n== inventory ==");
for (const row of inv.value ?? []) {
  const latest = row.latestRun;
  console.log(`${row.pluginId} @ ${row.agentId?.slice(0, 8)}… current=${row.currentPackageId} latest=${latest?.packageId}/${latest?.status}${latest?.approvalRequestId ? " req=" + String(latest.approvalRequestId).slice(0, 8) : ""}`);
}

// 2) 找到我们的探针 tstp-3,测试面板直接运行(重启当前包,requestId=null)
const probe = (inv.value ?? []).find((r) => r.pluginId === "tstp-3");
if (probe) {
  console.log("\n== direct run (panel restart) ==");
  const started = await post("dynamicCordisRunner", "runHostHalf", {
    agentId: probe.agentId,
    pluginId: probe.pluginId,
    packageId: probe.currentPackageId,
    mode: "run",
    requestId: null,
    approveFutureVersions: false,
  });
  console.log("runHostHalf:", JSON.stringify(started).slice(0, 400));
  if (started.ok && started.value?.status === "client-pending" && started.value.pluginRunId) {
    const settled = await post("dynamicCordisRunner", "settleUserRun", {
      agentId: probe.agentId,
      pluginId: probe.pluginId,
      resolution: { ok: true, pluginRunId: started.value.pluginRunId, waitingFor: started.value.waitingFor ?? [] },
    });
    console.log("settleUserRun:", JSON.stringify(settled).slice(0, 300));
  }
  await new Promise((r) => setTimeout(r, 400));

  // 3) 停止
  console.log("\n== stop ==");
  const stopped = await post("dynamicCordisRunner", "stopFromPanel", { agentId: probe.agentId, pluginId: probe.pluginId });
  console.log("stop:", JSON.stringify(stopped).slice(0, 200));
  await new Promise((r) => setTimeout(r, 300));

  // 4) 移除(保留插件定义,验证 undefine 链路)—— 不执行,避免删掉测试插件
  console.log("\n== undefine (skipped to keep test plugin) ==");
} else {
  console.log("probe plugin tstp-3 not found");
}

await new Promise((r) => setTimeout(r, 600));
console.log(`\ncordis remote-events received on host stream: ${cordisEvents.length}`);
ws.close();
process.exit(0);
