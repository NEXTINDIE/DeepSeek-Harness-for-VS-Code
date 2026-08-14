import { readFileSync } from "node:fs";
const s = readFileSync(process.argv[2], "utf8");
// 找到 sessions 域 prompt 方法实现
const i = s.indexOf("prompt(request) {");
if (i === -1) { console.log("prompt impl not found"); process.exit(0); }
console.log(s.slice(i - 200, i + 3000).replace(/\n/g, "\n"));
