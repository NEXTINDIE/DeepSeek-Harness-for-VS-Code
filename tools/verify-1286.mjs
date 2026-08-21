import { readFileSync } from "node:fs";
const ui = readFileSync("dist/webview/ui.js", "utf8");
console.log({ multiline: ui.includes("makeCustomAnswerInput"), textarea: ui.includes('createElement("textarea")'), shiftEnter: ui.includes("!e.shiftKey && !e.isComposing") });
