// 修正:package.nls.*.json 的键不带百分号(vsce 用 /^%([\w\d.]+)%$/ 匹配后按组取值)。
import fs from "node:fs";

const ROOT = "D:/Workspace/vscode";
const files = fs.readdirSync(ROOT).filter((f) => /^package\.nls(\.[a-z-]+)?\.json$/.test(f));
let fixed = 0;
for (const file of files) {
  const full = `${ROOT}/${file}`;
  const dict = JSON.parse(fs.readFileSync(full, "utf8"));
  let touched = false;
  for (const key of Object.keys(dict)) {
    if (key.startsWith("%") && key.endsWith("%")) {
      const bare = key.slice(1, -1);
      dict[bare] = dict[key];
      delete dict[key];
      touched = true;
    }
  }
  if (touched) {
    fs.writeFileSync(full, `${JSON.stringify(dict, null, 2)}\n`, "utf8");
    fixed += 1;
  }
}
console.log(`nls files fixed: ${fixed}`);
const check = JSON.parse(fs.readFileSync(`${ROOT}/package.nls.json`, "utf8"));
console.log("base has config.stepCollapse.end:", Object.prototype.hasOwnProperty.call(check, "config.stepCollapse.end"));
