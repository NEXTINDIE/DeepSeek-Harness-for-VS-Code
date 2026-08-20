// 修正 0.12.84 变更日志条目(shell 引号转义导致截断)。
import { readFileSync, writeFileSync } from "node:fs";

const EN = `## 0.12.84
- @ mention menu now matches the web (rc.8): typing @ opens a grouped picker (Agents / Files & folders / Session conversations) navigable with ↑↓/Enter/Esc: ① file/folder candidates come from the server's fileReferences/list (relative to the session cwd); picking inserts @path (@"quoted" form for paths with spaces; directories keep the trailing slash and stay open to descend, matching the web grammar); ② session candidates come from sessionReferenceResolver/candidates; picking inserts the @[label](dsh-session:…) Markdown mention, which the host pre-step expands into read-only snapshot context on send (no local handling needed); ③ agent mentions keep the original local scan-and-inject behavior; ④ the @ trigger grammar is broadened to the web's (any non-space token plus @"quoted paths"), and the agent-config scan no longer requires a selected session, fixing the empty @ menu; ⑤ fixed the root cause of the missing 'low' reasoning effort: the server was shadowed by the stale direct install (~/.dsh-vscode/server, rc.6) — a new dsh.updateServer command force-reinstalls @deepseek-ai/dsh@latest and restarts, and the UI auto-refreshes model data after the server reconnects.
- @ 提及菜单对齐网页版 rc.8:输入 @ 弹出分组候选列表(智能体 / 文件与文件夹 / Session 对话),支持 ↑↓/Enter/Esc 选择:① 文件与文件夹候选来自服务器 fileReferences/list(相对会话工作目录),选中插入 @路径(含空格的路径用 @"引号" 形式;目录保持尾部斜杠并继续输入下一级,与网页端 grammar 一致);② Session 候选来自 sessionReferenceResolver/candidates,选中插入 @[标题](dsh-session:…) Markdown 提及,发送后由宿主 pre-step 展开为只读会话快照上下文(无需本地处理);③ 智能体候选保持原有本地扫描与注入逻辑;④ 提及触发语法放宽为网页端同款(支持 @任意字符 与 @"带空格路径"),并修复此前仅在已选会话时才扫描智能体目录导致 @ 无候选的问题;⑤ 修复「思考强度 low 缺失」的根源:服务器被 ~/.dsh-vscode/server 的旧版直接安装(rc.6)遮蔽 —— 新增 dsh.updateServer 命令(强制重装 @deepseek-ai/dsh@latest 并重启),服务器重连后自动重推界面数据刷新模型下拉。`;

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const clPath = `${root}CHANGELOG.md`;
const agentPath = `${root}.dsh/agent/extension-changelog.md`;

// 替换 CHANGELOG.md 中 0.12.84 条目(从 ## 0.12.84 到下一个 ## )
const cl = readFileSync(clPath, "utf8");
const start = cl.indexOf("## 0.12.84");
if (start >= 0) {
  const next = cl.indexOf("\n## ", start + 10);
  const end = next >= 0 ? next : cl.length;
  const fixed = cl.slice(0, start) + EN + "\n" + cl.slice(end);
  writeFileSync(clPath, fixed, "utf8");
  console.log("CHANGELOG.md 0.12.84 entry fixed");
} else {
  console.log("0.12.84 not found in CHANGELOG.md");
}

// 替换 agent 变更日志中 0.12.84 条目
const ag = readFileSync(agentPath, "utf8");
const astart = ag.indexOf("## 0.12.84");
if (astart >= 0) {
  const anext = ag.indexOf("\n## ", astart + 10);
  const aend = anext >= 0 ? anext : ag.length;
  writeFileSync(agentPath, ag.slice(0, astart) + EN + "\n" + ag.slice(aend), "utf8");
  console.log("agent changelog 0.12.84 entry fixed");
} else {
  console.log("0.12.84 not found in agent changelog");
}
