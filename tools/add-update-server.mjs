// 注册 dsh.updateServer 命令 + nls/bundle 文案键。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

// 1) package.json 命令
const pkg = JSON.parse(readFileSync(`${root}package.json`, "utf8"));
if (!pkg.contributes.commands.some((c) => c.command === "dsh.updateServer")) {
  pkg.contributes.commands.push({ command: "dsh.updateServer", title: "%cmd.updateServer.title%", icon: "$(cloud-download)" });
  writeFileSync(`${root}package.json`, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log("command added");
} else {
  console.log("command already present");
}

const NLS = {
  "cmd.updateServer.title": {
    en: "Update DSH server",
    "zh-cn": "升级 DSH 服务器",
    "zh-tw": "升級 DSH 伺服器",
    ja: "DSH サーバーを更新",
    ko: "DSH 서버 업데이트",
    de: "DSH-Server aktualisieren",
    fr: "Mettre à jour le serveur DSH",
    es: "Actualizar servidor DSH",
    pt: "Atualizar servidor DSH",
    th: "อัปเดตเซิร์ฟเวอร์ DSH",
    id: "Perbarui server DSH",
    tr: "DSH sunucusunu güncelle",
    ar: "تحديث خادم DSH",
    ru: "Обновить сервер DSH",
  },
};

const BUNDLES = {
  "server.updateConfirm": {
    en: "This stops the running server (if started by this extension) and reinstalls @deepseek-ai/dsh@latest into the extension's own directory. Continue?",
    "zh-cn": "这将停止正在运行的服务器(若由本扩展启动)并重新安装 @deepseek-ai/dsh@latest 到扩展自有目录。继续?",
    "zh-tw": "這將停止正在執行的伺服器(若由本擴充功能啟動)並重新安裝 @deepseek-ai/dsh@latest 到擴充功能自有目錄。繼續?",
    ja: "実行中のサーバー(この拡張機能が起動した場合)を停止し、@deepseek-ai/dsh@latest を拡張機能の専用ディレクトリに再インストールします。続行しますか?",
    ko: "실행 중인 서버(이 확장 프로그램이 시작한 경우)를 중지하고 @deepseek-ai/dsh@latest를 확장 프로그램 전용 디렉터리에 다시 설치합니다. 계속하시겠습니까?",
    de: "Der laufende Server (falls von dieser Erweiterung gestartet) wird gestoppt und @deepseek-ai/dsh@latest im eigenen Verzeichnis der Erweiterung neu installiert. Fortfahren?",
    fr: "Cela arrête le serveur en cours (s'il a été démarré par cette extension) et réinstalle @deepseek-ai/dsh@latest dans le répertoire propre de l'extension. Continuer ?",
    es: "Esto detiene el servidor en ejecución (si lo inició esta extensión) y reinstala @deepseek-ai/dsh@latest en el directorio propio de la extensión. ¿Continuar?",
    pt: "Isso interrompe o servidor em execução (se iniciado por esta extensão) e reinstala @deepseek-ai/dsh@latest no diretório próprio da extensão. Continuar?",
    th: "การดำเนินการนี้จะหยุดเซิร์ฟเวอร์ที่ทำงานอยู่ (หากเริ่มโดยส่วนขยายนี้) และติดตั้ง @deepseek-ai/dsh@latest ใหม่ในไดเรกทอรีของส่วนขยาย ดำเนินการต่อหรือไม่",
    id: "Ini menghentikan server yang berjalan (jika dimulai oleh ekstensi ini) dan menginstal ulang @deepseek-ai/dsh@latest ke direktori milik ekstensi. Lanjutkan?",
    tr: "Bu işlem çalışan sunucuyu (bu uzantı tarafından başlatıldıysa) durdurur ve @deepseek-ai/dsh@latest'i uzantının kendi dizinine yeniden kurar. Devam edilsin mi?",
    ar: "سيؤدي هذا إلى إيقاف الخادم قيد التشغيل (إذا كان قد بدأ بواسطة هذه الإضافة) وإعادة تثبيت @deepseek-ai/dsh@latest في دليل الإضافة الخاص. متابعة؟",
    ru: "Это остановит работающий сервер (если он запущен этим расширением) и переустановит @deepseek-ai/dsh@latest в собственный каталог расширения. Продолжить?",
  },
  "server.updateHint": {
    en: "The local DSH server is v{version}. New features (low reasoning effort, rc.8 command image input, etc.) require a newer server.",
    "zh-cn": "本地 DSH 服务器为 v{version}。新功能(low 推理强度、rc.8 命令图文输入等)需要更新版本的服务器。",
    "zh-tw": "本機 DSH 伺服器為 v{version}。新功能(low 推理強度、rc.8 命令圖文輸入等)需要更新版本的伺服器。",
    ja: "ローカルの DSH サーバーは v{version} です。新機能(low 推論強度、rc.8 コマンドの画像入力など)には新しいサーバーが必要です。",
    ko: "로컬 DSH 서버는 v{version}입니다. 새 기능(low 추론 강도, rc.8 명령 이미지 입력 등)에는 최신 서버가 필요합니다.",
    de: "Der lokale DSH-Server ist v{version}. Neue Funktionen (low Reasoning-Aufwand, rc.8 Befehls-Bildeingabe usw.) erfordern einen neueren Server.",
    fr: "Le serveur DSH local est v{version}. Les nouvelles fonctionnalités (effort de raisonnement low, saisie d'images de commandes rc.8, etc.) nécessitent un serveur plus récent.",
    es: "El servidor DSH local es v{version}. Las nuevas funciones (esfuerzo de razonamiento low, entrada de imágenes de comandos rc.8, etc.) requieren un servidor más reciente.",
    pt: "O servidor DSH local é v{version}. Novos recursos (esforço de raciocínio low, entrada de imagens de comandos rc.8 etc.) exigem um servidor mais recente.",
    th: "เซิร์ฟเวอร์ DSH ภายในเครื่องคือ v{version} ฟีเจอร์ใหม่ (low reasoning effort, การป้อนรูปภาพคำสั่ง rc.8 ฯลฯ) ต้องใช้เซิร์ฟเวอร์เวอร์ชันใหม่กว่า",
    id: "Server DSH lokal adalah v{version}. Fitur baru (upaya penalaran low, input gambar perintah rc.8, dll.) memerlukan server yang lebih baru.",
    tr: "Yerel DSH sunucusu v{version}. Yeni özellikler (low akıl yürütme çabası, rc.8 komut görsel girişi vb.) daha yeni bir sunucu gerektirir.",
    ar: "خادم DSH المحلي هو v{version}. تتطلب الميزات الجديدة (جهد التفكير low، إدخال صور الأوامر rc.8، إلخ) خادمًا أحدث.",
    ru: "Локальный сервер DSH — v{version}. Новые функции (усилие рассуждения low, ввод изображений в команды rc.8 и т. д.) требуют более новой версии сервера.",
  },
  "server.updateNow": {
    en: "Update now",
    "zh-cn": "立即升级",
    "zh-tw": "立即升級",
    ja: "今すぐ更新",
    ko: "지금 업데이트",
    de: "Jetzt aktualisieren",
    fr: "Mettre à jour maintenant",
    es: "Actualizar ahora",
    pt: "Atualizar agora",
    th: "อัปเดตตอนนี้",
    id: "Perbarui sekarang",
    tr: "Şimdi güncelle",
    ar: "تحديث الآن",
    ru: "Обновить сейчас",
  },
  "server.updating": {
    en: "Updating DSH server (downloads @deepseek-ai/dsh@latest)…",
    "zh-cn": "正在升级 DSH 服务器(下载 @deepseek-ai/dsh@latest)…",
    "zh-tw": "正在升級 DSH 伺服器(下載 @deepseek-ai/dsh@latest)…",
    ja: "DSH サーバーを更新中(@deepseek-ai/dsh@latest をダウンロード)…",
    ko: "DSH 서버 업데이트 중(@deepseek-ai/dsh@latest 다운로드)…",
    de: "DSH-Server wird aktualisiert (lädt @deepseek-ai/dsh@latest herunter)…",
    fr: "Mise à jour du serveur DSH (téléchargement de @deepseek-ai/dsh@latest)…",
    es: "Actualizando servidor DSH (descargando @deepseek-ai/dsh@latest)…",
    pt: "Atualizando servidor DSH (baixando @deepseek-ai/dsh@latest)…",
    th: "กำลังอัปเดตเซิร์ฟเวอร์ DSH (ดาวน์โหลด @deepseek-ai/dsh@latest)…",
    id: "Memperbarui server DSH (mengunduh @deepseek-ai/dsh@latest)…",
    tr: "DSH sunucusu güncelleniyor (@deepseek-ai/dsh@latest indiriliyor)…",
    ar: "جارٍ تحديث خادم DSH (تنزيل @deepseek-ai/dsh@latest)…",
    ru: "Обновление сервера DSH (загрузка @deepseek-ai/dsh@latest)…",
  },
  "server.updateFailed": {
    en: "DSH server update failed. See the Output log for details.",
    "zh-cn": "DSH 服务器升级失败,详情见输出日志。",
    "zh-tw": "DSH 伺服器升級失敗,詳情見輸出記錄。",
    ja: "DSH サーバーの更新に失敗しました。詳細は出力ログを参照してください。",
    ko: "DSH 서버 업데이트에 실패했습니다. 자세한 내용은 출력 로그를 참조하세요.",
    de: "DSH-Server-Update fehlgeschlagen. Details finden Sie im Ausgabelog.",
    fr: "Échec de la mise à jour du serveur DSH. Voir le journal de sortie.",
    es: "No se pudo actualizar el servidor DSH. Consulta el registro de salida.",
    pt: "Falha ao atualizar o servidor DSH. Consulte o log de saída.",
    th: "ไม่สามารถอัปเดตเซิร์ฟเวอร์ DSH ได้ ดูรายละเอียดในบันทึกเอาต์พุต",
    id: "Gagal memperbarui server DSH. Lihat log keluaran untuk detailnya.",
    tr: "DSH sunucusu güncellenemedi. Ayrıntılar için çıktı günlüğüne bakın.",
    ar: "فشل تحديث خادم DSH. راجع سجل الإخراج للتفاصيل.",
    ru: "Не удалось обновить сервер DSH. Подробности — в журнале вывода.",
  },
  "server.updated": {
    en: "DSH server updated and restarted.",
    "zh-cn": "DSH 服务器已升级并重新启动。",
    "zh-tw": "DSH 伺服器已升級並重新啟動。",
    ja: "DSH サーバーを更新して再起動しました。",
    ko: "DSH 서버가 업데이트되고 다시 시작되었습니다.",
    de: "DSH-Server aktualisiert und neu gestartet.",
    fr: "Serveur DSH mis à jour et redémarré.",
    es: "Servidor DSH actualizado y reiniciado.",
    pt: "Servidor DSH atualizado e reiniciado.",
    th: "อัปเดตและรีสตาร์ทเซิร์ฟเวอร์ DSH แล้ว",
    id: "Server DSH diperbarui dan dimulai ulang.",
    tr: "DSH sunucusu güncellendi ve yeniden başlatıldı.",
    ar: "تم تحديث خادم DSH وإعادة تشغيله.",
    ru: "Сервер DSH обновлён и перезапущен.",
  },
  "server.updateRestartFailed": {
    en: "DSH server updated, but restart failed: {message}",
    "zh-cn": "DSH 服务器已升级,但重启失败:{message}",
    "zh-tw": "DSH 伺服器已升級,但重新啟動失敗:{message}",
    ja: "DSH サーバーは更新されましたが、再起動に失敗しました:{message}",
    ko: "DSH 서버가 업데이트되었지만 다시 시작하지 못했습니다:{message}",
    de: "DSH-Server aktualisiert, aber Neustart fehlgeschlagen: {message}",
    fr: "Serveur DSH mis à jour, mais le redémarrage a échoué : {message}",
    es: "Servidor DSH actualizado, pero el reinicio falló: {message}",
    pt: "Servidor DSH atualizado, mas a reinicialização falhou: {message}",
    th: "อัปเดตเซิร์ฟเวอร์ DSH แล้ว แต่การรีสตาร์ทล้มเหลว:{message}",
    id: "Server DSH diperbarui, tetapi mulai ulang gagal:{message}",
    tr: "DSH sunucusu güncellendi ancak yeniden başlatılamadı:{message}",
    ar: "تم تحديث خادم DSH، لكن فشلت إعادة التشغيل:{message}",
    ru: "Сервер DSH обновлён, но перезапуск не удался: {message}",
  },
};

const bundleLangs = ["en", "zh-cn", "zh-tw", "ja", "ko", "de", "fr", "es", "pt", "th", "id", "tr", "ar", "ru"];
let changed = 0;
for (const lang of bundleLangs) {
  const file = lang === "en" ? `${root}l10n/bundle.l10n.json` : `${root}l10n/bundle.l10n.${lang}.json`;
  const obj = JSON.parse(readFileSync(file, "utf8"));
  let added = 0;
  for (const [key, values] of Object.entries(BUNDLES)) {
    if (obj[key] === undefined) {
      obj[key] = values[lang];
      added++;
    }
  }
  if (added) {
    writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
    changed++;
    console.log(`bundle.l10n.${lang}.json: +${added}`);
  }
  const nlsFile = lang === "en" ? `${root}package.nls.json` : `${root}package.nls.${lang}.json`;
  let raw = readFileSync(nlsFile, "utf8");
  const bom = raw.charCodeAt(0) === 0xfeff;
  const nlsObj = JSON.parse(bom ? raw.slice(1) : raw);
  if (nlsObj["cmd.updateServer.title"] === undefined) {
    nlsObj["cmd.updateServer.title"] = NLS["cmd.updateServer.title"][lang];
    writeFileSync(nlsFile, (bom ? "\ufeff" : "") + JSON.stringify(nlsObj, null, 2) + "\n", "utf8");
    changed++;
    console.log(`package.nls.${lang}.json: +1`);
  }
}
console.log(`\ndone, ${changed} files touched`);
