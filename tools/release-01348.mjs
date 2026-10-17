// 发布 0.13.48:顶部改版 + 新建对话 + 菜单去 emoji。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const PREV = "0.13.47";
const ENTRY_EN = `## 0.13.48
- **Header refreshed.** The session row now uses one consistent 8px rhythm, a 6/10px dropdown trigger on the theme's input background with the widget border, and a real bottom divider (only when the theme defines one). The \`+\` icon button became **「新建对话」** — plus icon plus label — so the primary action of that row is readable instead of a bare glyph.
- **Every emoji left the session list and its ⋯ menu.** Rows carried ⏳ / 🛡️ / 📋 / ❓ / 🆕 / 💬 depending on state; they now use small theme-coloured dots with a text label (green pulsing dot + 运行中, blue dot + 等待回答, purple + 计划待审, amber + 等待审批, grey for an idle subagent), so light and dark themes agree and nothing depends on how a font renders an emoji. Untitled sessions fall back to "新会话 · <id>" instead of an emoji prefix.
- The ⋯ menu items are line icons + text (rename / fork / copy ID / archive) on the new menu surface: 2px gaps, widget border, a softer shadow, muted icons that follow the foreground on hover, and labels that re-render on a language switch.
- Same cascade trap as before, caught in review: the new-session button needed a \`.btn\` prefix, because the generic \`.btn\` rule sits later in the stylesheet and was overriding its background.
- Verified by rendering the real bundle + real CSS in headless Chromium at a realistic sidebar width in both palettes (session dropdown, ⋯ menu, new-chat button), plus typecheck, duplicate-key check and all six UI suites.`;

const ENTRY_ZH = `- **顶部改版**。会话这一行统一成 8px 间距;会话下拉触发按钮改成输入框底色 + 控件描边、6/10px 内边距;底部加了一条分隔线(主题定义了 panel-border 时才显示)。原来的 \`+\` 纯图标按钮改成 **「新建对话」**(＋ 图标 + 文字),这一行最主要的动作不再是一个只能靠猜的字形。
- **会话列表与 ⋯ 菜单里的 emoji 全部移除**。之前列表行按状态带 ⏳ / 🛡️ / 📋 / ❓ / 🆕 / 💬;现在统一成主题色小圆点 + 文字(绿色脉冲点 + 运行中、蓝点 + 等待回答、紫点 + 计划待审、琥珀点 + 等待审批、灰点表示空闲子代理),亮色/暗色一致,也不再取决于字体怎么渲染 emoji。无标题会话的兜底名改成「新会话 · <id>」,不再带 emoji 前缀。
- ⋯ 菜单条目改成线性图标 + 文字(重命名 / 分叉 / 复制 ID / 归档),菜单本身也换了表面:2px 条目间距、控件描边、更柔和的投影,图标用次要色、悬停跟随前景色,语言切换时文字会就地刷新。
- 又一次撞到同一个层叠陷阱并在自查时抓住:新建对话按钮必须带 \`.btn\` 前缀 —— 通用 \`.btn\` 规则在文件更靠后,会把它的底色覆盖掉。
- 验证:真实包 + 真实 CSS 在无头 Chromium 里按真实侧栏宽度、深色/浅色各渲染一次(会话下拉、⋯ 菜单、新建对话按钮),并跑 typecheck、重复键检查与六套界面夹具。`;

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
