/**
 * 0.13.50:对话内图片缩略图可点击放大所需文案。
 * 点击查看大图 / 图片 —— EN_TEXT + 12 种语言。
 */
import fs from "node:fs";
import path from "node:path";

const root = "D:/Workspace/vscode";

const KEYS = {
  "点击查看大图": {
    en: "Click to enlarge",
    "zh-tw": "點擊檢視大圖",
    ja: "クリックで拡大表示",
    ko: "클릭하여 크게 보기",
    de: "Zum Vergrößern klicken",
    fr: "Cliquer pour agrandir",
    es: "Haz clic para ampliar",
    pt: "Clique para ampliar",
    th: "คลิกเพื่อขยาย",
    id: "Klik untuk memperbesar",
    tr: "Büyütmek için tıklayın",
    ru: "Нажмите, чтобы увеличить",
    ar: "انقر للتكبير",
  },
  "图片": {
    en: "image",
    "zh-tw": "圖片",
    ja: "画像",
    ko: "이미지",
    de: "Bild",
    fr: "image",
    es: "imagen",
    pt: "imagem",
    th: "รูปภาพ",
    id: "gambar",
    tr: "görsel",
    ru: "изображение",
    ar: "صورة",
  },
};

const uiPath = path.join(root, "src/webview/ui.ts");
let ui = fs.readFileSync(uiPath, "utf8");
const anchor = `  "点击查看图片": "Click to view the image",`;
if (!ui.includes(anchor)) {
  console.error("EN_TEXT anchor not found");
  process.exit(1);
}
const lines = Object.entries(KEYS)
  .filter(([k]) => !ui.includes(`${JSON.stringify(k)}:`))
  .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v.en)},`)
  .join("\n");
if (lines) {
  ui = ui.replace(anchor, `${anchor}\n  // ---- 对话内图片:点击放大 ----\n${lines}`);
  fs.writeFileSync(uiPath, ui, "utf8");
  console.log("ui.ts EN_TEXT: added", lines.split("\n").length);
} else {
  console.log("ui.ts EN_TEXT: nothing to add");
}

let updated = 0;
const dir = path.join(root, "src/webview/texts");
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
