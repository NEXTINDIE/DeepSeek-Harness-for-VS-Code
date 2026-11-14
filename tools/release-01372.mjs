// 发布 0.13.72:AgentTeam 共享任务板(子代理目录底部)。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PREV = "0.13.71";

const EN = `## 0.13.72
- **AgentTeam shared task board.** When AgentTeam is enabled for the current session, the subagent catalog now carries the web UI's task board at its footer: a **Shared tasks** header with a non-zero progress summary ("1 completed · 1 in progress · 1 pending"), one row per task with a status dot (pending / in progress / completed; a pending task blocked by dependencies uses the warning dot), and click-to-expand details with the description and owner (owner name, id, or "Unassigned"). A projection failure is shown as an explicit error row instead of silently hiding bad task records.
- The board is hidden when the session has no AgentTeam projection, when AgentTeam is disabled, or when the board is empty without a failure — matching the web client. It is localized in all 12 webview languages.
- **Verified**: AgentTeam regression **18/18** (toggle 7 + board 11: visibility/disable/empty/failure, progress summary, task count, blocked dot, expand details, owner, Japanese label, live projection refresh), continuation 6/6, automation 21/21, per-session model 7/7, \`tsc --noEmit\` and the production build.`;

const ZH = `- **AgentTeam 共享任务板**。当前会话开启 AgentTeam 后,子代理目录底部会显示与网页端同源的任务板:**共享任务**标题 + 只列出非零状态的进度摘要(「1 已完成 · 1 进行中 · 1 待处理」),每个任务一行并带状态点(待处理 / 进行中 / 已完成;被依赖阻塞的待处理任务使用警告色),点击展开可看描述与负责人(优先 name,其次 id,最后「未分配」)。投影记录损坏时显示明确的错误行,而不是静默隐藏。
- 无 AgentTeam 投影、已关闭团队协作、或没有任务且无错误时自动隐藏,与网页端一致;12 种界面语言均已本地化。
- **验证**:AgentTeam 回归 **18/18**(开关 7 + 任务板 11:显示/关闭/空/失败、进度摘要、任务数、阻塞点、展开详情、负责人、日语标签、投影实时刷新)、继续生成 6/6、自动化 21/21、每会话模型 7/7、\`tsc --noEmit\` 与生产构建通过。`;

const pkgPath = `${root}package.json`;
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const [a, b, c] = pkg.version.split(".").map(Number);
const version = `${a}.${b}.${c + 1}`;
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
let readme = readFileSync(`${root}README.md`, "utf8");
readme = readme.split(`Latest: ${PREV}`).join(`Latest: ${version}`).split(`最新版本:${PREV}`).join(`最新版本:${version}`);
writeFileSync(`${root}README.md`, readme, "utf8");
for (const f of ["CHANGELOG.md", ".dsh/agent/extension-changelog.md"]) {
  const path = `${root}${f}`;
  const s = readFileSync(path, "utf8");
  const marker = f === "CHANGELOG.md" ? "# Changelog\n\n" : "# dsh-vscode Changelog";
  const i = s.indexOf(marker);
  writeFileSync(path, `${s.slice(0, i + marker.length)}\n${EN.trim()}\n${ZH.trim()}\n\n${s.slice(i + marker.length)}`, "utf8");
  console.log(`${f}: entry added`);
}
console.log(`released v${version}`);
