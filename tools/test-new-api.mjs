// 验证 v0.6.0 新增 API:session.models(含思考深度)、agentPreset.list、session.list 的 goal 投影
const BASE = "http://127.0.0.1:3080";
const post = async (method, payload) => {
  const body = { type: "client-request", rpcId: crypto.randomUUID(), method, payload };
  const r = await fetch(`${BASE}/api/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json();
  if (!j.result.ok) throw new Error(`${method}: ${j.result.error.code} ${j.result.error.message}`);
  return j.result.value;
};

const run = async () => {
  const list = await post("session.list", {});
  const target = list.items.find((i) => !i.blank) ?? list.items[0];
  console.log("目标会话:", target?.sessionId, "preset:", target?.agentPreset);
  console.log("goal 投影:", JSON.stringify(target?.projections?.values?.goal ?? null).slice(0, 300));

  if (target) {
    const models = await post("session.models", { sessionId: target.sessionId });
    console.log("当前模型:", JSON.stringify(models.current));
    for (const g of models.groups) {
      for (const m of g.models) {
        console.log(`- ${g.id} / ${m.id}: efforts=${JSON.stringify(m.reasoning?.efforts?.map((e) => e.id))} default=${m.reasoning?.defaultEffort ?? "-"}`);
      }
    }
  }

  const presets = await post("agentPreset.list", {});
  console.log("预设:", JSON.stringify(presets.presets.map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault }))));
};
run().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
