// 一次性补丁:为 ui.ts 追加「/ 命令与技能自动补全」并接入输入事件(带锚点校验,避免并发覆盖丢失)。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const file = `${root}src/webview/ui.ts`;
const src = readFileSync(file, "utf8");
const newBlock = readFileSync(`${root}tools/slash-menu-block.txt`, "utf8").replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
const eol = "\r\n"; // ui.ts 使用 CRLF(与并行进程保持一致)

const oldBlock = [
  "  mentionState = { start: pos - m[0].length, query: m[1], items, selected: 0 };",
  "  renderMentionMenu();",
  "}",
  "",
  "input.rows = 1;",
  'input.addEventListener("input", () => {',
  "  autoResize();",
  "  updateSendButton();",
  "  updateMention();",
  "});",
  'input.addEventListener("keydown", (e) => {',
  "  // 提及弹层打开时:方向键导航、Enter 选择、Esc 关闭(不触发发送)",
  "  if (mentionState) {",
  '    if (e.key === "ArrowDown") {',
  "      e.preventDefault();",
  "      mentionState.selected = Math.min(mentionState.items.length - 1, mentionState.selected + 1);",
  "      renderMentionMenu();",
  "      return;",
  "    }",
  '    if (e.key === "ArrowUp") {',
  "      e.preventDefault();",
  "      mentionState.selected = Math.max(0, mentionState.selected - 1);",
  "      renderMentionMenu();",
  "      return;",
  "    }",
  '    if (e.key === "Escape") {',
  "      e.preventDefault();",
  "      closeMention();",
  "      return;",
  "    }",
  '    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {',
  "      e.preventDefault();",
  "      selectMention(mentionState.items[mentionState.selected].name);",
  "      return;",
  "    }",
  "  }",
  '  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {',
  "    e.preventDefault();",
  "    sendCurrent();",
  "  }",
  "});",
  'input.addEventListener("blur", () => closeMention());',
].join(eol);

const count = src.split(oldBlock).length - 1;
if (count !== 1) {
  console.error(`anchor mismatch: found ${count} (expected 1); aborting without write`);
  process.exit(1);
}
writeFileSync(file, src.replace(oldBlock, newBlock));
console.log("patched ui.ts slash autocomplete");
