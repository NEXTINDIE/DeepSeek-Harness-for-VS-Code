// 生成 zh→EN 参考表:供新增语言翻译使用。
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("src/webview/ui.ts", "utf8");
const en = {};
const re = /^\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?$/gm;
let m;
while ((m = re.exec(src)) !== null) {
  const k = m[1].replace(/\\(.)/g, "$1");
  const v = m[2].replace(/\\(.)/g, "$1");
  if (/[\u4e00-\u9fff]/.test(k)) en[k] = v;
}
const keys = readFileSync("tools/ru-keys.txt", "utf8").split("\n").map((s) => s.replace(/\\n/g, "\n"));
const out = keys.map((k) => JSON.stringify(k) + " => " + (en[k] !== undefined ? JSON.stringify(en[k]) : "(no EN)")).join("\n");
writeFileSync("tools/ru-reference.txt", out, "utf8");
console.log("reference lines:", keys.length, "with EN:", Object.keys(en).length);
