// 发布 0.13.73:修复 rc.1 实验性 AgentTeam 投影被误判为可切换。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PREV = "0.13.72";

const EN = `## 0.13.73
- **Fixed: the AgentTeam switch no longer appears on DSH 0.2.2-rc.1.** The rc.1 experimental AgentTeam projection is \`{ members, tasks }\` — it has no \`enabled\` field and rc.1 has no \`agentTeams/setEnabled\` endpoint (enabling the experimental plugin happens on the Web Plugins page). The extension only checked whether the projection existed, so it showed a switch whose click always failed with \`agentTeams/setEnabled ... HTTP 404\`. It now accepts only the rc.2+ projection with a boolean \`enabled\`; on rc.1 both the switch and the task board stay hidden. Upgrade the server to rc.2+ or enable the experimental plugin from the Web Plugins page on rc.1.
- **Verified**: AgentTeam regression **19/19** (including the rc.1 \`{members,tasks}\` shape hiding the switch), live rc.1 host shows that projection shape and a 404 for \`agentTeams/setEnabled\`; continuation 6/6, automation 21/21, per-session model 7/7, \`tsc --noEmit\` and the production build.`;

const ZH = `- **修复:DSH 0.2.2-rc.1 上不再错误显示 AgentTeam 开关**。rc.1 的实验性 AgentTeam 投影是 \`{ members, tasks }\`,没有 \`enabled\` 字段,rc.1 也没有 \`agentTeams/setEnabled\` 端点(启用实验性插件是在 Web 的「插件」页完成)。扩展此前只判断投影是否存在,于是显示了一个点击必然报 \`agentTeams/setEnabled ... HTTP 404\` 的开关。现在只接受带布尔 \`enabled\` 的 rc.2+ 投影;rc.1 上开关与任务板都保持隐藏。要启用请把服务器升级到 rc.2+,或在 rc.1 的 Web「插件」页开启实验性「智能体团队」。
- **验证**:AgentTeam 回归 **19/19**(含 rc.1 \`{members,tasks}\` 形状隐藏开关)、真实 rc.1 宿主确认该投影形状与 \`agentTeams/setEnabled\` 404;继续生成 6/6、自动化 21/21、每会话模型 7/7、\`tsc --noEmit\` 与生产构建通过。`;

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
