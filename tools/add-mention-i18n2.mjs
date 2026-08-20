// @ 引用菜单新增文案键(texts/*.json 12 语言)。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const TEXTS = {
  "文件与文件夹": {
    "zh-tw": "檔案與資料夾",
    ja: "ファイルとフォルダー",
    ko: "파일 및 폴더",
    de: "Dateien & Ordner",
    fr: "Fichiers et dossiers",
    es: "Archivos y carpetas",
    pt: "Arquivos e pastas",
    th: "ไฟล์และโฟลเดอร์",
    id: "File dan folder",
    tr: "Dosyalar ve klasörler",
    ar: "الملفات والمجلدات",
    ru: "Файлы и папки",
  },
  "Session 对话": {
    "zh-tw": "Session 對話",
    ja: "Session 会話",
    ko: "Session 대화",
    de: "Session-Gespräche",
    fr: "Conversations de session",
    es: "Conversaciones de sesión",
    pt: "Conversas de sessão",
    th: "บทสนทนา Session",
    id: "Percakapan sesi",
    tr: "Oturum konuşmaları",
    ar: "محادثات الجلسة",
    ru: "Разговоры сессий",
  },
  "Session": {
    "zh-tw": "Session",
    ja: "Session",
    ko: "Session",
    de: "Session",
    fr: "Session",
    es: "Sesión",
    pt: "Sessão",
    th: "Session",
    id: "Sesi",
    tr: "Oturum",
    ar: "جلسة",
    ru: "Сессия",
  },
  "（无工作目录）": {
    "zh-tw": "（無工作目錄）",
    ja: "（作業ディレクトリなし）",
    ko: "（작업 디렉터리 없음）",
    de: "（kein Arbeitsverzeichnis）",
    fr: "（aucun répertoire de travail）",
    es: "（sin directorio de trabajo）",
    pt: "（sem diretório de trabalho）",
    th: "（ไม่มีไดเรกทอรีทำงาน）",
    id: "（tanpa direktori kerja）",
    tr: "（çalışma dizini yok）",
    ar: "（بدون دليل عمل）",
    ru: "（нет рабочего каталога）",
  },
};

const langs = ["zh-tw", "ja", "ko", "de", "fr", "es", "pt", "th", "id", "tr", "ar", "ru"];
let changed = 0;
for (const lang of langs) {
  const file = `${root}src/webview/texts/${lang}.json`;
  const obj = JSON.parse(readFileSync(file, "utf8"));
  let added = 0;
  for (const [key, values] of Object.entries(TEXTS)) {
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
console.log(`done, ${changed} files touched`);
