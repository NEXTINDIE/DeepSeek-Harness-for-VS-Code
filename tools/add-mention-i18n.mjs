// 一次性脚本:为各语言词典补齐 @ 智能体提及弹层的"智能体"标题键。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const additions = {
  "zh-tw": { "智能体": "智慧體" },
  ja: { "智能体": "エージェント" },
  ko: { "智能体": "에이전트" },
  de: { "智能体": "Agenten" },
  fr: { "智能体": "Agents" },
  es: { "智能体": "Agentes" },
  pt: { "智能体": "Agentes" },
  th: { "智能体": "เอเจนต์" },
  id: { "智能体": "Agen" },
  tr: { "智能体": "Ajanlar" },
  ar: { "智能体": "الوكلاء" },
};

for (const [lang, dict] of Object.entries(additions)) {
  const file = `${root}src/webview/texts/${lang}.json`;
  const json = JSON.parse(readFileSync(file, "utf8"));
  let added = 0;
  for (const [k, v] of Object.entries(dict)) {
    if (json[k] === undefined) {
      json[k] = v;
      added += 1;
    }
  }
  writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  console.log(`${lang}.json: +${added} keys`);
}
