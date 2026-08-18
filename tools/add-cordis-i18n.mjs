// Cordis 面板移植:i18n 补齐。
// 1) texts/*.json(12 语言):新增聊天浮窗审批卡 + 面板用文案键(中文源串为键)
// 2) l10n/bundle.l10n.*.json(13 语言):cordis.* 宿主提示键
// 3) package.nls.*.json(14 语言):cmd.openCordisPanel.title
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const TEXTS = {
  "Cordis 插件": { "zh-tw": "Cordis 外掛程式", ja: "Cordis プラグイン", ko: "Cordis 플러그인", de: "Cordis-Plugins", fr: "Plugins Cordis", es: "Plugins Cordis", pt: "Plugins Cordis", th: "ปลั๊กอิน Cordis", id: "Plugin Cordis", tr: "Cordis eklentileri", ar: "إضافات Cordis", ru: "Плагины Cordis" },
  "Cordis 插件({n} 个待审批)": { "zh-tw": "Cordis 外掛程式({n} 個待審批)", ja: "Cordis プラグイン({n} 件承認待ち)", ko: "Cordis 플러그인({n}개 승인 대기)", de: "Cordis-Plugins ({n} Genehmigungen ausstehend)", fr: "Plugins Cordis ({n} en attente d'approbation)", es: "Plugins Cordis ({n} pendientes de aprobación)", pt: "Plugins Cordis ({n} aguardando aprovação)", th: "ปลั๊กอิน Cordis ({n} รายรออนุมัติ)", id: "Plugin Cordis ({n} menunggu persetujuan)", tr: "Cordis eklentileri ({n} onay bekliyor)", ar: "إضافات Cordis ({n} بانتظار الموافقة)", ru: "Плагины Cordis ({n} ожидают одобрения)" },
  "Cordis 插件审批": { "zh-tw": "Cordis 外掛程式審批", ja: "Cordis プラグインの承認", ko: "Cordis 플러그인 승인", de: "Cordis-Plugin-Genehmigung", fr: "Approbation de plugin Cordis", es: "Aprobación de plugin Cordis", pt: "Aprovação de plugin Cordis", th: "การอนุมัติปลั๊กอิน Cordis", id: "Persetujuan plugin Cordis", tr: "Cordis eklentisi onayı", ar: "الموافقة على إضافة Cordis", ru: "Одобрение плагина Cordis" },
  "(未填写用途)": { "zh-tw": "(未填寫用途)", ja: "(用途未設定)", ko: "(용도 미기재)", de: "(kein Zweck angegeben)", fr: "(aucun objectif indiqué)", es: "(sin propósito indicado)", pt: "(nenhum objetivo informado)", th: "(ไม่ได้ระบุวัตถุประสงค์)", id: "(tujuan tidak diisi)", tr: "(amaç belirtilmedi)", ar: "(لم يُحدد الغرض)", ru: "(назначение не указано)" },
  "未填写用途": { "zh-tw": "未填寫用途", ja: "用途が未設定です", ko: "용도 미기재", de: "Kein Zweck angegeben", fr: "Aucun objectif indiqué", es: "Sin propósito indicado", pt: "Nenhum objetivo informado", th: "ไม่ได้ระบุวัตถุประสงค์", id: "Tujuan tidak diisi", tr: "Amaç belirtilmedi", ar: "لم يُحدد الغرض", ru: "Назначение не указано" },
  "仅允许此版本": { "zh-tw": "僅允許此版本", ja: "このバージョンのみ許可", ko: "이 버전만 허용", de: "Nur diese Version erlauben", fr: "Autoriser uniquement cette version", es: "Permitir solo esta versión", pt: "Permitir apenas esta versão", th: "อนุญาตเฉพาะเวอร์ชันนี้", id: "Izinkan hanya versi ini", tr: "Yalnızca bu sürüme izin ver", ar: "السماح بهذا الإصدار فقط", ru: "Разрешить только эту версию" },
  "允许后续版本": { "zh-tw": "允許後續版本", ja: "今後のバージョンを許可", ko: "향후 버전 허용", de: "Zukünftige Versionen erlauben", fr: "Autoriser les versions futures", es: "Permitir versiones futuras", pt: "Permitir versões futuras", th: "อนุญาตเวอร์ชันถัดไป", id: "Izinkan versi mendatang", tr: "Gelecek sürümlere izin ver", ar: "السماح بالإصدارات المستقبلية", ru: "Разрешить будущие версии" },
  "仅授权当前版本运行,后续版本更新时需再次审批": { "zh-tw": "僅授權目前版本執行,後續版本更新時需再次審批", ja: "現在のバージョンのみ実行を許可します。今後の更新時は再度承認が必要です", ko: "현재 버전만 실행을 허용하며, 이후 업데이트 시 다시 승인해야 합니다", de: "Nur die aktuelle Version darf laufen; künftige Updates fragen erneut nach", fr: "Autorise uniquement la version actuelle ; les futures mises à jour demanderont à nouveau", es: "Solo permite ejecutar la versión actual; las actualizaciones futuras volverán a preguntar", pt: "Permite apenas a versão atual; atualizações futuras pedirão aprovação novamente", th: "อนุญาตเฉพาะเวอร์ชันปัจจุบัน การอัปเดตถัดไปจะต้องขออนุมัติอีกครั้ง", id: "Hanya mengizinkan versi saat ini; pembaruan berikutnya akan meminta persetujuan lagi", tr: "Yalnızca mevcut sürümün çalışmasına izin verir; sonraki güncellemeler tekrar onay ister", ar: "يسمح فقط بالإصدار الحالي؛ التحديثات المستقبلية ستطلب الموافقة مجددًا", ru: "Разрешает только текущую версию; будущие обновления снова запросят одобрение" },
  "授权此插件的所有后续版本自动运行,无需再次审批": { "zh-tw": "授權此外掛程式的所有後續版本自動執行,無需再次審批", ja: "このプラグインの今後の全バージョンを自動実行し、再度の承認は不要にします", ko: "이 플러그인의 향후 모든 버전을 자동 실행하며 다시 승인할 필요가 없습니다", de: "Erlaubt alle künftigen Versionen dieses Plugins automatisch ohne erneute Genehmigung", fr: "Autorise toutes les versions futures de ce plugin automatiquement, sans nouvelle approbation", es: "Permite ejecutar automáticamente todas las versiones futuras de este plugin sin volver a preguntar", pt: "Permite executar automaticamente todas as versões futuras deste plugin sem nova aprovação", th: "อนุญาตให้เวอร์ชันถัดไปทั้งหมดของปลั๊กอินนี้ทำงานอัตโนมัติโดยไม่ต้องอนุมัติอีก", id: "Mengizinkan semua versi mendatang plugin ini berjalan otomatis tanpa persetujuan lagi", tr: "Bu eklentinin gelecekteki tüm sürümlerinin yeniden onay gerektirmeden otomatik çalışmasına izin verir", ar: "يسمح بتشغيل جميع الإصدارات المستقبلية لهذه الإضافة تلقائيًا دون موافقة إضافية", ru: "Разрешает автоматический запуск всех будущих версий этого плагина без повторного одобрения" },
  "更新": { "zh-tw": "更新", ja: "更新", ko: "업데이트", de: "Aktualisieren", fr: "Mettre à jour", es: "Actualizar", pt: "Atualizar", th: "อัปเดต", id: "Perbarui", tr: "Güncelle", ar: "تحديث", ru: "Обновить" },
  "运行中 ({n})": { "zh-tw": "執行中 ({n})", ja: "実行中 ({n})", ko: "실행 중 ({n})", de: "{n} läuft", fr: "{n} en cours", es: "{n} en ejecución", pt: "{n} em execução", th: "กำลังทำงาน ({n})", id: "{n} berjalan", tr: "{n} çalışıyor", ar: "قيد التشغيل ({n})", ru: "Выполняется ({n})" },
  "当前会话": { "zh-tw": "目前工作階段", ja: "現在のセッション", ko: "현재 세션", de: "Diese Sitzung", fr: "Cette session", es: "Esta sesión", pt: "Esta sessão", th: "เซสชันปัจจุบัน", id: "Sesi ini", tr: "Bu oturum", ar: "الجلسة الحالية", ru: "Текущая сессия" },
  "其他会话": { "zh-tw": "其他工作階段", ja: "その他のセッション", ko: "다른 세션", de: "Andere Sitzungen", fr: "Autres sessions", es: "Otras sesiones", pt: "Outras sessões", th: "เซสชันอื่น", id: "Sesi lain", tr: "Diğer oturumlar", ar: "جلسات أخرى", ru: "Другие сессии" },
  "版本": { "zh-tw": "版本", ja: "バージョン", ko: "버전", de: "Version", fr: "Version", es: "Versión", pt: "Versão", th: "เวอร์ชัน", id: "Versi", tr: "Sürüm", ar: "الإصدار", ru: "Версия" },
  "当前:{packageId}": { "zh-tw": "目前:{packageId}", ja: "現在:{packageId}", ko: "현재:{packageId}", de: "Aktuell: {packageId}", fr: "Actuelle : {packageId}", es: "Actual: {packageId}", pt: "Atual: {packageId}", th: "ปัจจุบัน:{packageId}", id: "Saat ini:{packageId}", tr: "Geçerli:{packageId}", ar: "الحالي:{packageId}", ru: "Текущая: {packageId}" },
  "待审批": { "zh-tw": "待審批", ja: "承認待ち", ko: "승인 대기", de: "Genehmigung ausstehend", fr: "En attente d'approbation", es: "Pendiente de aprobación", pt: "Aguardando aprovação", th: "รออนุมัติ", id: "Menunggu persetujuan", tr: "Onay bekliyor", ar: "بانتظار الموافقة", ru: "Ожидает одобрения" },
  "等待": { "zh-tw": "等待", ja: "待機中", ko: "대기 중", de: "Wartet", fr: "En attente", es: "En espera", pt: "Aguardando", th: "กำลังรอ", id: "Menunggu", tr: "Bekleniyor", ar: "في انتظار", ru: "Ожидание" },
  "启动中": { "zh-tw": "啟動中", ja: "起動中", ko: "시작 중", de: "Wird gestartet", fr: "Démarrage", es: "Iniciando", pt: "Iniciando", th: "กำลังเริ่มต้น", id: "Memulai", tr: "Başlatılıyor", ar: "جارٍ التشغيل", ru: "Запуск" },
  "Client 待激活": { "zh-tw": "Client 待啟用", ja: "Client アクティブ化待ち", ko: "Client 활성화 대기", de: "Client wartet auf Aktivierung", fr: "Client prêt à s'activer", es: "Cliente por activar", pt: "Cliente pronto para ativar", th: "Client รอเปิดใช้งาน", id: "Client siap diaktifkan", tr: "Client etkinleştirilmeyi bekliyor", ar: "Client بانتظار التفعيل", ru: "Client ожидает активации" },
  "已停止": { "zh-tw": "已停止", ja: "停止済み", ko: "중지됨", de: "Gestoppt", fr: "Arrêté", es: "Detenido", pt: "Parado", th: "หยุดแล้ว", id: "Dihentikan", tr: "Durduruldu", ar: "متوقف", ru: "Остановлен" },
  "已拒绝": { "zh-tw": "已拒絕", ja: "拒否済み", ko: "거부됨", de: "Abgelehnt", fr: "Refusé", es: "Rechazado", pt: "Recusado", th: "ถูกปฏิเสธ", id: "Ditolak", tr: "Reddedildi", ar: "مرفوض", ru: "Отклонён" },
  "已取消": { "zh-tw": "已取消", ja: "キャンセル済み", ko: "취소됨", de: "Abgebrochen", fr: "Annulé", es: "Cancelado", pt: "Cancelado", th: "ถูกยกเลิก", id: "Dibatalkan", tr: "İptal edildi", ar: "ملغى", ru: "Отменён" },
  "运行失败": { "zh-tw": "執行失敗", ja: "実行失敗", ko: "실행 실패", de: "Lauf fehlgeschlagen", fr: "Échec de l'exécution", es: "Error al ejecutar", pt: "Falha na execução", th: "การทำงานล้มเหลว", id: "Gagal menjalankan", tr: "Çalıştırma başarısız", ar: "فشل التشغيل", ru: "Сбой выполнения" },
  "待激活": { "zh-tw": "待啟用", ja: "アクティブ化待ち", ko: "활성화 대기", de: "Bereit", fr: "Prêt à s'activer", es: "Por activar", pt: "Pronto para ativar", th: "รอเปิดใช้งาน", id: "Siap diaktifkan", tr: "Etkinleştirilmeyi bekliyor", ar: "بانتظار التفعيل", ru: "Ожидает активации" },
  "已移除": { "zh-tw": "已移除", ja: "削除済み", ko: "제거됨", de: "Entfernt", fr: "Supprimé", es: "Eliminado", pt: "Removido", th: "ถูกลบ", id: "Dihapus", tr: "Kaldırıldı", ar: "تمت الإزالة", ru: "Удалён" },
  "停止": { "zh-tw": "停止", ja: "停止", ko: "중지", de: "Stoppen", fr: "Arrêter", es: "Detener", pt: "Parar", th: "หยุด", id: "Hentikan", tr: "Durdur", ar: "إيقاف", ru: "Остановить" },
  "运行": { "zh-tw": "執行", ja: "実行", ko: "실행", de: "Ausführen", fr: "Exécuter", es: "Ejecutar", pt: "Executar", th: "ทำงาน", id: "Jalankan", tr: "Çalıştır", ar: "تشغيل", ru: "Запустить" },
  "运行此版本": { "zh-tw": "執行此版本", ja: "このバージョンを実行", ko: "이 버전 실행", de: "Diese Version ausführen", fr: "Exécuter cette version", es: "Ejecutar esta versión", pt: "Executar esta versão", th: "ทำงานเวอร์ชันนี้", id: "Jalankan versi ini", tr: "Bu sürümü çalıştır", ar: "تشغيل هذا الإصدار", ru: "Запустить эту версию" },
  "还没有定义任何插件": { "zh-tw": "尚未定義任何外掛程式", ja: "プラグインはまだ定義されていません", ko: "아직 정의된 플러그인이 없습니다", de: "Noch keine Plugins definiert", fr: "Aucun plugin défini pour l'instant", es: "Aún no hay plugins definidos", pt: "Nenhum plugin definido ainda", th: "ยังไม่มีปลั๊กอินที่กำหนด", id: "Belum ada plugin yang didefinisikan", tr: "Henüz tanımlanmış eklenti yok", ar: "لا توجد إضافات محددة بعد", ru: "Плагины ещё не определены" },
  "读取插件清单失败:{message}": { "zh-tw": "讀取外掛程式清單失敗:{message}", ja: "プラグイン一覧の読み取りに失敗しました:{message}", ko: "플러그인 목록을 읽지 못했습니다:{message}", de: "Lesen der Plugin-Liste fehlgeschlagen: {message}", fr: "Échec de lecture de la liste des plugins : {message}", es: "No se pudo leer la lista de plugins: {message}", pt: "Falha ao ler a lista de plugins: {message}", th: "ไม่สามารถอ่านรายการปลั๊กอินได้:{message}", id: "Gagal membaca daftar plugin:{message}", tr: "Eklenti listesi okunamadı:{message}", ar: "فشل قراءة قائمة الإضافات:{message}", ru: "Не удалось прочитать список плагинов: {message}" },
  "Client 半段仅在网页端生效": { "zh-tw": "Client 半段僅在網頁端生效", ja: "Client 側はウェブ版でのみ有効です", ko: "Client 반쪽은 웹에서만 적용됩니다", de: "Die Client-Hälfte wirkt nur in der Web-Oberfläche", fr: "La moitié Client ne s'applique que dans l'interface web", es: "La mitad Client solo tiene efecto en la interfaz web", pt: "A metade Client só tem efeito na interface web", th: "ส่วน Client มีผลเฉพาะในเว็บเท่านั้น", id: "Bagian Client hanya berlaku di antarmuka web", tr: "Client yarısı yalnızca web arayüzünde etkilidir", ar: "جزء Client يسري فقط في واجهة الويب", ru: "Клиентская половина действует только в веб-интерфейсе" },
  "再次点击确认移除": { "zh-tw": "再次點擊確認移除", ja: "もう一度クリックして削除を確定", ko: "다시 클릭하여 제거 확인", de: "Erneut klicken zum Bestätigen", fr: "Cliquez à nouveau pour confirmer", es: "Haz clic de nuevo para confirmar", pt: "Clique novamente para confirmar", th: "คลิกอีกครั้งเพื่อยืนยันการลบ", id: "Klik lagi untuk mengonfirmasi", tr: "Kaldırmayı onaylamak için tekrar tıklayın", ar: "انقر مجددًا لتأكيد الإزالة", ru: "Нажмите ещё раз для подтверждения" },
  "Host": { "zh-tw": "Host", ja: "Host", ko: "Host", de: "Host", fr: "Host", es: "Host", pt: "Host", th: "Host", id: "Host", tr: "Host", ar: "Host", ru: "Host" },
  "Client": { "zh-tw": "Client", ja: "Client", ko: "Client", de: "Client", fr: "Client", es: "Client", pt: "Client", th: "Client", id: "Client", tr: "Client", ar: "Client", ru: "Client" },
};

