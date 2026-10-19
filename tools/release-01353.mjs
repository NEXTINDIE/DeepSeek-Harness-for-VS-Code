// 发布 0.13.53:设置页分区改版 + DeepSeek 账号余额 + 代码块对齐网页端。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const PREV = "0.13.52";
const ENTRY_EN = `## 0.13.53
- **Settings redesigned around a left rail.** The three tabs and one long column of sections are gone: the panel now shows a vertical list of eight sections on the left (账号与余额 / 发送与输入 / 语言 / 目录兼容 / 默认权限 / 主机设置 / 模型与供应商 / Agent 预设) and renders only the selected one on the right. Same controls, far less noise; below 480px the rail flips to a wrapping row.
- **New "账号与余额" section (DeepSeek account).** Uses the host's \`account/*\` controller: when signed out it offers 登录 DeepSeek 账号 (the extension opens the authorize URL in your browser), plus 用量 / 充值 links; when signed in it shows the avatar or initial, name and contact, **balance and bonus-credit wallets** with tabular figures, and 刷新 / 用量 / 充值 / 退出登录. Hosts without the controller (pre-0.2.1) get a one-line explanation instead of dead buttons.
- **Code blocks now match the web/desktop output.** Fenced code gets a header bar with the language label (SHELL, TypeScript, JSON …; 代码块 when the fence has none) and a copy button that flashes 已复制, with the body on a monospace surface and horizontal scrolling. Assistant messages also stretch to the full transcript width (\`align-self: stretch\`), so paragraphs wrap at the panel edge and code blocks no longer shrink to their longest line — that is the "aligned with web" part of the request.
- Verified: typecheck, 677 localized keys with no missing entries, all eight UI suites; the settings panel (with a signed-in account), the account wallet row and the code block were rendered from the real bundle in both palettes.`;

const ENTRY_ZH = `- **设置页改成左侧分区导航**。原来的三个 tab + 一列到底的所有分区都没有了:面板左侧竖排八个分区(账号与余额 / 发送与输入 / 语言 / 目录兼容 / 默认权限 / 主机设置 / 模型与供应商 / Agent 预设),右侧只渲染当前分区。控件一个没少,噪音大幅下降;窄于 480px 时导航自动折成一行。
- **新增「账号与余额」分区(DeepSeek 账号)**。走宿主的 \`account/*\` 控制器:未登录时提供「登录 DeepSeek 账号」(扩展用系统浏览器打开授权页),以及「用量 / 充值」链接;已登录时显示头像或首字母、名称与联系方式、**余额与赠送额度**两块钱包(等宽数字),以及 刷新 / 用量 / 充值 / 退出登录。宿主没有该控制器(0.2.1 之前)时只显示一行说明,不留死按钮。
- **代码块对齐网页端输出**。围栏代码多了一条 header:语言标签(SHELL、TypeScript、JSON 等;没有语言时显示「代码块」)+ 复制按钮(点击后短暂显示「已复制」),正文是等宽字体、可横向滚动。同时让助手消息占满正文宽度(\`align-self: stretch\`)——段落按面板宽度换行、代码块不再缩到最长一行,这正是"对齐网页端"的关键一条。
- 验证:typecheck、677 个本地化键无缺失、八套界面夹具全过;设置页(含已登录账号)、钱包行与代码块都用真实包在深/浅两套配色下渲染核对。`;

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
  const inserted = i >= 0 ? `${s.slice(0, i + marker.length)}\n${ENTRY_EN.trim()}\n${ENTRY_ZH.trim()}\n\n${s.slice(i + marker.length)}` : `${marker}\n\n${ENTRY_EN.trim()}\n`;
  writeFileSync(path, inserted, "utf8");
  console.log(`${f}: entry added`);
}
console.log(`released v${version}`);
