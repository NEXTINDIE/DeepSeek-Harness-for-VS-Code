// rc.7 适配:新增「收起/展开提问卡片」文案键到 texts/*.json,并更新 package.nls 的
// defaultReasoningEffort 描述(新增 low 档:off / high / max → off / low / high / max)。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const newKeys = {
  "收起提问卡片": {
    "zh-tw": "收起提問卡片",
    "ja": "質問カードを折りたたむ",
    "ko": "질문 카드 접기",
    "de": "Fragenkarte einklappen",
    "fr": "Replier la carte de question",
    "es": "Contraer tarjeta de pregunta",
    "pt": "Recolher cartão de pergunta",
    "th": "ย่อการ์ดคำถาม",
    "id": "Ciutkan kartu pertanyaan",
    "tr": "Soru kartını daralt",
    "ar": "طي بطاقة السؤال",
    "ru": "Свернуть карточку вопроса",
  },
  "展开提问卡片": {
    "zh-tw": "展開提問卡片",
    "ja": "質問カードを展開",
    "ko": "질문 카드 펼치기",
    "de": "Fragenkarte ausklappen",
    "fr": "Déplier la carte de question",
    "es": "Expandir tarjeta de pregunta",
    "pt": "Expandir cartão de pergunta",
    "th": "ขยายการ์ดคำถาม",
    "id": "Perluas kartu pertanyaan",
    "tr": "Soru kartını genişlet",
    "ar": "توسيع بطاقة السؤال",
    "ru": "Развернуть карточку вопроса",
  },
};

const langs = ["zh-tw", "ja", "ko", "de", "fr", "es", "pt", "th", "id", "tr", "ar", "ru"];
let changed = 0;
for (const lang of langs) {
  const file = `${root}src/webview/texts/${lang}.json`;
  const obj = JSON.parse(readFileSync(file, "utf8"));
  let added = 0;
  for (const [key, values] of Object.entries(newKeys)) {
    if (obj[key] === undefined) {
      obj[key] = values[lang];
      added++;
    }
  }
  if (added) {
    writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
    changed++;
    console.log(`texts/${lang}.json: +${added}`);
  }
}

// package.nls:*: "off / high / max" → "off / low / high / max"
for (const f of ["package.nls.json", "package.nls.zh-cn.json", "package.nls.zh-tw.json", "package.nls.ja.json", "package.nls.ko.json", "package.nls.de.json", "package.nls.fr.json", "package.nls.es.json", "package.nls.pt.json", "package.nls.th.json", "package.nls.id.json", "package.nls.tr.json", "package.nls.ar.json", "package.nls.ru.json"]) {
  const file = `${root}${f}`;
  let raw = readFileSync(file, "utf8");
  const bom = raw.charCodeAt(0) === 0xfeff;
  const body = bom ? raw.slice(1) : raw;
  const next = body.split("off / high / max").join("off / low / high / max");
  if (next !== body) {
    writeFileSync(file, (bom ? "\ufeff" : "") + next, "utf8");
    changed++;
    console.log(`${f}: description updated`);
  } else {
    console.log(`${f}: (no change)`);
  }
}

console.log(`\ndone, ${changed} files touched`);