const BUNDLES = {
  "cordis.approved": {
    en: "Plugin approved and started",
    "zh-cn": "插件已授权并启动",
    "zh-tw": "外掛程式已授權並啟動",
    ja: "プラグインを承認して起動しました",
    ko: "플러그인이 승인되고 시작되었습니다",
    de: "Plugin genehmigt und gestartet",
    fr: "Plugin approuvé et démarré",
    es: "Plugin aprobado y ejecutado",
    pt: "Plugin aprovado e iniciado",
    th: "อนุมัติปลั๊กอินและเริ่มทำงานแล้ว",
    id: "Plugin disetujui dan dijalankan",
    tr: "Eklenti onaylandı ve başlatıldı",
    ar: "تمت الموافقة على الإضافة وتشغيلها",
    ru: "Плагин одобрен и запущен",
  },
  "cordis.approveFailed": {
    en: "Plugin approval failed: {message}",
    "zh-cn": "插件授权失败:{message}",
    "zh-tw": "外掛程式授權失敗:{message}",
    ja: "プラグインの承認に失敗しました:{message}",
    ko: "플러그인 승인 실패:{message}",
    de: "Plugin-Genehmigung fehlgeschlagen: {message}",
    fr: "Échec de l'approbation du plugin : {message}",
    es: "Error al aprobar el plugin: {message}",
    pt: "Falha ao aprovar o plugin: {message}",
    th: "ไม่สามารถอนุมัติปลั๊กอินได้:{message}",
    id: "Gagal menyetujui plugin:{message}",
    tr: "Eklenti onayı başarısız:{message}",
    ar: "فشل الموافقة على الإضافة:{message}",
    ru: "Не удалось одобрить плагин: {message}",
  },
  "cordis.rejectFailed": {
    en: "Declining the plugin failed: {message}",
    "zh-cn": "拒绝插件失败:{message}",
    "zh-tw": "拒絕外掛程式失敗:{message}",
    ja: "プラグインの拒否に失敗しました:{message}",
    ko: "플러그인 거부 실패:{message}",
    de: "Ablehnen des Plugins fehlgeschlagen: {message}",
    fr: "Échec du refus du plugin : {message}",
    es: "Error al rechazar el plugin: {message}",
    pt: "Falha ao recusar o plugin: {message}",
    th: "ไม่สามารถปฏิเสธปลั๊กอินได้:{message}",
    id: "Gagal menolak plugin:{message}",
    tr: "Eklenti reddedilemedi:{message}",
    ar: "فشل رفض الإضافة:{message}",
    ru: "Не удалось отклонить плагин: {message}",
  },
  "cordis.panelFailed": {
    en: "Opening the Cordis panel failed: {message}",
    "zh-cn": "打开 Cordis 面板失败:{message}",
    "zh-tw": "開啟 Cordis 面板失敗:{message}",
    ja: "Cordis パネルを開けませんでした:{message}",
    ko: "Cordis 패널을 열지 못했습니다:{message}",
    de: "Öffnen des Cordis-Bedienfelds fehlgeschlagen: {message}",
    fr: "Échec de l'ouverture du panneau Cordis : {message}",
    es: "No se pudo abrir el panel Cordis: {message}",
    pt: "Falha ao abrir o painel Cordis: {message}",
    th: "ไม่สามารถเปิดแผง Cordis ได้:{message}",
    id: "Gagal membuka panel Cordis:{message}",
    tr: "Cordis paneli açılamadı:{message}",
    ar: "فشل فتح لوحة Cordis:{message}",
    ru: "Не удалось открыть панель Cordis: {message}",
  },
  "cordis.panelTitle": {
    en: "Cordis plugins",
    "zh-cn": "Cordis 插件",
    "zh-tw": "Cordis 外掛程式",
    ja: "Cordis プラグイン",
    ko: "Cordis 플러그인",
    de: "Cordis-Plugins",
    fr: "Plugins Cordis",
    es: "Plugins Cordis",
    pt: "Plugins Cordis",
    th: "ปลั๊กอิน Cordis",
    id: "Plugin Cordis",
    tr: "Cordis eklentileri",
    ar: "إضافات Cordis",
    ru: "Плагины Cordis",
  },
  "cordis.inventoryFailed": {
    en: "Reading the plugin inventory failed: {message}",
    "zh-cn": "读取插件清单失败:{message}",
    "zh-tw": "讀取外掛程式清單失敗:{message}",
    ja: "プラグイン一覧の読み取りに失敗しました:{message}",
    ko: "플러그인 목록을 읽지 못했습니다:{message}",
    de: "Lesen der Plugin-Liste fehlgeschlagen: {message}",
    fr: "Échec de lecture de la liste des plugins : {message}",
    es: "No se pudo leer la lista de plugins: {message}",
    pt: "Falha ao ler a lista de plugins: {message}",
    th: "ไม่สามารถอ่านรายการปลั๊กอินได้:{message}",
    id: "Gagal membaca daftar plugin:{message}",
    tr: "Eklenti listesi okunamadı:{message}",
    ar: "فشل قراءة قائمة الإضافات:{message}",
    ru: "Не удалось прочитать список плагинов: {message}",
  },
  "cordis.requestGone": {
    en: "This run request is no longer pending",
    "zh-cn": "该运行请求已不再待审批",
    "zh-tw": "此執行請求已不再待審批",
    ja: "この実行リクエストは承認待ちではなくなりました",
    ko: "이 실행 요청은 더 이상 승인 대기 상태가 아닙니다",
    de: "Diese Ausführungsanfrage ist nicht mehr ausstehend",
    fr: "Cette demande d'exécution n'est plus en attente",
    es: "Esta solicitud de ejecución ya no está pendiente",
    pt: "Esta solicitação de execução não está mais pendente",
    th: "คำขอการทำงานนี้ไม่อยู่ในสถานะรออนุมัติแล้ว",
    id: "Permintaan eksekusi ini tidak lagi menunggu persetujuan",
    tr: "Bu çalıştırma isteği artık beklemede değil",
    ar: "لم يعد طلب التشغيل هذا قيد الانتظار",
    ru: "Этот запрос на запуск больше не ожидает одобрения",
  },
  "cordis.started": {
    en: "Plugin run started",
    "zh-cn": "插件运行已启动",
    "zh-tw": "外掛程式執行已啟動",
    ja: "プラグインの実行を開始しました",
    ko: "플러그인 실행이 시작되었습니다",
    de: "Plugin-Lauf gestartet",
    fr: "Exécution du plugin démarrée",
    es: "Se inició la ejecución del plugin",
    pt: "Execução do plugin iniciada",
    th: "เริ่มการทำงานปลั๊กอินแล้ว",
    id: "Eksekusi plugin dimulai",
    tr: "Eklenti çalıştırması başlatıldı",
    ar: "بدأ تشغيل الإضافة",
    ru: "Запуск плагина начат",
  },
  "cordis.runFailed": {
    en: "Running the plugin failed: {message}",
    "zh-cn": "运行插件失败:{message}",
    "zh-tw": "執行外掛程式失敗:{message}",
    ja: "プラグインの実行に失敗しました:{message}",
    ko: "플러그인 실행 실패:{message}",
    de: "Ausführen des Plugins fehlgeschlagen: {message}",
    fr: "Échec de l'exécution du plugin : {message}",
    es: "Error al ejecutar el plugin: {message}",
    pt: "Falha ao executar o plugin: {message}",
    th: "ไม่สามารถเรียกใช้ปลั๊กอินได้:{message}",
    id: "Gagal menjalankan plugin:{message}",
    tr: "Eklenti çalıştırılamadı:{message}",
    ar: "فشل تشغيل الإضافة:{message}",
    ru: "Не удалось запустить плагин: {message}",
  },
  "cordis.stopFailed": {
    en: "Stopping the plugin failed: {message}",
    "zh-cn": "停止插件失败:{message}",
    "zh-tw": "停止外掛程式失敗:{message}",
    ja: "プラグインの停止に失敗しました:{message}",
    ko: "플러그인 중지 실패:{message}",
    de: "Stoppen des Plugins fehlgeschlagen: {message}",
    fr: "Échec de l'arrêt du plugin : {message}",
    es: "Error al detener el plugin: {message}",
    pt: "Falha ao parar o plugin: {message}",
    th: "ไม่สามารถหยุดปลั๊กอินได้:{message}",
    id: "Gagal menghentikan plugin:{message}",
    tr: "Eklenti durdurulamadı:{message}",
    ar: "فشل إيقاف الإضافة:{message}",
    ru: "Не удалось остановить плагин: {message}",
  },
  "cordis.removed": {
    en: "Plugin removed",
    "zh-cn": "插件已移除",
    "zh-tw": "外掛程式已移除",
    ja: "プラグインを削除しました",
    ko: "플러그인이 제거되었습니다",
    de: "Plugin entfernt",
    fr: "Plugin supprimé",
    es: "Plugin eliminado",
    pt: "Plugin removido",
    th: "ลบปลั๊กอินแล้ว",
    id: "Plugin dihapus",
    tr: "Eklenti kaldırıldı",
    ar: "تمت إزالة الإضافة",
    ru: "Плагин удалён",
  },
  "cordis.removeFailed": {
    en: "Removing the plugin failed: {message}",
    "zh-cn": "移除插件失败:{message}",
    "zh-tw": "移除外掛程式失敗:{message}",
    ja: "プラグインの削除に失敗しました:{message}",
    ko: "플러그인 제거 실패:{message}",
    de: "Entfernen des Plugins fehlgeschlagen: {message}",
    fr: "Échec de la suppression du plugin : {message}",
    es: "Error al eliminar el plugin: {message}",
    pt: "Falha ao remover o plugin: {message}",
    th: "ไม่สามารถลบปลั๊กอินได้:{message}",
    id: "Gagal menghapus plugin:{message}",
    tr: "Eklenti kaldırılamadı:{message}",
    ar: "فشل إزالة الإضافة:{message}",
    ru: "Не удалось удалить плагин: {message}",
  },
};

