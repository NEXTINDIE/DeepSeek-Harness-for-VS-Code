// 复现探针:在实时服务器上验证「排队消息 → 插队(steer)」链路。
// 1) 创建会话 2) 发送第一条消息(agent 开始运行)3) 发送第二条(排队) 4) 捕获 session/queue 帧 5) 调 session.updateQueue(steer) 打印结果。
import WebSocket from "ws";

const BASE = "http://127.0.0.1:3080";
const CWD = process.env.USERPROFILE + "\\dsh-steer-probe";

async function post(method, payload) {
  const res = await fetch(`${BASE}/api/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "client-request", rpcId: crypto.randomUUID(), method, payload }),
  });
  const json = await res.json();
  if (json.result && json.result.ok === false) {
    console.log(`[${method}] ERROR:`, JSON.stringify(json.result.error));
    return { ok: false, error: json.result.error };
  }
  return { ok: true, value: json.result?.value };
}

const frames = [];
const ws = new WebSocket("ws://127.0.0.1:3080/api/events.mux");
ws.on("message", (data) => {
  try {
    const env = JSON.parse(data.toString());
    if (env?.type !== "server-request") return;
    const f = env.payload;
    if (f?.type === "session/queue" || f?.type === "session/event" && f.event?.type === "turn/start" || f?.type === "session/event" && f.event?.type === "turn/end") {
      frames.push(f);
    }
  } catch {}
});

await new Promise((r) => ws.on("open", r));
await new Promise((r) => setTimeout(r, 300));

// 1) 创建会话
const created = await post("session.create", { cwd: CWD });
if (!created.ok) process.exit(1);
const sessionId = created.value.sessionId;
console.log("session:", sessionId);
await new Promise((r) => setTimeout(r, 500));

// 2) 第一条消息(agent 开始运行,任务较长确保仍在运行)
await post("session.prompt", { sessionId, mode: "queue", content: [{ type: "text", text: "请用大约 200 字详细描述深海生物圈,不要结束" }] });
await new Promise((r) => setTimeout(r, 1200));

// 3) 第二条消息(排队)
await post("session.prompt", { sessionId, mode: "queue", content: [{ type: "text", text: "插队测试:立即回复我这条" }] });
await new Promise((r) => setTimeout(r, 1000));

// 4) 捕获 queue 帧找排队项
const q = frames.filter((f) => f.type === "session/queue" && f.sessionId === sessionId).pop();
console.log("queue frame:", q ? JSON.stringify(q.items.map((i) => ({ id: i.id, placement: i.placement }))) : "(none)");
const queued = q?.items?.find((i) => i.placement === "queued");

// 5) 插队
if (queued) {
  const res = await post("session.updateQueue", { sessionId, itemId: queued.id, action: { kind: "steer" } });
  console.log("steer result:", res.ok ? "ACCEPTED" : "REJECTED", res.error ?? "");
  await new Promise((r) => setTimeout(r, 1500));
  const turns = frames.filter((f) => f.type === "session/event" && f.event.type === "turn/start" && f.sessionId === sessionId);
  console.log("turn/start count:", turns.length);
} else {
  console.log("no queued item found");
}

// 清理:取消会话(不归档,保留记录供检查)
await post("session.cancel", { sessionId });
await new Promise((r) => setTimeout(r, 300));
ws.close();
process.exit(0);
