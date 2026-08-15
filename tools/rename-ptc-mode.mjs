// 一次性脚本:把各语言词典中 "PTC 模式" 的中文键改为 "编码模式"(英文值不变)。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

for (const lang of ["zh-tw", "ja", "ko", "de", "fr", "es", "pt", "th", "id", "tr", "ar"]) {
  const file = `${root}src/webview/texts/${lang}.json`;
  const json = JSON.parse(readFileSync(file, "utf8"));
  let added = 0;
  if (json["PTC 模式"] !== undefined && json["编码模式"] === undefined) {
    json["编码模式"] = json["PTC 模式"];
    added = 1;
  }
  writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  console.log(`${lang}.json: +${added} keys`);
}
