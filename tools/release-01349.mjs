// 发布 0.13.49:工作目录芯片缩到与发送键提示同高同色。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const PREV = "0.13.48";
const ENTRY_EN = `## 0.13.49
- **The working-directory chip on the composer hint line now matches the send-shortcut pill.** Its stylesheet block had been lost during the 0.13.42 stylesheet repair (that restore took the file from the last commit, and the chip's rules were not committed yet), so the element fell back to the host's default button appearance: a filled grey pill, default 13px type and default padding — visibly heavier than the muted hint text next to it. The block is back, deliberately sharing the send pill's metrics (10px, line-height 1.4, 1px/6px padding, 1px border, transparent background, description foreground), so the two controls are the same height and the same visual weight.
- The label is now just the folder name (the folder icon and the tooltip carry the meaning); the full path stays in the tooltip and in the aria-label, and long names ellipsize at 45% width instead of pushing the hint text.
- Verified in both palettes with the real bundle and real CSS; typecheck, the i18n checks and the UI suites still pass.`;

const ENTRY_ZH = `- **输入框提示行的「工作目录」芯片改到与发送键胶囊同尺寸同观感**。它的样式块在 0.13.42 修样式表时丢了(那次 restore 取的是最后一次提交,而芯片样式当时还没提交),于是这个元素退回宿主默认按钮外观:实心灰底、默认 13px 字号、默认内边距 —— 比旁边的浅色提示文字重一大截。现在样式补回,并且刻意与发送键胶囊共用同一套尺寸(10px、行高 1.4、1px/6px 内边距、1px 边框、透明底、次要前景色),两者等高、视觉权重一致。
- 文案只显示目录名(语义交给文件夹图标与悬停说明);完整路径保留在 tooltip 与 aria-label 里,过长的名字在 45% 宽度处省略,不再把提示文字挤走。
- 深色/浅色两套配色都用真实包 + 真实 CSS 渲染验证过;typecheck、i18n 校验与界面夹具均通过。`;

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
