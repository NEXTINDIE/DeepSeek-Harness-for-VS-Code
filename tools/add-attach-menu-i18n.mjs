// 0.13.58:附件菜单去 emoji 后的三个文案键。
import fs from "node:fs";
import path from "node:path";

const ROOT = "D:/Workspace/vscode";
const KEYS = {
  "添加文件": { en: "Add file", "zh-tw": "新增檔案", ja: "ファイルを追加", ko: "파일 추가", de: "Datei hinzufügen", fr: "Ajouter un fichier", es: "Añadir archivo", pt: "Adicionar arquivo", th: "เพิ่มไฟล์", id: "Tambah berkas", tr: "Dosya ekle", ru: "Добавить файл", ar: "إضافة ملف" },
  "添加文件夹": { en: "Add folder", "zh-tw": "新增資料夾", ja: "フォルダーを追加", ko: "폴더 추가", de: "Ordner hinzufügen", fr: "Ajouter un dossier", es: "Añadir carpeta", pt: "Adicionar pasta", th: "เพิ่มโฟลเดอร์", id: "Tambah folder", tr: "Klasör ekle", ru: "Добавить папку", ar: "إضافة مجلد" },
  "添加图片": { en: "Add image", "zh-tw": "新增圖片", ja: "画像を追加", ko: "이미지 추가", de: "Bild hinzufügen", fr: "Ajouter une image", es: "Añadir imagen", pt: "Adicionar imagem", th: "เพิ่มรูปภาพ", id: "Tambah gambar", tr: "Görsel ekle", ru: "Добавить изображение", ar: "إضافة صورة" },
};

const uiPath = path.join(ROOT, "src/webview/ui.ts");
let ui = fs.readFileSync(uiPath, "utf8");
const anchor = '  "点击查看大图": "Click to enlarge",';
const lines = Object.entries(KEYS)
  .filter(([k]) => !ui.includes(`${JSON.stringify(k)}:`))
  .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v.en)},`)
  .join("\n");
if (lines) {
  ui = ui.replace(anchor, `${anchor}\n${lines}`);
  fs.writeFileSync(uiPath, ui, "utf8");
  console.log("ui.ts EN_TEXT: added", lines.split("\n").length);
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
