// 修复 dsh.openCordisPanel 命令的图标值(PowerShell 转义问题导致 icon 为空)。
import { readFileSync, writeFileSync } from "node:fs";
const p = JSON.parse(readFileSync("package.json", "utf8"));
const c = p.contributes.commands.find((x) => x.command === "dsh.openCordisPanel");
if (c) {
  c.icon = "$(extensions)";
  writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n", "utf8");
  console.log("icon fixed:", c.icon);
} else {
  console.log("command missing");
}
