import { readFileSync } from "node:fs";
const s = readFileSync(process.argv[2], "utf8");
let n = 0;
for (const token of ["events.mux", "events.host", "api/rpc", "rpc'", "rpc\"", "api.", "downlink", "pathname", "new WebSocket", "bridge"]) {
  let idx = s.indexOf(token);
  while (idx !== -1 && n < 20) {
    const ctx = s.slice(Math.max(0, idx - 300), idx + 400).replace(/\n/g, " ");
    if (!/^.*(types|schema)/.test(s.slice(Math.max(0, idx - 2000), idx))) {
      console.log(`[${token}]`, ctx);
      console.log("---");
      n++;
    }
    idx = s.indexOf(token, idx + 1);
  }
}
