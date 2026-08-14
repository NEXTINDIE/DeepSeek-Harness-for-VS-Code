import { readFileSync } from "node:fs";
const s = readFileSync(process.argv[2], "utf8");
// 搜索命令名相关片段
let i = 0;
for (const token of ["permissionPresets", "\"permission\"", "command"]) {
  let idx = s.indexOf(token);
  while (idx !== -1 && i < 30) {
    const ctx = s.slice(Math.max(0, idx - 260), idx + 320).replace(/\n/g, " ");
    if (/register|command|name|alias/i.test(ctx)) {
      console.log(`[${token}]`, ctx);
      console.log("---");
      i++;
    }
    idx = s.indexOf(token, idx + 1);
  }
}
