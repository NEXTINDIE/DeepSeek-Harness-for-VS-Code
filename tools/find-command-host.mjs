import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(process.argv[2], "@deepseek-ai");
const hits = new Map();
function walk(dir, depth) {
  if (depth > 3) return;
  let entries = [];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const p = join(dir, name);
    try {
      if (statSync(p).isDirectory()) { walk(p, depth + 1); continue; }
    } catch { continue; }
    if (!/\.(js|mjs)$/.test(name)) continue;
    let s;
    try { s = readFileSync(p, "utf8"); } catch { continue; }
    if (!/unknown-command/.test(s)) continue;
    for (const m of s.matchAll(/unknown-command/g)) {
      const ctx = s.slice(Math.max(0, m.index - 300), m.index + 400).replace(/\n/g, " ");
      hits.set(p.replace(root, ""), ctx);
    }
  }
}
walk(root, 0);
for (const [f, ctx] of hits) {
  console.log("FILE:", f);
  console.log(ctx);
  console.log("===");
}
