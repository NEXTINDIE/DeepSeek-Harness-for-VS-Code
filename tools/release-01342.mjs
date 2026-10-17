// 发布 0.13.42:待处理卡片与按钮统一到 VS Code 主题风格。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const PREV = "0.13.41";
const ENTRY_EN = `## 0.13.42
- **Plan review, question and approval cards now follow the VS Code theme instead of the old green/yellow styling.** Every待处理 card previously tinted its whole surface (plan: yellow-green \`#dcdcaa\`, approval: salmon, cordis: purple) and the primary button was a hard-coded GitHub green (\`#2ea043\`). None of those colors came from the theme, so they clashed with light themes and dropped the body text's contrast. The cards now share one neutral panel surface with a 1px theme border and a 3px left category rail — amber for tool approval, purple for plan review and plugin approval, blue for questions — while headings keep the theme foreground and only their icon carries the category color.
- Buttons got a real hierarchy: the base \`btn\` is the theme's secondary button (hover/focus from theme tokens, no \`filter: brightness\` hack), the primary action (\`允许一次\` / \`确认执行\` / \`提交回答\` / \`仅允许此版本\`) is the theme's primary button, and \`拒绝\` stays neutral until hover, where it turns into the theme's error tint — no more permanent red outline. The Cordis card's broader permission (\`允许后续版本\`) became a secondary button with a purple outline instead of a second primary, and the \`✓\`/\`✓✓\`/\`✅\` label prefixes are gone so color carries the emphasis.
- Readability work on the plan card: the plan body renders inside a scrollable editor-background panel with 12/14px padding, 12.5px text at 1.65 line-height, and explicit heading/list/code spacing (h1 14px, h2/h3 12.5px with breathing room, inline code in the editor font). Option rows use the theme's active-selection background when selected.
- Two genuine bugs found while doing this: the dialog's \`确定\` button was **never** primary — \`.dialog-confirm\` was defined before \`.btn\` and lost the cascade, so it always rendered gray (now \`.btn.dialog-confirm\` with the theme primary color, plus a new destructive style for \`清除\`); and \`#dcdcaa\` on session badges, plan/goal/mode chips and status dots was unreadable in light themes, so those all map to theme semantic tokens now.
- Verified visually, not just by reading CSS: the real webview bundle plus the real \`chat.css\` rendered in headless Chromium in both dark and light palettes, covering plan review, a question card with a selected option and countdown, a tool approval, a plugin approval, and the generic dialog. All existing jsdom suites still pass, together with typecheck and the three-layer i18n check.`;

const ENTRY_ZH = `- **计划待审 / 提问 / 审批卡片改为跟随 VS Code 主题,不再是以前的绿色系。** 此前每张待处理卡片都把整块表面染色(计划黄绿 \`#dcdcaa\`、审批橙红、插件审批紫),主按钮是写死的 GitHub 绿(\`#2ea043\`)—— 这些颜色都不来自主题,亮色主题下既突兀又压低正文对比度。现在所有待处理卡片共用一套中性面板底色 + 1px 主题边框 + 3px 左侧分类导轨(工具审批琥珀、计划审阅与插件审批紫、提问蓝),标题保持主题前景色,只有图标带类别色。
- 按钮有了真正的主次:基础 \`btn\` 就是主题的次要按钮(悬停/聚焦都用主题令牌,不再用 \`filter: brightness\` 糊弄),主操作(\`允许一次\` / \`确认执行\` / \`提交回答\` / \`仅允许此版本\`)用主题主按钮色,\`拒绝\` 平时中性、悬停才转成主题错误色 —— 不再是一圈常驻红框。插件审批里权限更宽的 \`允许后续版本\` 降为带紫色描边的次要按钮,并去掉 \`✓\`/\`✓✓\`/\`✅\` 前缀,让颜色来承担强调。
- 计划卡的可读性:正文放进可滚动的「编辑器底色」面板,内边距 12/14px,12.5px 字号、1.65 行高,并补齐标题/列表/行内代码的间距(h1 14px,h2/h3 12.5px 且上下留白,行内代码用编辑器字体);选项被选中时用主题的列表选中底色。
- 顺带修掉两个真实缺陷:对话框的 \`确定\` 按钮**从来都不是**主按钮 —— \`.dialog-confirm\` 定义在 \`.btn\` 之前,层叠里一直被覆盖成灰色(现在改成 \`.btn.dialog-confirm\` 走主题主色,并给 \`清除\` 补了破坏性样式);以及 \`#dcdcaa\` 在会话徽标、计划/目标/模式芯片与状态点上亮色主题几乎看不清,现已全部映射到主题语义令牌。
- 验证方式不只是读 CSS:用真实 webview 包 + 真实 \`chat.css\` 在无头 Chromium 里按深色与浅色两套配色渲染,覆盖计划待审、带选中项与倒计时的提问、工具审批、插件审批以及通用对话框。既有 jsdom 夹具全部仍通过,typecheck 与三层 i18n 校验也通过。`;

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
