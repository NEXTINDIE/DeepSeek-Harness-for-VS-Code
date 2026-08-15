// 验证 ru 词典覆盖并跑类型检查。
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ui = readFileSync("src/webview/ui.ts", "utf8");
const re = /^\s*"((?:[^"\\]|\\.)*)"\s*:/gm;
const zh = new Set();
let m;
while ((m = re.exec(ui)) !== null) {
  const k = m[1].replace(/\\(.)/g, "$1");
  if (/[\u4e00-\u9fff]/.test(k)) zh.add(k);
}
const ru = JSON.parse(readFileSync("src/webview/texts/ru.json", "utf8"));
console.log("ru texts missing:", [...zh].filter((k) => ru[k] === undefined).length);
const en = JSON.parse(readFileSync("l10n/bundle.l10n.json", "utf8").replace(/^\uFEFF/, ""));
const rub = JSON.parse(readFileSync("l10n/bundle.l10n.ru.json", "utf8"));
console.log("ru bundle missing:", Object.keys(en).filter((k) => rub[k] === undefined).length);
const nen = JSON.parse(readFileSync("package.nls.json", "utf8").replace(/^\uFEFF/, ""));
const rn = JSON.parse(readFileSync("package.nls.ru.json", "utf8"));
console.log("ru nls missing:", Object.keys(nen).filter((k) => rn[k] === undefined).length);

try {
  execFileSync(process.execPath, ["./node_modules/typescript/bin/tsc", "--noEmit"], { stdio: "inherit" });
  console.log("TSC OK");
} catch {
  process.exit(1);
}
