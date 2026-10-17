/**
 * 用 0.2.1-rc.1 宿主自己的兼容性求值器判定插件的旧/新清单。
 * 求值器语义(源码核对):evaluatePluginCompatibility(manifest, exemptions, runtimeVersion)
 *   - 全部满足 → 返回 undefined(兼容)
 *   - 有未满足项 → 返回 { requirements }(不兼容,需版本豁免)
 * 运行:node tools/test-plugin-engines.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const boot = require("./../tmp/audit/b/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js");

const evaluate = boot.evaluatePluginCompatibility;
if (typeof evaluate !== "function") {
  console.error("dsh-app-boot 未导出 evaluatePluginCompatibility,需更新本测试");
  process.exit(2);
}

const manifest = JSON.parse(fs.readFileSync(path.join("resources/dsh-git-rollback/package.json"), "utf8"));

// 旧清单:没有 engines.dsh,只有 ^0.1.0-rc.6 一类 peer 范围(发布 0.1.10 时的真实形态)
const oldManifest = {
  name: manifest.name,
  version: "0.1.10",
  peerDependencies: {
    "@deepseek-ai/cordis": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-session": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-commands": "^0.1.0-rc.6",
  },
};

/** 兼容 = 求值器返回 undefined(没有未满足项)。 */
const compatible = (result) => result === undefined;
const unmet = (result) => (result ? result.requirements : {});

const runtimes = ["0.1.7-rc.2", "0.2.0-rc.2", "0.2.1-rc.1"];
let failures = 0;
console.log(`新清单 engines.dsh = ${manifest.engines?.dsh}\n`);
for (const runtime of runtimes) {
  const before = evaluate(oldManifest, {}, runtime);
  const after = evaluate(manifest, {}, runtime);
  const oldCompatible = compatible(before);
  const newCompatible = compatible(after);
  // 旧清单在 0.2.x 上必须被判为不兼容(否则这条测试没有证明力)
  const expectOld = runtime.startsWith("0.2.");
  const pass = newCompatible && (expectOld ? !oldCompatible : oldCompatible);
  if (!pass) failures += 1;
  console.log(
    `${pass ? "PASS" : "FAIL"}  dsh ${runtime}\n` +
      `      旧清单(仅 ^0.1.0-rc.6 peer): ${oldCompatible ? "兼容" : `不兼容 ${JSON.stringify(unmet(before))}`}\n` +
      `      新清单(engines.dsh):        ${newCompatible ? "兼容" : `不兼容 ${JSON.stringify(unmet(after))}`}`,
  );
}

console.log(`\n结果: ${failures === 0 ? "全部符合预期" : `${failures} 项不符`}`);
process.exit(failures === 0 ? 0 : 1);
