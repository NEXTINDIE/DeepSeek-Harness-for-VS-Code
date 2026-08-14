import { readFileSync } from "node:fs";
const s = readFileSync(process.argv[2], "utf8");
let n = 0;
for (const token of ["fetch(", "/api", "WebSocket", "websocket", "connection", "rpc", "endpoint", "method:"]) {
  let idx = s.indexOf(token);
  while (idx !== -1 && n < 12) {
    const ctx = s.slice(Math.max(0, idx - 300), idx + 400).replace(/\n/g, " ");
    console.log(`[${token}]`, ctx);
    console.log("---");
    n++;
    idx = s.indexOf(token, idx + 1);
  }
}
