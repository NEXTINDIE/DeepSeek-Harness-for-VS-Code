/**
 * 0.13.46:子代理目录的「刷新」改为文字按钮,新增其悬停说明文案
 * (「重新读取子代理目录」)的英文 + 12 语言词典。
 */
import fs from "node:fs";
import path from "node:path";

const root = "D:/Workspace/vscode";
const KEY = "重新读取子代理目录";
const VALUES = {
  en: "Re-read the subagent catalog",
  "zh-tw": "重新讀取子代理目錄",
  ja: "サブエージェント一覧を再読み込み",
  ko: "하위 에이전트 목록 새로 고침",
  de: "Unteragenten-Katalog neu einlesen",
  fr: "Relire le catalogue des sous-agents",
  es: "Volver a leer el catálogo de subagentes",
  pt: "Ler novamente o catálogo de subagentes",
  th: "อ่านแคตตาล็อกเอเจนต์ย่อยใหม่",
  id: "Baca ulang katalog subagen",
  tr: "Alt ajan kataloğunu yeniden oku",
  ru: "Перечитать каталог субагентов",
  ar: "إعادة قراءة فهرس الوكلاء الفرعيين",
};

// 1) EN_TEXT
const uiPath = path.join(root, "src/webview/ui.ts");
let ui = fs.readFileSync(uiPath, "utf8");
if (!ui.includes(`"${KEY}":`)) {
  const anchor = `  "子代理目录({n} 个运行中)": "Subagent catalog ({n} running)",`;
  if (!ui.includes(anchor)) {
    console.error("EN_TEXT anchor not found");
    process.exit(1);
  }
  ui = ui.replace(anchor, `${anchor}\n  ${JSON.stringify(KEY)}: ${JSON.stringify(VALUES.en)},`);
  fs.writeFileSync(uiPath, ui, "utf8");
  console.log("ui.ts EN_TEXT: added 1");
} else {
  console.log("ui.ts EN_TEXT: already present");
}

// 2) 12 语言词典
let updated = 0;
const dir = path.join(root, "src/webview/texts");
for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith(".json")) continue;
  const lang = file.replace(/\.json$/, "");
  const full = path.join(dir, file);
  const dict = JSON.parse(fs.readFileSync(full, "utf8"));
  if (dict[KEY] === undefined && VALUES[lang] !== undefined) {
    dict[KEY] = VALUES[lang];
    fs.writeFileSync(full, `${JSON.stringify(dict, null, 2)}\n`, "utf8");
    updated += 1;
  }
}
console.log(`texts/*.json updated: ${updated}`);
