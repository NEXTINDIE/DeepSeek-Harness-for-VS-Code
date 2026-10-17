// 发布 0.13.41:↑/↓ 历史召回改为「光标真的动不了」才接管。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const PREV = "0.13.40";
const ENTRY_EN = `## 0.13.41
- **↑/↓ history recall no longer fights the caret, and no longer needs an extra press.** The old rule keyed on absolute caret offsets: "caret at index 0" for ↑ and "caret at the end" for ↓, plus a special case for text with no newline. Two things went wrong with that. A long prompt that simply *wraps* has no newline, so pressing ↑ at its end instantly replaced the whole text with the previous message — exactly the "I only wanted to move the caret" case. And inside multi-line text the caret had to be walked to the very first character before a press would recall anything, which reads as "it only switches once I reach the top".
- The trigger is now "can the caret move at all?": the keypress is left to the browser, and on key-up the input compares the caret position with the one captured on key-down. If it moved, the press only moved the caret. If it could not move (first/last visual line, wrapped or not), that same press recalls history — no extra press. Text edits, blur, an open slash or mention popup, IME composition and shift-selection all cancel the pending decision, so nothing fires late or in the wrong context.
- **Ctrl/Alt + ↑/↓ recalls immediately from anywhere**, and a new setting \`dsh.historyKey\` (Settings → ⌨️ Sending & input) picks the plain-arrow policy: \`edge\` (default, as described), \`always\` (every press recalls — for people who want one-press switching and will move the caret with the mouse or ←/→), or \`off\` (plain arrows only move the caret; the modifier combo still recalls).
- Regression proof: the same jsdom suite run against the shipped **0.13.40** bundle fails the wrap case (\`82 chars → replaced by the 7-char history entry\`) plus \`off\` and the modifier case; against this build all 13 checks pass, including "caret at the visual top → that press recalls", "middle line → caret only", "popup open → navigation only", "blur before key-up → no recall". New strings are localized in 14 languages.`;

const ENTRY_ZH = `- **↑/↓ 调回历史不再和光标抢按键,也不需要多按一次**。旧规则按「绝对光标位置」判断:↑ 要求光标在索引 0、↓ 要求光标在文本末尾,再给「没有换行符的文本」开了特例。这带来两个反效果:长提示词只是**自动折行**(逻辑上没有换行符),光标在末尾时按 ↑ 会立刻把整段文字替换成上一条消息 —— 正是「我只是想移动光标」的情形;而多行文本里必须先把光标一路移到第一个字符,那一次按键才会召回,用起来就像「怎么按都不切,到了顶才切」。
- 现在改成问「光标到底还能不能动」:按键先交给浏览器,松开时把光标位置和按下时的位置比对 —— 动了就只是移动光标;没动(已在视觉首行 / 末行,折行与否都算)就由**这一次**按键召回,不再需要额外一下。文本被编辑、失焦、斜杠或提及弹层打开、输入法组合中、Shift 选区,都会取消这次待判定,不会延迟误触发。
- **Ctrl/Alt + ↑/↓ 在任何位置都立即召回**;新增设置 \`dsh.historyKey\`(设置 → ⌨️ 发送与输入)决定普通方向键的策略:\`edge\`(默认,如上)、\`always\`(每次按键都召回 —— 想要「一按就切换」、光标用鼠标或 ←/→ 移动的人选它)、\`off\`(普通方向键只移动光标,组合键仍可召回)。
- 回归证明:同一份 jsdom 夹具对着**已发布的 0.13.40** 包运行,折行那一项失败(\`82 字符 → 被 7 字符历史项替换\`),\`off\` 与组合键两项也失败;对着本版本 13 项全通过,含「已在视觉首行 → 这一次按键就召回」「中间行 → 只移动光标」「弹层打开 → 只导航」「松开前失焦 → 不召回」。新增文案已补齐 14 种语言。`;

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
