/**
 * 0.2.1 兼容与新增功能所需文案:
 * - Webview 词典(src/webview/texts/*.json,12 种语言;中文为源键)
 * - 宿主 l10n(l10n/bundle.l10n*.json,14 份)
 * 只追加缺失键,不覆盖已有翻译。
 */
import fs from "node:fs";
import path from "node:path";

const root = "D:/Workspace/vscode";

/** Webview 新键(中文为源语言;各语言译文) */
const WEBVIEW_KEYS = {
  "工作目录:{name}": {
    "zh-tw": "工作目錄:{name}", ja: "作業ディレクトリ: {name}", ko: "작업 디렉터리: {name}",
    de: "Arbeitsverzeichnis: {name}", fr: "Répertoire de travail : {name}", es: "Directorio de trabajo: {name}",
    pt: "Diretório de trabalho: {name}", th: "ไดเรกทอรีทำงาน: {name}", id: "Direktori kerja: {name}",
    tr: "Çalışma dizini: {name}", ru: "Рабочий каталог: {name}", ar: "دليل العمل: {name}",
  },
  "当前生效的工作目录:{path}\n点击在资源管理器中显示": {
    "zh-tw": "目前生效的工作目錄:{path}\n點擊在檔案總管中顯示",
    ja: "現在有効な作業ディレクトリ: {path}\nクリックでエクスプローラーに表示",
    ko: "현재 적용된 작업 디렉터리: {path}\n클릭하여 탐색기에 표시",
    de: "Aktuell gültiges Arbeitsverzeichnis: {path}\nZum Anzeigen im Explorer klicken",
    fr: "Répertoire de travail effectif : {path}\nCliquer pour révéler dans l'explorateur",
    es: "Directorio de trabajo vigente: {path}\nHaz clic para mostrar en el explorador",
    pt: "Diretório de trabalho em vigor: {path}\nClique para mostrar no explorador",
    th: "ไดเรกทอรีทำงานที่ใช้อยู่: {path}\nคลิกเพื่อแสดงในตัวจัดการไฟล์",
    id: "Direktori kerja yang berlaku: {path}\nKlik untuk tampilkan di penjelajah",
    tr: "Geçerli çalışma dizini: {path}\nDosya gezgininde göstermek için tıklayın",
    ru: "Действующий рабочий каталог: {path}\nНажмите, чтобы показать в проводнике",
    ar: "دليل العمل الفعلي: {path}\nانقر للعرض في مستكشف الملفات",
  },
  "工作目录已切换为 {path}": {
    "zh-tw": "工作目錄已切換為 {path}", ja: "作業ディレクトリを {path} に切り替えました",
    ko: "작업 디렉터리를 {path}(으)로 전환했습니다", de: "Arbeitsverzeichnis auf {path} umgestellt",
    fr: "Répertoire de travail changé pour {path}", es: "Directorio de trabajo cambiado a {path}",
    pt: "Diretório de trabalho alterado para {path}", th: "เปลี่ยนไดเรกทอรีทำงานเป็น {path} แล้ว",
    id: "Direktori kerja dialihkan ke {path}", tr: "Çalışma dizini {path} olarak değiştirildi",
    ru: "Рабочий каталог изменён на {path}", ar: "تم تغيير دليل العمل إلى {path}",
  },
  "📋 复制会话 ID": {
    "zh-tw": "📋 複製工作階段 ID", ja: "📋 セッション ID をコピー", ko: "📋 세션 ID 복사",
    de: "📋 Sitzungs-ID kopieren", fr: "📋 Copier l'ID de session", es: "📋 Copiar ID de sesión",
    pt: "📋 Copiar ID da sessão", th: "📋 คัดลอก ID เซสชัน", id: "📋 Salin ID sesi",
    tr: "📋 Oturum kimliğini kopyala", ru: "📋 Скопировать ID сеанса", ar: "📋 نسخ معرّف الجلسة",
  },
  "已复制会话 ID": {
    "zh-tw": "已複製工作階段 ID", ja: "セッション ID をコピーしました", ko: "세션 ID를 복사했습니다",
    de: "Sitzungs-ID kopiert", fr: "ID de session copié", es: "ID de sesión copiado",
    pt: "ID da sessão copiado", th: "คัดลอก ID เซสชันแล้ว", id: "ID sesi disalin",
    tr: "Oturum kimliği kopyalandı", ru: "ID сеанса скопирован", ar: "تم نسخ معرّف الجلسة",
  },
};

