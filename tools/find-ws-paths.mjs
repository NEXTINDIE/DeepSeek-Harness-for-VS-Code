import { readFileSync } from "node:fs";
const s = readFileSync(process.argv[2], "utf8");
let n = 0;
for (const m of s.matchAll(/"(?:[^"]*rpc[^"]*)"|'(?:[^']*rpc[^']*)'/g)) {
  const v = m[0];
  if (/\/(api\/)?[a-z.]*(rpc|connection|bridge|socket)[a-z.]*/.test(v)) {
    console.log(v);
    if (++n > 20) break;
  }
}
console.log("--- paths containing 'ws' route defs ---");
for (const m of s.matchAll(/(?:path|pathname|url)\s*[=:]\s*[`'"]([^`'"]+)[`'"]/g)) {
  if (/\/(api|rpc|connection)/.test(m[1])) {
    console.log(m[1]);
    if (++n > 40) break;
  }
}
