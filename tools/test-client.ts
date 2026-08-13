/**
 * 集成测试:对运行中的 DSH Web 服务器验证 API 客户端全链路。
 * 运行:npx esbuild tools/test-client.ts --bundle --platform=node --format=cjs --outfile=dist/test.js && node dist/test.js
 */
import { DshApiClient } from "../src/dsh/apiClient";
import type { MuxFrame } from "../src/dsh/types";

const BASE = process.env.DSH_URL ?? "http://127.0.0.1:3080";

async function main() {
  const client = new DshApiClient(BASE);
  const results: string[] = [];
  const ok = (name: string, pass: boolean, detail = "") => {
    results.push(`${pass ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  };

  // 1. 探测
  const describe = await client.ping();
  ok("host.describe 探测", describe !== undefined, describe ? `version=${describe.version} model=${describe.model}` : "无响应");

  // 2. 会话列表
  const list = await client.listSessions();
  ok("session.list", Array.isArray(list.items), `${list.items.length} 个会话`);

  // 3. 新建会话
  const created = await client.createSession({ cwd: process.cwd() });
  const sessionId = created.sessionId;
  ok("session.create", sessionId.startsWith("session-"), sessionId);

  // 4. 事件流:先订阅,再发消息
  const events: MuxFrame[] = [];
  let subscribed = false;
  let received = 0;
  const framePromise = new Promise<string>((resolve) => {
    client.setFrameHandlers({
      onMuxFrame: (env) => {
        events.push(env.frame);
        if (env.frame.type === "session/subscribed") subscribed = true;
        if (env.frame.type === "session/event" && env.frame.sessionId === sessionId) {
          received++;
          const ev = env.frame.event;
          if (ev.type === "turn/end") resolve("turn/end");
          if (ev.type === "assistant/message") {
            const text = (ev.data?.message?.content ?? [])
              .filter((b: any) => b?.type === "text")
              .map((b: any) => b.text)
              .join("");
            if (text) resolve(text.slice(0, 60));
          }
        }
      },
      onHostFrame: () => {},
    });
  });

  await new Promise((r) => setTimeout(r, 1500));
  ok("WebSocket mux 订阅", subscribed, `已收到 ${events.length} 个帧(含 ${events.filter((f) => f.type === "session/subscribed").length} 个订阅基线)`);

  // 5. 发送消息
  const prompt = await client.sendPrompt({ sessionId, mode: "queue", content: [{ type: "text", text: "请只回复两个字母:OK" }] });
  ok("session.prompt", prompt.accepted === true);

  const outcome = await Promise.race([
    framePromise,
    new Promise<string>((_, reject) => setTimeout(() => reject(new Error("等待 turn/end 超时(90s)")), 90_000)),
  ]);
  const eventTypes = [
    ...new Set(
      events
        .filter((f) => f.type === "session/event" && f.sessionId === sessionId)
        .map((f) => (f as any).event.type as string),
    ),
  ];
  ok("收到事件流并完成回合", outcome !== "TIMEOUT", `结果="${outcome}" 事件类型=${eventTypes.join(",")} 事件数=${received}`);

  // 6. 历史
  const history = await client.sessionHistory({ sessionId });
  ok("session.history", history.events.length > 0, `${history.events.length} 条事件`);

  // 7. 清理:取消(以防还在跑)并断开
  try {
    await client.cancelSession(sessionId);
  } catch {}
  client.dispose();

  console.log("\n=== 集成测试结果 ===");
  for (const line of results) console.log(line);
  const failed = results.filter((r) => r.startsWith("❌")).length;
  console.log(failed === 0 ? "\n全部通过 🎉" : `\n${failed} 项失败`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("测试崩溃:", error);
  process.exit(1);
});
