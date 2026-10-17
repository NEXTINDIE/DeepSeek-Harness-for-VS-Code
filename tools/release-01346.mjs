// 发布 0.13.46:子代理目录的刷新改为文字按钮。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const PREV = "0.13.45";
const ENTRY_EN = `## 0.13.46
- The 子代理目录 (subagent catalog) popover's refresh control is now the **word 刷新** instead of the 🔄 emoji. The emoji rendered as a blue rounded square on Windows and read as an unrelated icon; the text keeps the same job with no font-dependency, sits on the same line as the title as a small pill (input background + widget border, theme hover/focus), and keeps a descriptive tooltip ("重新读取子代理目录") rather than repeating its own label.
- The popover header got a little more breathing room (6px vertical padding) so the pill is no longer cramped against the top edge.
- Verified by rendering the real bundle + real CSS in headless Chromium in both palettes; the new tooltip string is localized in 14 languages (dynamic t() key, so check-i18n cannot see it — added to EN_TEXT and all 12 Webview dictionaries).`;

const ENTRY_ZH = `- 子代理目录弹层的刷新控件从 🔄 图标改成**文字「刷新」**。那个 emoji 在 Windows 上渲染成蓝色圆角方块,看起来像个无关的图标;换成文字后不依赖字体,和标题同一行、做成一枚小胶囊(输入框底色 + 控件描边,悬停/聚焦走主题色),悬停说明改成「重新读取子代理目录」而不再重复按钮自己的文案。
- 弹层头部留白也顺手调大了(上下 6px),胶囊不再贴着头顶。
- 验证:真实包 + 真实 CSS 在无头 Chromium 里按深色/浅色渲染确认;新增的提示文案补齐了 14 种语言(它是动态 t() 键,check-i18n 扫不到,所以手工写进 EN_TEXT 与 12 份 Webview 词典)。`;

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
