// 发布 0.13.59:计划模式下输入框橙黄边框。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PREV = "0.13.58";
const EN = `## 0.13.59
- **Plan mode now turns the composer border orange-yellow.** While plan mode is effective (including the brief "switching" window), the input box keeps the amber border instead of the blue focus ring — even when the textarea has focus — plus a soft matching glow, so the current turn reads as "planning only, no edits" at a glance. Driven by a \`plan-mode\` class toggled from the same effective-state calculation that renders the plan chip, so chip and border can never disagree; it reacts to both the \`plan\` projection and \`plan/mode\` events, and clears as soon as plan mode ends.
- Verified with a 7-check harness over the class lifecycle (normal, projection active, projection pending, exit, event-driven enter/exit) plus the plan chip regression, and rendered from the real bundle in the dark theme.`;

const ZH = `- **计划模式下输入框边框改为橙黄色**。计划模式生效期间(含切换中的短暂窗口)输入框保持琥珀色边框,而不是聚焦时的蓝色 —— 聚焦时同样是橙黄 —— 外加一层同色柔光,一眼就能看出"当前回合只做计划、不改文件"。由 \`plan-mode\` 类驱动,而该类与计划芯片共用同一套"有效状态"计算,所以芯片和边框不会互相矛盾;\`plan\` 投影与 \`plan/mode\` 事件都会更新,退出即恢复。
- 验证:7 项夹具覆盖类的生命周期(普通 / 投影 active / 投影 pending / 退出 / 事件进入与退出)+ 计划芯片回归,并用真实包在深色主题下渲染核对。`;

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
  const inserted = i >= 0 ? `${s.slice(0, i + marker.length)}\n${EN.trim()}\n${ZH.trim()}\n\n${s.slice(i + marker.length)}` : `${marker}\n\n${EN.trim()}\n`;
  writeFileSync(path, inserted, "utf8");
  console.log(`${f}: entry added`);
}
console.log(`released v${version}`);