/** 宿主 l10n 新键 */
const L10N_EN = {
  "hub.remoteAccessLimited":
    "This DSH host granted only limited access to this connection, so some actions may be refused.",
};
const L10N = {
  "zh-cn": {
    "hub.remoteAccessLimited": "该 DSH 宿主只给本连接授予了受限访问权限,部分操作可能被拒绝。",
  },
  "zh-tw": { "hub.remoteAccessLimited": "該 DSH 主機只給本連線授予受限存取權限,部分操作可能被拒絕。" },
  ja: { "hub.remoteAccessLimited": "この DSH ホストはこの接続に限定的なアクセス権のみを付与しています。一部の操作は拒否される場合があります。" },
  ko: { "hub.remoteAccessLimited": "이 DSH 호스트가 이 연결에 제한된 액세스만 부여했습니다. 일부 작업이 거부될 수 있습니다." },
  de: { "hub.remoteAccessLimited": "Dieser DSH-Host hat dieser Verbindung nur eingeschränkten Zugriff gewährt; einige Aktionen können abgelehnt werden." },
  fr: { "hub.remoteAccessLimited": "Cet hôte DSH n'a accordé qu'un accès limité à cette connexion ; certaines actions peuvent être refusées." },
  es: { "hub.remoteAccessLimited": "Este host DSH solo concedió acceso limitado a esta conexión; algunas acciones pueden rechazarse." },
  pt: { "hub.remoteAccessLimited": "Este host DSH concedeu apenas acesso limitado a esta conexão; algumas ações podem ser recusadas." },
  th: { "hub.remoteAccessLimited": "โฮสต์ DSH นี้ให้สิทธิ์การเข้าถึงแบบจำกัดแก่การเชื่อมต่อนี้ การกระทำบางอย่างอาจถูกปฏิเสธ" },
  id: { "hub.remoteAccessLimited": "Host DSH ini hanya memberikan akses terbatas untuk koneksi ini; beberapa tindakan mungkin ditolak." },
  tr: { "hub.remoteAccessLimited": "Bu DSH ana bilgisayarı bu bağlantıya yalnızca sınırlı erişim verdi; bazı işlemler reddedilebilir." },
  ru: { "hub.remoteAccessLimited": "Этот узел DSH предоставил этому подключению только ограниченный доступ; некоторые действия могут быть отклонены." },
  ar: { "hub.remoteAccessLimited": "منح مضيف DSH هذا وصولاً محدودًا لهذا الاتصال فقط، وقد تُرفض بعض الإجراءات." },
};

let webviewAdded = 0;
const textsDir = path.join(root, "src/webview/texts");
for (const file of fs.readdirSync(textsDir)) {
  if (!file.endsWith(".json")) continue;
  const lang = file.replace(/\.json$/, "");
  const full = path.join(textsDir, file);
  const dict = JSON.parse(fs.readFileSync(full, "utf8"));
  let changed = false;
  for (const [key, byLang] of Object.entries(WEBVIEW_KEYS)) {
    if (dict[key] === undefined && byLang[lang] !== undefined) {
      dict[key] = byLang[lang];
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(full, `${JSON.stringify(dict, null, 2)}\n`, "utf8");
    webviewAdded += 1;
  }
}

let l10nAdded = 0;
const l10nDir = path.join(root, "l10n");
for (const file of fs.readdirSync(l10nDir)) {
  if (!/^bundle\.l10n(\.|$)/.test(file) || !file.endsWith(".json")) continue;
  const lang = file === "bundle.l10n.json" ? "en" : file.replace(/^bundle\.l10n\./, "").replace(/\.json$/, "");
  const dict = lang === "en" ? L10N_EN : L10N[lang];
  if (!dict) continue;
  const full = path.join(l10nDir, file);
  const json = JSON.parse(fs.readFileSync(full, "utf8"));
  let touched = false;
  for (const [key, value] of Object.entries(dict)) {
    if (json[key] === undefined) {
      json[key] = value;
      touched = true;
    }
  }
  if (touched) {
    fs.writeFileSync(full, `${JSON.stringify(json, null, 2)}\n`, "utf8");
    l10nAdded += 1;
  }
}
console.log(`webview dictionaries updated: ${webviewAdded}; l10n bundles updated: ${l10nAdded}`);
