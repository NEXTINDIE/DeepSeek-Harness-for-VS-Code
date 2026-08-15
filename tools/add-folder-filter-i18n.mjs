// 一次性脚本:为各语言词典补齐会话下拉按目录过滤的新文案键。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const additions = {
  "zh-tw": {
    "会话(当前目录)": "工作階段(目前目錄)",
    "显示全部会话": "顯示全部工作階段",
    "仅显示当前目录会话": "僅顯示目前目錄的工作階段",
    "显示其他目录的会话": "顯示其他目錄的工作階段",
    "默认只显示当前工作目录的会话": "預設只顯示目前工作目錄的工作階段",
  },
  ja: {
    "会话(当前目录)": "セッション(現在のディレクトリ)",
    "显示全部会话": "すべてのセッションを表示",
    "仅显示当前目录会话": "現在のディレクトリのセッションのみ表示",
    "显示其他目录的会话": "他のディレクトリのセッションを表示",
    "默认只显示当前工作目录的会话": "デフォルトでは現在の作業ディレクトリのセッションのみ表示",
  },
  ko: {
    "会话(当前目录)": "세션(현재 디렉터리)",
    "显示全部会话": "모든 세션 표시",
    "仅显示当前目录会话": "현재 디렉터리의 세션만 표시",
    "显示其他目录的会话": "다른 디렉터리의 세션 표시",
    "默认只显示当前工作目录的会话": "기본적으로 현재 작업 디렉터리의 세션만 표시",
  },
  de: {
    "会话(当前目录)": "Sitzungen (aktueller Ordner)",
    "显示全部会话": "Alle Sitzungen anzeigen",
    "仅显示当前目录会话": "Nur Sitzungen im aktuellen Ordner",
    "显示其他目录的会话": "Sitzungen aus anderen Ordnern anzeigen",
    "默认只显示当前工作目录的会话": "Standardmäßig nur Sitzungen im aktuellen Arbeitsordner",
  },
  fr: {
    "会话(当前目录)": "Sessions (dossier actuel)",
    "显示全部会话": "Afficher toutes les sessions",
    "仅显示当前目录会话": "Sessions du dossier actuel uniquement",
    "显示其他目录的会话": "Afficher les sessions des autres dossiers",
    "默认只显示当前工作目录的会话": "Par défaut, seules les sessions du dossier de travail actuel sont affichées",
  },
  es: {
    "会话(当前目录)": "Sesiones (carpeta actual)",
    "显示全部会话": "Mostrar todas las sesiones",
    "仅显示当前目录会话": "Solo sesiones de la carpeta actual",
    "显示其他目录的会话": "Mostrar sesiones de otras carpetas",
    "默认只显示当前工作目录的会话": "Por defecto solo se muestran las sesiones de la carpeta de trabajo actual",
  },
  pt: {
    "会话(当前目录)": "Sessões (pasta atual)",
    "显示全部会话": "Mostrar todas as sessões",
    "仅显示当前目录会话": "Apenas sessões da pasta atual",
    "显示其他目录的会话": "Mostrar sessões de outras pastas",
    "默认只显示当前工作目录的会话": "Por padrão, apenas sessões da pasta de trabalho atual são exibidas",
  },
  th: {
    "会话(当前目录)": "เซสชัน (โฟลเดอร์ปัจจุบัน)",
    "显示全部会话": "แสดงเซสชันทั้งหมด",
    "仅显示当前目录会话": "แสดงเฉพาะเซสชันในโฟลเดอร์ปัจจุบัน",
    "显示其他目录的会话": "แสดงเซสชันจากโฟลเดอร์อื่น",
    "默认只显示当前工作目录的会话": "โดยค่าเริ่มต้นจะแสดงเฉพาะเซสชันในโฟลเดอร์ทำงานปัจจุบัน",
  },
  id: {
    "会话(当前目录)": "Sesi (folder saat ini)",
    "显示全部会话": "Tampilkan semua sesi",
    "仅显示当前目录会话": "Hanya sesi di folder saat ini",
    "显示其他目录的会话": "Tampilkan sesi dari folder lain",
    "默认只显示当前工作目录的会话": "Secara default hanya sesi di folder kerja saat ini yang ditampilkan",
  },
  tr: {
    "会话(当前目录)": "Oturumlar (geçerli klasör)",
    "显示全部会话": "Tüm oturumları göster",
    "仅显示当前目录会话": "Yalnızca geçerli klasördeki oturumlar",
    "显示其他目录的会话": "Diğer klasörlerdeki oturumları göster",
    "默认只显示当前工作目录的会话": "Varsayılan olarak yalnızca geçerli çalışma klasöründeki oturumlar gösterilir",
  },
  ar: {
    "会话(当前目录)": "الجلسات (المجلد الحالي)",
    "显示全部会话": "عرض كل الجلسات",
    "仅显示当前目录会话": "جلسات المجلد الحالي فقط",
    "显示其他目录的会话": "عرض جلسات المجلدات الأخرى",
    "默认只显示当前工作目录的会话": "افتراضيًا تُعرض جلسات مجلد العمل الحالي فقط",
  },
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
