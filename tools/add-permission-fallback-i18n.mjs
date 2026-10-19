// 0.13.55:补「解析不到预设」的本地化文案。
import fs from "node:fs";
import path from "node:path";

const ROOT = "D:/Workspace/vscode";
const KEYS = {
  "没有从宿主设置里解析出可选预设,下面按通用表单展示。": {
    en: "No presets could be parsed from the host settings; showing the generic form below.",
    "zh-tw": "沒有從主機設定解析出可選預設,下面以通用表單顯示。",
    ja: "ホスト設定から選択可能なプリセットを解析できませんでした。以下は汎用フォームで表示します。",
    ko: "호스트 설정에서 선택 가능한 프리셋을 찾지 못했습니다. 아래는 일반 폼으로 표시합니다.",
    de: "Aus den Host-Einstellungen ließen sich keine Presets ableiten; unten steht das allgemeine Formular.",
    fr: "Aucun préréglage n'a pu être lu dans les réglages de l'hôte ; le formulaire générique est affiché ci-dessous.",
    es: "No se pudieron leer presets de la configuración del host; abajo se muestra el formulario genérico.",
    pt: "Não foi possível ler presets das configurações do host; abaixo está o formulário genérico.",
    th: "อ่านพรีเซ็ตจากตั้งค่าของโฮสต์ไม่ได้ จึงแสดงแบบฟอร์มทั่วไปด้านล่าง",
    id: "Tidak ada preset yang bisa dibaca dari pengaturan host; formulir umum ditampilkan di bawah.",
    tr: "Ana bilgisayar ayarlarından ön ayar okunamadı; aşağıda genel form gösteriliyor.",
    ru: "Не удалось прочитать пресеты из настроек хоста; ниже показана общая форма.",
    ar: "لم يتم العثور على إعدادات مسبقة في إعدادات المضيف؛ يُعرض النموذج العام أدناه.",
  },
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
