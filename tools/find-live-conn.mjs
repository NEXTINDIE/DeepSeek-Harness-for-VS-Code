import { readFileSync } from "node:fs";
const s = readFileSync(process.argv[2], "utf8");
// 找 createWebConnectionRpc / fetch 调用与 URL 构造
let n = 0;
for (const token of ["call(channel", "new URL(", "fetch(", "serverResponseSchema", "method: endpoint", "client-request"]) {
  let idx = s.indexOf(token);
  while (idx !== -1 && n < 8) {
    const ctx = s.slice(Math.max(0, idx - 350), idx + 500).replace(/\s+/g, " ");
    console.log(`[${token}]`, ctx);
    console.log("---");
    n++;
    idx = s.indexOf(token, idx + 1);
  }
}
