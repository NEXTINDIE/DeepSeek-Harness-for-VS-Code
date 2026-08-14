// 检查部署中各包注册的命令名
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const files = ["dsh-permission-presets/lib/index.js", "dsh-commands/lib/index.js"];
for (const f of files) {
  const p = join(dir, f);
  if (!existsSync(p)) { console.log("MISSING", f); continue; }
  const s = readFileSync(p, "utf8");
  const names = new Set();
  for (const m of s.matchAll(/["'`](permission[A-Za-z]*|\/[a-z][\w-]*permission[A-Za-z]*)["'`]/g)) names.add(m[1]);
  // 找 command 注册调用
  for (const m of s.matchAll(/register\(\s*["'`]([\w-]+)["'`]/g)) names.add("register:" + m[1]);
  console.log(f, "->", [...names].join(", "));
}
