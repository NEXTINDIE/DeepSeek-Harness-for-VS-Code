/**
 * 每会话模型/思考深度回归测试。
 *
 * 背景:session/modelCatalog 只返回部署默认值,每个会话自己的选择在 modelSelection
 * 投影里(next / lastUsed)。旧实现把 catalog.default 当成 current,切换会话后所有
 * 会话都显示成同一个模型/思考深度。
 *
 * 运行:node tools/test-session-model.mjs
 */
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

mkdirSync("tmp", { recursive: true });
await build({
  entryPoints: ["src/dsh/hub.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: "tmp/hub-session-model-test.cjs",
  external: ["ws"],
  logLevel: "warning",
});
const require = createRequire(import.meta.url);
const { DshHub } = require("../tmp/hub-session-model-test.cjs");

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function makeHub() {
  const hub = new DshHub({ url: "http://127.0.0.1:1", command: "dsh", autoStart: false, autoStartTimeoutSec: 1 });
  hub.client.sessionModels = async () => ({
    current: { provider: "deepseek", model: "default-model", reasoningEffort: "low" },
    routable: true,
    groups: [],
    failures: [],
  });
  return hub;
}

// 1. next 优先:会话显式选择 max
{
  const hub = makeHub();
  hub.client.sessionProjections = async () => ({
    asOfSeq: 1,
    values: { modelSelection: { lastUsed: null, next: { provider: "deepseek", model: "flash", reasoningEffort: "max" } } },
  });
  const value = await hub.getSessionModels("s1");
  check(
    "modelSelection.next 覆盖部署默认值",
    value.current.provider === "deepseek" && value.current.model === "flash" && value.current.reasoningEffort === "max",
    JSON.stringify(value.current),
  );
}

// 2. next 为空时回退 lastUsed
{
  const hub = makeHub();
  hub.client.sessionProjections = async () => ({
    asOfSeq: 2,
    values: { modelSelection: { lastUsed: { provider: "deepseek", model: "pro", reasoningEffort: "high" }, next: null } },
  });
  const value = await hub.getSessionModels("s2");
  check("next=null 时回退 lastUsed", value.current.model === "pro" && value.current.reasoningEffort === "high", JSON.stringify(value.current));
}

// 3. 没有投影(新会话 / 老宿主)回退 catalog.default
{
  const hub = makeHub();
  hub.client.sessionProjections = async () => null;
  const value = await hub.getSessionModels("s3");
  check(
    "无投影回退 catalog.default",
    value.current.model === "default-model" && value.current.reasoningEffort === "low",
    JSON.stringify(value.current),
  );
}

// 4. 投影端点失败也不影响目录
{
  const hub = makeHub();
  hub.client.sessionProjections = async () => {
    throw new Error("method-unavailable");
  };
  const value = await hub.getSessionModels("s4");
  check("投影失败回退 catalog.default", value.current.model === "default-model", JSON.stringify(value.current));
}

// 5. 状态栏随会话切换,并清掉不属于该会话的 effort
{
  const hub = makeHub();
  hub.client.sessionProjections = async () => ({
    asOfSeq: 5,
    values: { modelSelection: { lastUsed: null, next: { provider: "deepseek", model: "flash", reasoningEffort: "off" } } },
  });
  await hub.updateCurrentModel("s5");
  check(
    "updateCurrentModel 同步 provider/model/effort",
    hub.status.model === "flash" && hub.status.provider === "deepseek" && hub.status.reasoningEffort === "off",
    JSON.stringify({ model: hub.status.model, provider: hub.status.provider, effort: hub.status.reasoningEffort }),
  );

  hub.client.sessionProjections = async () => ({
    asOfSeq: 6,
    values: { modelSelection: { lastUsed: null, next: { provider: "deepseek", model: "no-reasoning" } } },
  });
  await hub.updateCurrentModel("s6");
  check(
    "切到无推理模型时 effort 被清空",
    hub.status.model === "no-reasoning" && hub.status.reasoningEffort === undefined,
    JSON.stringify({ model: hub.status.model, effort: hub.status.reasoningEffort }),
  );

  hub.applyLocalModelSelection("s6", "deepseek", "no-reasoning", undefined);
  check("applyLocalModelSelection(undefined) 清空旧 effort", hub.status.reasoningEffort === undefined, String(hub.status.reasoningEffort));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) console.log("失败:", failed.map((f) => f.name).join("; "));
process.exit(failed.length ? 1 : 0);
