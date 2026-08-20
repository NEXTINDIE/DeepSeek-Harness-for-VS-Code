// rc.8 兼容性实测:对 rc.7 服务器验证扩展的命令载荷仍被接受(无 images 字段),
// 并模拟 rc.8 门控开启后的载荷(含 images:[])确认网关对"缺失/多余"参数的行为。
import { readFileSync } from "node:fs";

const BASE = "http://127.0.0.1:3080";

async function post(method, payload) {
  const res = await fetch(`${BASE}/api/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "client-request", rpcId: crypto.randomUUID(), method, payload }),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { transport: text }; }
}

// 1) host.describe 版本
const d = await post("host.describe", {});
console.log("server version:", d.result?.value?.version);

// 2) 创建会话,执行 /permission(无 images —— rc.7 形态)
const c = await post("session.create", { cwd: process.env.USERPROFILE + "\\dsh-rc8-probe" });
const sid = c.result?.value?.sessionId;
console.log("session:", sid);
const r1 = await post("commands/execute", { args: { agentId: sid, line: "/permission standard" } });
console.log("rc7-form {agentId,line}:", r1.result?.ok === true ? "OK" : "FAIL " + JSON.stringify(r1.result?.error), r1.result?.value ? JSON.stringify(r1.result.value).slice(0, 120) : "");

// 3) 模拟 rc.8 载荷(带 images:[])—— 在 rc.7 上应被拒绝(arguments-invalid: unexpected images)
const r2 = await post("commands/execute", { args: { agentId: sid, line: "/permission standard", images: [] } });
console.log("rc8-form {agentId,line,images:[]}:", r2.result?.ok === true ? "OK" : "FAIL " + JSON.stringify(r2.result?.error));

process.exit(0);
