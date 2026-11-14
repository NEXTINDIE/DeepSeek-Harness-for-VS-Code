// 发布 0.13.71:模型菜单 AgentTeam 开关 + 登录等待态修正。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PREV = "0.13.70";

const EN = `## 0.13.71
- **AgentTeam toggle now matches the web UI.** The model popover has the same **Enable agent team collaboration** switch as the web model menu. It is shown only when the host exposes the \`agentTeam\` projection, takes its state from that projection, and toggles the current session through \`agentTeams/setEnabled\`. A failed toggle rolls back and shows a localized notice; the switch is hidden when the deployment does not compose the AgentTeam plugin. It is localized in all 12 webview languages.
- **Sign-in no longer reports "cancelled" while the browser page is still being prepared.** \`account/startSignIn\` may return only \`initializing\`; the extension now shows a "preparing the sign-in page" toast, opens the browser when the \`authorizeUrl\` arrives through \`account/watch\`, and opens each attempt at most once.
- **Verified**: AgentTeam toggle 7/7 (visible/hidden, projection state, click, optimistic update, Japanese label); continuation 6/6; live 0.2.2-rc.3 6/6; 0.2.1 fallback 3/3; automation 21/21; per-session model 7/7; \`tsc --noEmit\` and the production build.`;

const ZH = `- **模型菜单里的 AgentTeam 开关现在与网页端一致**。模型弹层提供同款**启用智能体团队协作**开关:仅当宿主暴露 \`agentTeam\` 投影时显示,状态取自投影,切换通过 \`agentTeams/setEnabled\` 作用于当前会话;切换失败会回滚并给出本地化提示;宿主未组合 AgentTeam 插件时自动隐藏。12 种界面语言均已本地化。
- **登录页还在准备时不再误报「已取消」**。\`account/startSignIn\` 可能只返回 \`initializing\`;扩展现在提示「正在准备登录页」,等 \`account/watch\` 带来 \`authorizeUrl\` 后再打开浏览器,同一 attempt 只打开一次。
- **验证**:AgentTeam 开关 7/7(显示/隐藏、投影状态、点击、乐观更新、日语标签);继续生成 6/6;真实 0.2.2-rc.3 6/6;0.2.1 回退 3/3;自动化 21/21;每会话模型 7/7;\`tsc --noEmit\` 与生产构建通过。`;

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
