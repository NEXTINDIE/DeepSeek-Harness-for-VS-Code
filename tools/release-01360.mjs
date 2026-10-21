// 发布 0.13.60:菜单图标对齐/间距 + 设置目标芯片图标 + toast 图标线描化。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PREV = "0.13.59";
const EN = `## 0.13.60
- **Menu icons line up with their labels.** \`.plus-menu-item\` is a flex row with an 8px gap, each icon sits in a fixed 16px slot vertically centred and muted, brightening on hover; the label takes the remaining width. Before this the icon and text were glued together with no gap.
- **设置目标 chip uses the target glyph.** The empty-goal entry point still carried 🎯; it now draws the line-art target icon like the other chips.
- **Toasts use line icons too.** Every status emoji is stripped from the toast text and replaced by a line-art glyph (check for success, warning triangle for warnings/errors, info otherwise), so no coloured emoji remains in transient messages either.
- Typecheck, i18n (nothing missing) and the plan / 0.2.1 / session-UX / plan-border / deliverable suites all pass.`;

const ZH = `- **菜单图标与文字对齐并保持间距**。\`.plus-menu-item\` 改为 flex 行 + 8px 间距,图标放进固定 16px 槽位、垂直居中且用次要色,悬停提亮;文字占满剩余宽度。此前图标和文字是贴在一起的。
- **「设置目标」芯片改用目标图形**:无目标时的入口原本还是 🎯,现在与其它芯片一致,画线描 target 图标。
- **toast 也改线描图标**:文案里的状态 emoji 一律剥掉,改由 toast 输出线描图形(成功=对勾、警告/错误=警告三角、其它=信息),瞬时提示里不再出现彩色 emoji。
- typecheck、i18n(无缺失)与计划模式 / 0.2.1 / 会话交互 / 计划边框 / 交付卡五套夹具均通过。`;

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
