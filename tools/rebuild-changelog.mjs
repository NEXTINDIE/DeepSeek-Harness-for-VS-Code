// 从 agent 变更日志重建被并行进程截断的 CHANGELOG.md(完整历史 0.12.17–0.12.85)。
import { readFileSync, writeFileSync } from "node:fs";

const agent = readFileSync(".dsh/agent/extension-changelog.md", "utf8");
// 取 "# dsh-vscode Changelog" 之后的全部条目(0.12.85 → 0.12.17 降序)
const marker = "# dsh-vscode Changelog";
const i = agent.indexOf(marker);
const entries = agent.slice(i + marker.length).trim();
const cl = `# Changelog\n\n${entries}\n`;
writeFileSync("CHANGELOG.md", cl, "utf8");
const vs = [...cl.matchAll(/## (0\.12\.\d+)/g)].map((m) => m[1]);
console.log("rebuilt CHANGELOG.md:", vs.length, "versions, head:", vs.slice(0, 3).join(", "));
