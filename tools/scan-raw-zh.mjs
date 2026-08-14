// 扫描 ui.ts 裸中文行(排除注释行与 EN_TEXT 词典行)
import { readFileSync } from "node:fs";
const file = new URL("../src/webview/ui.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const lines = readFileSync(file, "utf8").split(/\r?\n/);
let inDict = false;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (/^\s*const EN_TEXT/.test(line)) inDict = true;
  if (inDict) {
    if (/^\s*\};/.test(line)) inDict = false;
    continue;
  }
  if (!/[\u4e00-\u9fff]/.test(line)) continue;
  const trimmed = line.trim();
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
  // 允许的结构性标记(注入模型的上下文分隔符)
  if (trimmed.includes("【用户消息】") || trimmed.includes("【附加文件/文件夹】") || trimmed.includes("(?:recommended")) continue;
  console.log(`${i + 1}: ${trimmed}`);
}
