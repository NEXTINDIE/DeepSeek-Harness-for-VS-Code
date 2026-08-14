// 列出 EN_TEXT 重复键及其值
import { readFileSync } from "node:fs";
const file = new URL("../src/webview/ui.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const src = readFileSync(file, "utf8");
const m = src.match(/const EN_TEXT[\s\S]*?= \{([\s\S]*?)\n\};/);
if (!m) { console.log("no dict"); process.exit(1); }
const re = /^\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)",?/gm;
const seen = new Map();
let mm;
while ((mm = re.exec(m[1])) !== null) {
  const k = mm[1].replace(/\\(.)/g, "$1");
  const v = mm[2].replace(/\\(.)/g, "$1");
  if (seen.has(k)) console.log(`DUP: ${JSON.stringify(k)} | first=${JSON.stringify(seen.get(k))} | again=${JSON.stringify(v)}`);
  else seen.set(k, v);
}
console.log(`total unique keys: ${seen.size}`);
