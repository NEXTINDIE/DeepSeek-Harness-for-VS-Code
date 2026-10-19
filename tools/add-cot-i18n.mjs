// 0.13.52 ②:思考翻译按钮与译文的 14 语言文案。
import fs from "node:fs";
import path from "node:path";

const ROOT = "D:/Workspace/vscode";

const KEYS = {
  "译": { en: "Translate", "zh-tw": "譯", ja: "翻訳", ko: "번역", de: "Übersetzen", fr: "Traduire", es: "Traducir", pt: "Traduzir", th: "แปล", id: "Terjemahkan", tr: "Çevir", ru: "Перевести", ar: "ترجم" },
  "把这段思考翻译成界面语言": {
    en: "Translate this reasoning into the interface language",
    "zh-tw": "把這段思考翻譯成介面語言",
    ja: "この思考を UI の言語に翻訳",
    ko: "이 사고 과정을 인터페이스 언어로 번역",
    de: "Diese Überlegung in die Oberflächensprache übersetzen",
    fr: "Traduire ce raisonnement dans la langue de l'interface",
    es: "Traducir este razonamiento al idioma de la interfaz",
    pt: "Traduzir este raciocínio para o idioma da interface",
    th: "แปลการคิดนี้เป็นภาษาของอินเทอร์เฟซ",
    id: "Terjemahkan penalaran ini ke bahasa antarmuka",
    tr: "Bu akıl yürütmeyi arayüz diline çevir",
    ru: "Перевести это рассуждение на язык интерфейса",
    ar: "ترجمة هذا التفكير إلى لغة الواجهة",
  },
  "翻译中…": { en: "Translating…", "zh-tw": "翻譯中…", ja: "翻訳中…", ko: "번역 중…", de: "Wird übersetzt…", fr: "Traduction…", es: "Traduciendo…", pt: "Traduzindo…", th: "กำลังแปล…", id: "Menerjemahkan…", tr: "Çevriliyor…", ru: "Перевод…", ar: "جارٍ الترجمة…" },
  "译文": { en: "Translation", "zh-tw": "譯文", ja: "訳文", ko: "번역문", de: "Übersetzung", fr: "Traduction", es: "Traducción", pt: "Tradução", th: "คำแปล", id: "Terjemahan", tr: "Çeviri", ru: "Перевод", ar: "الترجمة" },
  "(已按单次上限截断)": {
    en: "(truncated at the per-request limit)",
    "zh-tw": "(已依單次上限截斷)",
    ja: "(1 回の上限で切り詰め)",
    ko: "(1회 상한에서 잘림)",
    de: "(auf das Limit pro Anfrage gekürzt)",
    fr: "(tronqué à la limite par requête)",
    es: "(truncado en el límite por solicitud)",
    pt: "(truncado no limite por solicitação)",
    th: "(ตัดตามขีดจำกัดต่อคำขอ)",
    id: "(dipotong pada batas per permintaan)",
    tr: "(istek başına sınırda kesildi)",
    ru: "(обрезано по лимиту на запрос)",
    ar: "(مقطوع عند حد الطلب الواحد)",
  },
  "原文": { en: "Original", "zh-tw": "原文", ja: "原文", ko: "원문", de: "Original", fr: "Original", es: "Original", pt: "Original", th: "ต้นฉบับ", id: "Asli", tr: "Özgün", ru: "Оригинал", ar: "الأصل" },
  "翻译失败": { en: "Translation failed", "zh-tw": "翻譯失敗", ja: "翻訳に失敗しました", ko: "번역 실패", de: "Übersetzung fehlgeschlagen", fr: "Échec de la traduction", es: "Error de traducción", pt: "Falha na tradução", th: "แปลไม่สำเร็จ", id: "Gagal menerjemahkan", tr: "Çeviri başarısız", ru: "Не удалось перевести", ar: "فشلت الترجمة" },
};

const uiPath = path.join(ROOT, "src/webview/ui.ts");
let ui = fs.readFileSync(uiPath, "utf8");
const anchor = '  "点击查看大图": "Click to enlarge",';
if (!ui.includes(anchor)) {
  console.error("EN_TEXT anchor missing");
  process.exit(1);
}
const lines = Object.entries(KEYS)
  .filter(([k]) => !ui.includes(`${JSON.stringify(k)}:`))
  .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v.en)},`)
  .join("\n");
if (lines) {
  ui = ui.replace(anchor, `${anchor}\n  // ---- 思考翻译(0.2.1 cotTranslation) ----\n${lines}`);
  fs.writeFileSync(uiPath, ui, "utf8");
  console.log("ui.ts EN_TEXT: added", lines.split("\n").length);
} else {
  console.log("ui.ts EN_TEXT: nothing to add");
}

let updated = 0;
const dir = path.join(ROOT, "src/webview/texts");
for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith(".json")) continue;
  const lang = file.replace(/\.json$/, "");
  const full = path.join(dir, file);
  const dict = JSON.parse(fs.readFileSync(full, "utf8"));
  let touched = false;
  for (const [key, byLang] of Object.entries(KEYS)) {
    if (dict[key] === undefined && byLang[lang] !== undefined) {
      dict[key] = byLang[lang];
      touched = true;
    }
  }
  if (touched) {
    fs.writeFileSync(full, `${JSON.stringify(dict, null, 2)}\n`, "utf8");
    updated += 1;
  }
}
console.log(`texts/*.json updated: ${updated}`);
