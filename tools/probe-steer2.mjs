// 综合插队探针:复现用户「运行中发送消息 → 浮窗点击插队」流程。
// 场景A:模型仍在生成时插队(应立即接受,当前回合内处理)
// 场景B:回合刚结束(turn/end)但排队项尚未被下一回合认领时插队
// 场景C:排队项已被下一回合认领(消息已转正)后对旧 id 插队(应 queue-item-not-found)
// 全程记录 queue 帧与 turn/step/user-message 事件,输出完整时间线。
import WebSocket from "ws";

const BASE = "http://127.0.0.1:3080";
const CWD = process.env.USERPROFILE + "\\dsh-steer-probe2";

async function post(method, payload) {
  const res = await fetch(`${BASE}/api/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "client-request", rpcId: crypto.randomUUID(), method, payload }),
  });
  const json = await res.json();
  if (json.result && json.result.ok === false) {
    return { ok: false, error: json.result.error };
  }
  return { ok: true, value: json.result?.value };
}

const log = [];
const frames = [];
const ws = new WebSocket("ws://127.0.0.1:3080/api/events.mux");
ws.on("message", (data) => {
  try {
    const env = JSON.parse(data.toString());
    if (env?.type !== "server-request") return;
    const f = env.payload;
    if (!f?.type?.startsWith("session/")) return;
    frames.push(f);
    const t = Date.now();
    if (f.type === "session/queue") {
      log.push(`[${t}] QUEUE items=${JSON.stringify(f.items.map((i) => ({ id: String(i.id).slice(0, 8), p: i.placement })))}`);
    } else if (f.type === "session/event" && ["turn/start", "turn/end", "step/start", "step/end", "user/message", "assistant/message"].includes(f.event?.type)) {
      const e = f.event;
      log.push(`[${t}] EVENT ${e.type} turn=${e.data?.turn ?? e.turn ?? "?"} step=${e.data?.step ?? ""}${e.type === "user/message" ? " text=" + JSON.stringify((e.data?.message?.content ?? []).map((b) => b.text ?? "").join(" ").slice(0, 40)) : ""}`);
    }
  } catch {}
});

await new Promise((r) => ws.on("open", r));
await new Promise((r) => setTimeout(r, 300));

// 1) 创建会话
const created = await post("session.create", { cwd: CWD });
if (!created.ok) { console.log("create failed", created.error); process.exit(1); }
const sessionId = created.value.sessionId;
console.log("session:", sessionId);
await new Promise((r) => setTimeout(r, 500));

const T0 = Date.now();
const ts = (ms) => `[t+${(ms - T0) / 1000}s]`;

// 2) 第一条消息(确保生成持续数秒)
await post("session.prompt", { sessionId, mode: "queue", content: [{ type: "text", text: "请用大约 800 字详细描述深海热泉生物群落,写得越详细越好" }] });
await new Promise((r) => setTimeout(r, 1500));

// 3) 第二条消息(排队)
await post("session.prompt", { sessionId, mode: "queue", content: [{ type: "text", text: "插队测试消息:现在立即回复「收到插队」四个字" }] });
await new Promise((r) => setTimeout(r, 800));

let q = frames.filter((f) => f.type === "session/queue" && f.sessionId === sessionId).pop();
let queued = q?.items?.find((i) => i.placement === "queued");
console.log(ts(Date.now()), "queued item:", queued ? String(queued.id).slice(0, 8) : "(none)");

// 场景A:立即插队(模型应仍在生成)
if (queued) {
  const rA = await post("session.updateQueue", { sessionId, itemId: queued.id, action: { kind: "steer" } });
  console.log(ts(Date.now()), "SCENARIO A steer:", rA.ok ? "ACCEPTED" : "REJECTED " + JSON.stringify(rA.error));
} else {
  console.log(ts(Date.now()), "SCENARIO A: no queued item (already consumed?)");
}

// 等待:观察插队后的事件(steered user/message 是否在当前回合被处理,或出现新回合)
await new Promise((r) => setTimeout(r, 2500));
const startCount1 = frames.filter((f) => f.type === "session/event" && f.event.type === "turn/start" && f.sessionId === sessionId).length;
console.log(ts(Date.now()), "turn/start count after A:", startCount1);
const userMsgs = frames.filter((f) => f.type === "session/event" && f.event.type === "user/message" && f.sessionId === sessionId);
console.log(ts(Date.now()), "user/message events:", userMsgs.map((f) => (f.event.data?.message?.content ?? []).map((b) => b.text ?? "").join(" ").slice(0, 30)));

// 场景B:再发一条排队消息,等到第一条回合 turn/end 后立即插队
await post("session.prompt", { sessionId, mode: "queue", content: [{ type: "text", text: "场景B测试:立刻回答 B" }] });
await new Promise((r) => setTimeout(r, 600));
q = frames.filter((f) => f.type === "session/queue" && f.sessionId === sessionId).pop();
queued = q?.items?.find((i) => i.placement === "queued");
console.log(ts(Date.now()), "B queued item:", queued ? String(queued.id).slice(0, 8) : "(none)");

// 等待 turn/end 事件出现(记录当时的排队状态)
await new Promise((r) => setTimeout(r, 1200));
const ends = frames.filter((f) => f.type === "session/event" && f.event.type === "turn/end" && f.sessionId === sessionId);
console.log(ts(Date.now()), "turn/end count so far:", ends.length);
q = frames.filter((f) => f.type === "session/queue" && f.sessionId === sessionId).pop();
const qNow = q?.items?.filter((i) => i.placement === "queued") ?? [];
console.log(ts(Date.now()), "queued items NOW:", qNow.map((i) => String(i.id).slice(0, 8)));
if (qNow.length) {
  const rB = await post("session.updateQueue", { sessionId, itemId: qNow[0].id, action: { kind: "steer" } });
  console.log(ts(Date.now()), "SCENARIO B steer (after turn/end):", rB.ok ? "ACCEPTED" : "REJECTED " + JSON.stringify(rB.error));
} else {
  console.log(ts(Date.now()), "SCENARIO B: item already consumed by next turn");
}

// 场景C:对旧 id 插队(应 queue-item-not-found)
const oldId = queued?.id;
if (oldId) {
  await new Promise((r) => setTimeout(r, 1500));
  const rC = await post("session.updateQueue", { sessionId, itemId: oldId, action: { kind: "steer" } });
  console.log(ts(Date.now()), "SCENARIO C steer (stale id):", rC.ok ? "ACCEPTED(?!)" : "REJECTED " + JSON.stringify(rC.error));
}

await new Promise((r) => setTimeout(r, 2000));
console.log("\n===== TIMELINE =====");
for (const l of log) console.log(l);

// 清理
await post("session.cancel", { sessionId });
await new Promise((r) => setTimeout(r, 300));
ws.close();
process.exit(0);
