import { readFileSync } from "node:fs";
const s = readFileSync(process.argv[2], "utf8");
let n = 0;
for (const m of s.matchAll(/startsWith\("\/"\)|unknown-command|command-error|commandRegistry|executeCommand/g)) {
  const ctx = s.slice(Math.max(0, m.index - 400), m.index + 500).replace(/\n/g, " ");
  console.log(`[${m[0]}]`, ctx);
  console.log("---");
  if (++n > 8) break;
}