const NLS = {
  "cmd.openCordisPanel.title": {
    en: "Open Cordis plugins panel",
    "zh-cn": "打开 Cordis 插件面板",
    "zh-tw": "開啟 Cordis 外掛程式面板",
    ja: "Cordis プラグインパネルを開く",
    ko: "Cordis 플러그인 패널 열기",
    de: "Cordis-Plugins-Bedienfeld öffnen",
    fr: "Ouvrir le panneau des plugins Cordis",
    es: "Abrir el panel de plugins Cordis",
    pt: "Abrir o painel de plugins Cordis",
    th: "เปิดแผงปลั๊กอิน Cordis",
    id: "Buka panel plugin Cordis",
    tr: "Cordis eklenti panelini aç",
    ar: "فتح لوحة إضافات Cordis",
    ru: "Открыть панель плагинов Cordis",
  },
};

const langs = ["zh-tw", "ja", "ko", "de", "fr", "es", "pt", "th", "id", "tr", "ar", "ru"];
let changed = 0;

// 1) texts/*.json
for (const lang of langs) {
  const file = `${root}src/webview/texts/${lang}.json`;
  const obj = JSON.parse(readFileSync(file, "utf8"));
  let added = 0;
  for (const [key, values] of Object.entries(TEXTS)) {
    if (obj[key] === undefined) {
      obj[key] = values[lang];
      added++;
    } else {
      console.log(`texts/${lang}.json: "${key}" already present`);
    }
  }
  if (added) {
    writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
    changed++;
    console.log(`texts/${lang}.json: +${added}`);
  }
}

// 2) bundle.l10n.*.json
const bundleLangs = ["en", "zh-cn", "zh-tw", "ja", "ko", "de", "fr", "es", "pt", "th", "id", "tr", "ar", "ru"];
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
}

// 3) package.nls.*.json
for (const lang of bundleLangs) {
  const file = lang === "en" ? `${root}package.nls.json` : `${root}package.nls.${lang}.json`;
  let raw = readFileSync(file, "utf8");
  const bom = raw.charCodeAt(0) === 0xfeff;
  const body = bom ? raw.slice(1) : raw;
  const obj = JSON.parse(body);
  let added = 0;
  for (const [key, values] of Object.entries(NLS)) {
    if (obj[key] === undefined) {
      obj[key] = values[lang];
      added++;
    }
  }
  if (added) {
    writeFileSync(file, (bom ? "\ufeff" : "") + JSON.stringify(obj, null, 2) + "\n", "utf8");
    changed++;
    console.log(`package.nls.${lang}.json: +${added}`);
  }
}

console.log(`\ndone, ${changed} files touched`);
