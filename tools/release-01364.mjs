// 发布 0.13.64:目标条菜单定位/图标/文案,目标输入框改为多行。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PREV = "0.13.63";
const EN = `## 0.13.64
- **The goal card's "…" menu now opens under that button.** It was anchored to the whole card, so it dropped to the card's bottom-left corner on top of the transcript; it now hugs the "…" button, right-aligned, and is clamped to the viewport using its measured width instead of a fixed 240 px.
- **Goal menu rows show their icons again.** The rows were assembled from the raw icon key, so they read \`edit 修改目标\` / \`pause 暂停目标\`; they now render the line icon plus the localized label only.
- **A goal objective is now a multi-line field.** Creating a goal and editing an existing one (from the chip or the card) use the resizable textarea — Enter inserts a newline, Ctrl/Cmd+Shift+Enter saves — which suits objectives that run for several lines.
- Typecheck plus the goal / copy / inline-image / plan suites pass.`;

const ZH = `- **目标卡的「…」菜单改为贴着按钮弹出**。此前锚定的是整张卡片,菜单会掉到卡片左下角、压在对话正文上;现在锚定「…」按钮本身,右边缘对齐,并按实测宽度做视口钳制(不再写死 240px)。
- **目标菜单行恢复图标**。之前是拿图标 key 直接拼文字,显示成 \`edit 修改目标\` / \`pause 暂停目标\`;现在渲染线描图标 + 本地化文案。
- **目标描述改为多行输入**。新建目标与修改目标(芯片/卡片两条入口)都改用可拖拽高度的多行框:Enter 换行、Ctrl/Cmd+Shift+Enter 保存,长目标不再挤在一行里。
- typecheck 与目标菜单 / 复制 / 正文图片 / 计划模式四套夹具通过。`;

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
