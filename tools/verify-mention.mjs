// 验证 @ 菜单改动在产物中。
import { readFileSync } from "node:fs";
const ui = readFileSync("dist/webview/ui.js", "utf8");
console.log({ loading: ui.includes("mentionRemoteLoading"), spinner: ui.includes("mention-spinner") });
// emoji 前缀已移除:不再有 "🤖 "、"📄 "、"💬 " 行前缀(仍可能出现在其他地方,检查 @ 行上下文)
const i = ui.indexOf("mention-item-desc");
if (i >= 0) console.log("row ctx:", ui.slice(i - 220, i + 60).replace(/\n/g, " "));
