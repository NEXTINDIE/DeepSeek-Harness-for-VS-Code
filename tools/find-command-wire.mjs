import { readFileSync } from "node:fs";
const s = readFileSync(process.argv[2], "utf8");
let n = 0;
for (const m of s.matchAll(/\.command\s*=|command\s*\(/g)) {
  const ctx = s.slice(Math.max(0, m.index - 500), m.index + 600).replace(/\n/g, " ");
  console.log(ctx);
  console.log("---");
  if (++n > 4) break;
}
// 找 typertRemote 的 endpoint 注册
for (const m of s.matchAll(/namespace:\s*"([^"]+)"[\s\S]{0,200}?command/g)) {
  console.log("[ns]", m[0].slice(0, 300).replace(/\n/g, " "));
  if (++n > 10) break;
}
