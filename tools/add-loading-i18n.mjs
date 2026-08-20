// @ 菜单加载行文案(texts/*.json 12 语言)。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const TEXTS = {
  "正在加载文件资源…": {
    "zh-tw": "正在載入檔案資源…",
    ja: "ファイルを読み込み中…",
    ko: "파일 리소스를 불러오는 중…",
    de: "Dateien werden geladen…",
    fr: "Chargement des fichiers…",
    es: "Cargando archivos…",
    pt: "Carregando arquivos…",
    th: "กำลังโหลดไฟล์…",
    id: "Memuat file…",
    tr: "Dosyalar yükleniyor…",
    ar: "جارٍ تحميل الملفات…",
    ru: "Загрузка файлов…",
  },
  "正在加载会话列表…": {
    "zh-tw": "正在載入工作階段清單…",
    ja: "セッション一覧を読み込み中…",
    ko: "세션 목록을 불러오는 중…",
    de: "Sessions werden geladen…",
    fr: "Chargement des sessions…",
    es: "Cargando sesiones…",
    pt: "Carregando sessões…",
    th: "กำลังโหลดรายการเซสชัน…",
    id: "Memuat daftar sesi…",
    tr: "Oturum listesi yükleniyor…",
    ar: "جارٍ تحميل قائمة الجلسات…",
    ru: "Загрузка списка сессий…",
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
