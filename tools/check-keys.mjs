// 检查 ui.ts EN_TEXT 中是否已有相关键。
import { readFileSync } from "node:fs";
const ui = readFileSync("src/webview/ui.ts", "utf8");
const keys = ["智能体", "文件", "文件夹", "文件与文件夹", "Session 对话", "Session", "（无工作目录）", "(无工作目录)", "新建会话", "取消"];
for (const k of keys) {
  const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^\\s*"${esc}"\\s*:`, "m");
  console.log(JSON.stringify(k), re.test(ui));
}
