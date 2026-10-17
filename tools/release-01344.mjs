// 发布 0.13.44:斜杠命令记录改为右侧胶囊,清掉空 note 留下的虚线段。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const PREV = "0.13.43";
const ENTRY_EN = `## 0.13.44
- **Slash-command records (/plan, /compact, …) no longer look like system notices.** They were rendered as a .msg-note, which is centred and dashed — so your own command appeared floating in the middle of the transcript, detached from the conversation side. Command records now get their own class and become a small right-aligned pill (input-background fill, widget border, monospace, \`⌘\` prefix), matching your own messages.
- The short dashed line above it was a collapsed **attachment-context card** (.attach-card) carrying the same dashed, centred look with a background that vanished in light themes. It is now a right-aligned pill with the input background and a widget border, so a collapsed "📎 附件上下文" reads as a compact row instead of a stray dashed rule.
- Also hardened: an empty note (or an empty queued message) no longer paints an empty bordered box — those used to leave a one-pixel dashed segment behind after edits/clears.
- Queued messages (⏳ 排队中) now sit on the same side as your messages with a solid, theme-coloured surface instead of a centred dashed box, keeping the badge as the only "waiting" signal.
- Verified by rendering the real bundle + real CSS in headless Chromium in both palettes, with a session that has a finished turn, an attachment-context card and a \`/plan\` command, plus screenshots.`;

const ENTRY_ZH = `- **斜杠命令记录(/plan、/compact 等)不再像系统提示**。它以前走 \`.msg-note\`(居中 + 虚线),于是你自己发的命令悬在对话中央、和用户消息分属两侧。现在命令记录有独立类名,渲染成右侧对齐的小胶囊(输入框底色 + 控件描边 + 等宽字体 + \`⌘\` 前缀),与你自己的消息同侧。
- 你看到的那条短虚线其实是**折叠态的附件上下文卡**(\`.attach-card\`):同样是虚线、同样偏中,且底色在亮色主题下几乎消失。现在改为右侧对齐的胶囊(输入框底色 + 控件描边),折叠时就是一行「📎 附件上下文」,不再是悬空的一截虚线。
- 顺带加固:**空 note / 空排队项不再画出带边框的空框** —— 以前编辑或清空后会残留一像素高的虚线段。
- 排队消息(⏳ 排队中)也移到与用户消息同侧,改成实线主题表面,只靠徽标表达"等待发送"。
- 验证:用真实包 + 真实 CSS 在无头 Chromium 里按深色/浅色两套配色渲染(含已完成回合、附件上下文卡与 \`/plan\` 命令),并附截图。`;

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
