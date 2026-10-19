// 0.13.53:账号卡片、代码块与设置分区的 14 语言文案。
import fs from "node:fs";
import path from "node:path";

const ROOT = "D:/Workspace/vscode";

const KEYS = {
  "DeepSeek 账号": { en: "DeepSeek account", "zh-tw": "DeepSeek 帳號", ja: "DeepSeek アカウント", ko: "DeepSeek 계정", de: "DeepSeek-Konto", fr: "Compte DeepSeek", es: "Cuenta de DeepSeek", pt: "Conta DeepSeek", th: "บัญชี DeepSeek", id: "Akun DeepSeek", tr: "DeepSeek hesabı", ru: "Аккаунт DeepSeek", ar: "حساب DeepSeek" },
  "读取账号状态中…": { en: "Reading account status…", "zh-tw": "讀取帳號狀態中…", ja: "アカウント状態を読み込み中…", ko: "계정 상태를 읽는 중…", de: "Kontostatus wird gelesen…", fr: "Lecture de l'état du compte…", es: "Leyendo el estado de la cuenta…", pt: "Lendo o estado da conta…", th: "กำลังอ่านสถานะบัญชี…", id: "Membaca status akun…", tr: "Hesap durumu okunuyor…", ru: "Чтение состояния аккаунта…", ar: "جارٍ قراءة حالة الحساب…" },
  "当前宿主的 dsh web 未启用 DeepSeek 账号功能(需要 0.2.1 及以上并升级 profile)。": {
    en: "This host's dsh web does not expose the DeepSeek account controller (requires 0.2.1+ with an upgraded profile).",
    "zh-tw": "目前主機的 dsh web 未啟用 DeepSeek 帳號功能(需要 0.2.1 以上並升級 profile)。",
    ja: "このホストの dsh web では DeepSeek アカウント機能が有効になっていません(0.2.1 以上と profile の更新が必要)。",
    ko: "이 호스트의 dsh web에는 DeepSeek 계정 기능이 없습니다(0.2.1 이상과 profile 업그레이드 필요).",
    de: "Dieses dsh web stellt die DeepSeek-Kontofunktion nicht bereit (0.2.1+ und aktualisiertes Profil nötig).",
    fr: "Ce dsh web n'expose pas la fonction de compte DeepSeek (0.2.1+ et profil mis à jour requis).",
    es: "Este dsh web no expone la función de cuenta DeepSeek (requiere 0.2.1+ y perfil actualizado).",
    pt: "Este dsh web não expõe o recurso de conta DeepSeek (requer 0.2.1+ e perfil atualizado).",
    th: "dsh web นี้ไม่เปิดใช้ฟีเจอร์บัญชี DeepSeek (ต้องใช้ 0.2.1 ขึ้นไปและอัปเกรด profile)",
    id: "dsh web ini tidak menyediakan fitur akun DeepSeek (perlu 0.2.1+ dan profile yang diperbarui).",
    tr: "Bu dsh web, DeepSeek hesap özelliğini sunmuyor (0.2.1+ ve güncellenmiş profil gerekir).",
    ru: "Этот dsh web не предоставляет функцию аккаунта DeepSeek (нужны 0.2.1+ и обновлённый профиль).",
    ar: "لا يوفّر dsh web هذا ميزة حساب DeepSeek (يلزم 0.2.1 أو أحدث مع تحديث profile).",
  },
  "未登录": { en: "Not signed in", "zh-tw": "未登入", ja: "未サインイン", ko: "로그인하지 않음", de: "Nicht angemeldet", fr: "Non connecté", es: "Sin sesión", pt: "Não conectado", th: "ยังไม่ได้ลงชื่อเข้าใช้", id: "Belum masuk", tr: "Oturum açılmadı", ru: "Вход не выполнен", ar: "لم يتم تسجيل الدخول" },
  "登录后可使用账号模型,并在这里查看余额与用量。": {
    en: "Sign in to use account models and see your balance and usage here.",
    "zh-tw": "登入後可使用帳號模型,並在這裡查看餘額與用量。",
    ja: "サインインするとアカウントのモデルを使え、ここで残高と使用量を確認できます。",
    ko: "로그인하면 계정 모델을 사용하고 여기에서 잔액과 사용량을 볼 수 있습니다.",
    de: "Melden Sie sich an, um Konto-Modelle zu nutzen und Guthaben sowie Nutzung hier zu sehen.",
    fr: "Connectez-vous pour utiliser les modèles du compte et voir le solde et l'usage ici.",
    es: "Inicia sesión para usar los modelos de la cuenta y ver aquí el saldo y el uso.",
    pt: "Entre para usar os modelos da conta e ver aqui o saldo e o uso.",
    th: "ลงชื่อเข้าใช้เพื่อใช้โมเดลของบัญชีและดูยอดคงเหลือและการใช้งานที่นี่",
    id: "Masuk untuk memakai model akun dan melihat saldo serta penggunaan di sini.",
    tr: "Hesap modellerini kullanmak ve bakiyenizi kullanımınızı burada görmek için oturum açın.",
    ru: "Войдите, чтобы использовать модели аккаунта и видеть здесь баланс и расход.",
    ar: "سجّل الدخول لاستخدام نماذج الحساب ورؤية الرصيد والاستخدام هنا.",
  },
  "登录 DeepSeek 账号": { en: "Sign in with DeepSeek", "zh-tw": "登入 DeepSeek 帳號", ja: "DeepSeek アカウントでサインイン", ko: "DeepSeek 계정으로 로그인", de: "Mit DeepSeek anmelden", fr: "Se connecter avec DeepSeek", es: "Iniciar sesión con DeepSeek", pt: "Entrar com DeepSeek", th: "ลงชื่อเข้าใช้ด้วย DeepSeek", id: "Masuk dengan DeepSeek", tr: "DeepSeek ile oturum aç", ru: "Войти через DeepSeek", ar: "تسجيل الدخول بحساب DeepSeek" },
  "用量": { en: "Usage", "zh-tw": "用量", ja: "使用量", ko: "사용량", de: "Nutzung", fr: "Usage", es: "Uso", pt: "Uso", th: "การใช้งาน", id: "Penggunaan", tr: "Kullanım", ru: "Расход", ar: "الاستخدام" },
  "充值": { en: "Top up", "zh-tw": "儲值", ja: "チャージ", ko: "충전", de: "Aufladen", fr: "Recharger", es: "Recargar", pt: "Recarregar", th: "เติมเงิน", id: "Isi ulang", tr: "Bakiye yükle", ru: "Пополнить", ar: "شحن الرصيد" },
  "已登录": { en: "Signed in", "zh-tw": "已登入", ja: "サインイン済み", ko: "로그인됨", de: "Angemeldet", fr: "Connecté", es: "Sesión iniciada", pt: "Conectado", th: "ลงชื่อเข้าใช้แล้ว", id: "Sudah masuk", tr: "Oturum açık", ru: "Вход выполнен", ar: "تم تسجيل الدخول" },
  "退出登录": { en: "Sign out", "zh-tw": "登出", ja: "サインアウト", ko: "로그아웃", de: "Abmelden", fr: "Se déconnecter", es: "Cerrar sesión", pt: "Sair", th: "ออกจากระบบ", id: "Keluar", tr: "Oturumu kapat", ru: "Выйти", ar: "تسجيل الخروج" },
  "余额": { en: "Balance", "zh-tw": "餘額", ja: "残高", ko: "잔액", de: "Guthaben", fr: "Solde", es: "Saldo", pt: "Saldo", th: "ยอดคงเหลือ", id: "Saldo", tr: "Bakiye", ru: "Баланс", ar: "الرصيد" },
  "赠送额度": { en: "Bonus credit", "zh-tw": "贈送額度", ja: "付与クレジット", ko: "보너스 크레딧", de: "Bonusguthaben", fr: "Crédit offert", es: "Crédito de regalo", pt: "Crédito de bônus", th: "เครดิตโบนัส", id: "Kredit bonus", tr: "Bonus kredi", ru: "Бонусный баланс", ar: "رصيد المكافأة" },
  "余额读取失败或暂不可用。": { en: "Balance could not be read or is currently unavailable.", "zh-tw": "餘額讀取失敗或暫時無法取得。", ja: "残高を取得できないか、現在利用できません。", ko: "잔액을 읽지 못했거나 현재 사용할 수 없습니다.", de: "Guthaben konnte nicht gelesen werden oder ist derzeit nicht verfügbar.", fr: "Le solde n'a pas pu être lu ou est indisponible.", es: "No se pudo leer el saldo o no está disponible.", pt: "Não foi possível ler o saldo ou ele está indisponível.", th: "อ่านยอดคงเหลือไม่ได้หรือยังไม่พร้อมใช้งาน", id: "Saldo tidak dapat dibaca atau sedang tidak tersedia.", tr: "Bakiye okunamadı veya şu anda kullanılamıyor.", ru: "Не удалось прочитать баланс или он недоступен.", ar: "تعذّر قراءة الرصيد أو أنه غير متاح حاليًا." },
  "宿主没有提供默认权限设置。": { en: "This host does not provide default permission settings.", "zh-tw": "主機沒有提供預設權限設定。", ja: "このホストは既定の権限設定を提供していません。", ko: "이 호스트는 기본 권한 설정을 제공하지 않습니다.", de: "Dieser Host bietet keine Standardberechtigungen.", fr: "Cet hôte ne fournit pas de permissions par défaut.", es: "Este host no ofrece permisos predeterminados.", pt: "Este host não fornece permissões padrão.", th: "โฮสต์นี้ไม่ได้ให้การตั้งค่าสิทธิ์เริ่มต้น", id: "Host ini tidak menyediakan pengaturan izin default.", tr: "Bu host varsayılan izin ayarları sunmuyor.", ru: "Этот хост не предоставляет настройки разрешений по умолчанию.", ar: "لا يوفّر هذا المضيف إعدادات الأذونات الافتراضية." },
  "代码块": { en: "Code", "zh-tw": "程式碼", ja: "コード", ko: "코드", de: "Code", fr: "Code", es: "Código", pt: "Código", th: "โค้ด", id: "Kode", tr: "Kod", ru: "Код", ar: "شيفرة" },
  "复制代码": { en: "Copy code", "zh-tw": "複製程式碼", ja: "コードをコピー", ko: "코드 복사", de: "Code kopieren", fr: "Copier le code", es: "Copiar código", pt: "Copiar código", th: "คัดลอกโค้ด", id: "Salin kode", tr: "Kodu kopyala", ru: "Копировать код", ar: "نسخ الشيفرة" },
  "已复制": { en: "Copied", "zh-tw": "已複製", ja: "コピーしました", ko: "복사됨", de: "Kopiert", fr: "Copié", es: "Copiado", pt: "Copiado", th: "คัดลอกแล้ว", id: "Tersalin", tr: "Kopyalandı", ru: "Скопировано", ar: "تم النسخ" },
  "已在浏览器中打开登录页,完成后回到这里即可": { en: "Opened the sign-in page in your browser; come back here when you are done.", "zh-tw": "已在瀏覽器開啟登入頁,完成後回到這裡即可。", ja: "ブラウザーでサインインページを開きました。完了したらここに戻ってください。", ko: "브라우저에서 로그인 페이지를 열었습니다. 완료 후 여기로 돌아오세요.", de: "Anmeldeseite im Browser geöffnet; kehren Sie danach hierher zurück.", fr: "Page de connexion ouverte dans le navigateur ; revenez ici une fois terminé.", es: "Se abrió la página de inicio de sesión en el navegador; vuelve aquí al terminar.", pt: "A página de login foi aberta no navegador; volte aqui ao terminar.", th: "เปิดหน้าเข้าสู่ระบบในเบราว์เซอร์แล้ว กลับมาที่นี่เมื่อเสร็จ", id: "Halaman masuk dibuka di browser; kembali ke sini setelah selesai.", tr: "Oturum açma sayfası tarayıcıda açıldı; bitince buraya dönün.", ru: "Страница входа открыта в браузере; вернитесь сюда после завершения.", ar: "تم فتح صفحة تسجيل الدخول في المتصفح؛ عد إلى هنا بعد الانتهاء." },
  "登录流程已取消": { en: "Sign-in cancelled", "zh-tw": "登入流程已取消", ja: "サインインを取り消しました", ko: "로그인이 취소되었습니다", de: "Anmeldung abgebrochen", fr: "Connexion annulée", es: "Inicio de sesión cancelado", pt: "Login cancelado", th: "ยกเลิกการเข้าสู่ระบบแล้ว", id: "Proses masuk dibatalkan", tr: "Oturum açma iptal edildi", ru: "Вход отменён", ar: "أُلغيت عملية تسجيل الدخول" },
  "无法开始登录": { en: "Could not start sign-in", "zh-tw": "無法開始登入", ja: "サインインを開始できません", ko: "로그인을 시작할 수 없습니다", de: "Anmeldung konnte nicht gestartet werden", fr: "Impossible de démarrer la connexion", es: "No se pudo iniciar sesión", pt: "Não foi possível iniciar o login", th: "เริ่มการเข้าสู่ระบบไม่ได้", id: "Tidak dapat memulai proses masuk", tr: "Oturum açma başlatılamadı", ru: "Не удалось начать вход", ar: "تعذّر بدء تسجيل الدخول" },
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
  ui = ui.replace(anchor, `${anchor}\n  // ---- 账号卡片 / 代码块 / 设置分区(0.2.1 accountController) ----\n${lines}`);
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
