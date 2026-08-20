// 把 0.12.83 / 0.12.84 条目从 agent 变更日志恢复到 CHANGELOG.md(并行进程覆盖导致丢失)。
import { readFileSync, writeFileSync } from "node:fs";

const agent = readFileSync(".dsh/agent/extension-changelog.md", "utf8");
const get = (v) => {
  const i = agent.indexOf("## " + v);
  if (i < 0) return null;
  const rest = agent.slice(i + ("## " + v).length);
  const m = rest.match(/\n## /);
  const end = m ? i + ("## " + v).length + m.index : agent.length;
  return agent.slice(i, end);
};

let cl = readFileSync("CHANGELOG.md", "utf8");
for (const v of ["0.12.84", "0.12.83"]) {
  if (cl.includes("## " + v)) continue;
  const e = get(v);
  if (!e) {
    console.log(v + ": no entry in agent changelog");
    continue;
  }
  const pos = cl.indexOf("## 0.12.82");
  cl = cl.slice(0, pos) + e.trim() + "\n\n" + cl.slice(pos);
  console.log(v + ": restored");
}
writeFileSync("CHANGELOG.md", cl, "utf8");
