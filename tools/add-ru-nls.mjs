// 一次性脚本:为所有 package.nls.*.json 补齐 config.language.ru 枚举描述键。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const KEY = "config.language.ru";
const values = {
  "package.nls.json": "Russian",
  "package.nls.zh-cn.json": "俄语",
  "package.nls.zh-tw.json": "俄語",
  "package.nls.ja.json": "ロシア語",
  "package.nls.ko.json": "러시아어",
  "package.nls.de.json": "Russisch",
  "package.nls.fr.json": "Russe",
  "package.nls.es.json": "Ruso",
  "package.nls.pt.json": "Russo",
  "package.nls.th.json": "รัสเซีย",
  "package.nls.id.json": "Rusia",
  "package.nls.tr.json": "Rusça",
  "package.nls.ru.json": "Русский",
  "package.nls.ar.json": "الروسية",
};

for (const [file, value] of Object.entries(values)) {
  const p = `${root}${file}`;
  const json = JSON.parse(readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
  if (json[KEY] === undefined) {
    json[KEY] = value;
    writeFileSync(p, JSON.stringify(json, null, 2) + "\n");
    console.log(`${file}: +${KEY}`);
  } else {
    console.log(`${file}: already present`);
  }
}
