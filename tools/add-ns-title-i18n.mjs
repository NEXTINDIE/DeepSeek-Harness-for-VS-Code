/**
 * 0.13.45:设置命名空间新增的两条标题(0.2.1-rc.2 的 web / web-deepseek-api)。
 * 这两条是动态键(经 nsTitle 变量传入 t()),check-i18n 扫不到,必须手动补齐三层。
 */
import fs from "node:fs";
import path from "node:path";

const root = "D:/Workspace/vscode";

const KEYS = {
  "网页能力": {
    en: "Web capability",
    "zh-tw": "網頁能力",
    ja: "ウェブ機能",
    ko: "웹 기능",
    de: "Web-Funktionen",
    fr: "Capacités web",
    es: "Capacidad web",
    pt: "Recursos web",
    th: "ความสามารถเว็บ",
    id: "Kemampuan web",
    tr: "Web yetenekleri",
    ru: "Веб-возможности",
    ar: "قدرات الويب",
  },
  "网页搜索(DeepSeek API)": {
    en: "Web search (DeepSeek API)",
    "zh-tw": "網頁搜尋(DeepSeek API)",
    ja: "ウェブ検索(DeepSeek API)",
    ko: "웹 검색(DeepSeek API)",
    de: "Websuche (DeepSeek API)",
    fr: "Recherche web (API DeepSeek)",
    es: "Búsqueda web (API de DeepSeek)",
    pt: "Pesquisa na web (API DeepSeek)",
    th: "ค้นหาเว็บ (DeepSeek API)",
    id: "Pencarian web (DeepSeek API)",
    tr: "Web araması (DeepSeek API)",
    ru: "Веб-поиск (API DeepSeek)",
    ar: "بحث الويب (واجهة DeepSeek)",
  },
};

// 1) EN_TEXT(ui.ts):插在「待处理卡片」注释之前的那组键旁边即可,这里插到 EN_TEXT 结尾前的锚点
const uiPath = path.join(root, "src/webview/ui.ts");
let ui = fs.readFileSync(uiPath, "utf8");
const anchor = `  "工作目录已切换为 {path}": "Working directory changed to {path}",`;
if (!ui.includes(anchor)) {
  console.error("EN_TEXT anchor not found");
  process.exit(1);
}
const enLines = Object.entries(KEYS).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v.en)},`).join("\n");
if (!ui.includes(`"网页能力"`)) {
  ui = ui.replace(anchor, `${anchor}\n  // ---- 0.2.1-rc.2:设置命名空间(动态键,见 panels.ts 的 NAMESPACE_TITLES) ----\n${enLines}`);
  fs.writeFileSync(uiPath, ui, "utf8");
  console.log("ui.ts EN_TEXT: added", Object.keys(KEYS).length);
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
