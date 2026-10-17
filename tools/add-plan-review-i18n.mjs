/**
 * 0.13.43:计划审阅相关文案(查看全文 / 计划预览 / 关闭审阅补充意见 / 计划模式切换中)。
 * Webview 词典 12 语言;中文为源键。只追加缺失键。
 */
import fs from "node:fs";
import path from "node:path";

const root = "D:/Workspace/vscode";

const WEBVIEW = {
  "查看全文": {
    "zh-tw": "檢視全文", ja: "全文を表示", ko: "전문 보기", de: "Volltext anzeigen",
    fr: "Voir le texte intégral", es: "Ver texto completo", pt: "Ver texto completo",
    th: "ดูข้อความทั้งหมด", id: "Lihat teks lengkap", tr: "Tam metni gör",
    ru: "Показать полностью", ar: "عرض النص الكامل",
  },
  "在整页预览中查看完整计划": {
    "zh-tw": "在整頁預覽中檢視完整計畫", ja: "全画面プレビューで計画全体を表示",
    ko: "전체 화면 미리보기에서 계획 전체 보기",
    de: "Den vollständigen Plan in einer Ganzseiten-Vorschau lesen",
    fr: "Lire le plan complet dans un aperçu pleine page",
    es: "Leer el plan completo en una vista previa de página completa",
    pt: "Ler o plano completo em uma prévia de página inteira",
    th: "อ่านแผนฉบับเต็มในหน้าต่างตัวอย่างเต็มหน้า",
    id: "Baca rencana lengkap di pratinjau satu halaman",
    tr: "Planın tamamını tam sayfa önizlemede oku",
    ru: "Читать план целиком в полноэкранном просмотре",
    ar: "اقرأ الخطة كاملة في معاينة بصفحة كاملة",
  },
  "计划预览": {
    "zh-tw": "計畫預覽", ja: "計画プレビュー", ko: "계획 미리보기", de: "Planvorschau",
    fr: "Aperçu du plan", es: "Vista previa del plan", pt: "Prévia do plano",
    th: "ตัวอย่างแผน", id: "Pratinjau rencana", tr: "Plan önizlemesi",
    ru: "Просмотр плана", ar: "معاينة الخطة",
  },
  "打开计划文件": {
    "zh-tw": "開啟計畫檔案", ja: "計画ファイルを開く", ko: "계획 파일 열기", de: "Plandatei öffnen",
    fr: "Ouvrir le fichier du plan", es: "Abrir archivo del plan", pt: "Abrir arquivo do plano",
    th: "เปิดไฟล์แผน", id: "Buka berkas rencana", tr: "Plan dosyasını aç",
    ru: "Открыть файл плана", ar: "فتح ملف الخطة",
  },
  "没有可显示的计划内容": {
    "zh-tw": "沒有可顯示的計畫內容", ja: "表示できる計画内容がありません", ko: "표시할 계획 내용이 없습니다",
    de: "Kein Planinhalt zum Anzeigen", fr: "Aucun contenu de plan à afficher",
    es: "No hay contenido de plan para mostrar", pt: "Não há conteúdo de plano para exibir",
    th: "ไม่มีเนื้อหาแผนให้แสดง", id: "Tidak ada isi rencana untuk ditampilkan",
    tr: "Gösterilecek plan içeriği yok", ru: "Нет содержимого плана для отображения",
    ar: "لا يوجد محتوى خطة لعرضه",
  },
  "关闭审阅,去补充意见": {
    "zh-tw": "關閉審閱,去補充意見", ja: "レビューを閉じてコメントを追加", ko: "검토 닫고 의견 추가",
    de: "Prüfung schließen und Anmerkungen ergänzen", fr: "Fermer la revue et ajouter des remarques",
    es: "Cerrar la revisión y añadir comentarios", pt: "Fechar a revisão e adicionar comentários",
    th: "ปิดการตรวจทานแล้วเพิ่มความเห็น", id: "Tutup tinjauan dan tambahkan komentar",
    tr: "İncelemeyi kapat ve yorum ekle", ru: "Закрыть проверку и добавить замечания",
    ar: "إغلاق المراجعة وإضافة ملاحظات",
  },
  "关闭本次计划审阅;Agent 会结束本轮并等待你直接输入修改意见": {
    "zh-tw": "關閉本次計畫審閱;Agent 會結束本輪並等待你直接輸入修改意見",
    ja: "この計画レビューを閉じます。Agent はターンを終了し、あなたのコメントを待ちます",
    ko: "이 계획 검토를 닫습니다. Agent는 턴을 종료하고 의견을 기다립니다",
    de: "Diese Planprüfung schließen; der Agent beendet den Durchgang und wartet auf Anmerkungen",
    fr: "Fermer cette revue du plan ; l'agent termine le tour et attend vos remarques",
    es: "Cerrar esta revisión del plan; el agente termina el turno y espera tus comentarios",
    pt: "Fechar esta revisão do plano; o agente encerra o turno e aguarda seus comentários",
    th: "ปิดการตรวจทานแผนนี้; Agent จะจบเทิร์นและรอความเห็นของคุณ",
    id: "Tutup tinjauan rencana ini; agent mengakhiri giliran dan menunggu komentar Anda",
    tr: "Bu plan incelemesini kapat; ajan turu bitirip yorumlarınızı bekler",
    ru: "Закрыть проверку плана; агент завершит ход и будет ждать ваши замечания",
    ar: "إغلاق مراجعة الخطة؛ سينهي الوكيل الدور وينتظر ملاحظاتك",
  },
  "已关闭计划审阅:请直接输入修改意见,Agent 正在等待你的反馈": {
    "zh-tw": "已關閉計畫審閱:請直接輸入修改意見,Agent 正在等待你的回饋",
    ja: "計画レビューを閉じました。修正点を入力してください(Agent が待機中です)",
    ko: "계획 검토를 닫았습니다. 수정 의견을 입력하세요(Agent가 기다리고 있습니다)",
    de: "Planprüfung geschlossen: Anmerkungen direkt eingeben, der Agent wartet darauf",
    fr: "Revue du plan fermée : saisissez vos remarques, l'agent les attend",
    es: "Revisión del plan cerrada: escribe tus cambios, el agente está esperando",
    pt: "Revisão do plano fechada: digite seus comentários, o agente está aguardando",
    th: "ปิดการตรวจทานแผนแล้ว พิมพ์ความเห็นได้เลย Agent กำลังรออยู่",
    id: "Tinjauan rencana ditutup: ketik komentar Anda, agent sedang menunggu",
    tr: "Plan incelemesi kapatıldı: değişikliklerinizi yazın, ajan bekliyor",
    ru: "Проверка плана закрыта: введите замечания, агент их ждёт",
    ar: "تم إغلاق مراجعة الخطة: اكتب ملاحظاتك، الوكيل بانتظارها",
  },
  "📝 计划模式(切换中…)": {
    "zh-tw": "📝 計畫模式(切換中…)", ja: "📝 計画モード(切替中…)", ko: "📝 계획 모드(전환 중…)",
    de: "📝 Planmodus (wird umgeschaltet…)", fr: "📝 Mode plan (changement…)",
    es: "📝 Modo plan (cambiando…)", pt: "📝 Modo plano (alternando…)",
    th: "📝 โหมดแผน (กำลังสลับ…)", id: "📝 Mode rencana (beralih…)",
    tr: "📝 Plan modu (geçiş yapılıyor…)", ru: "📝 Режим плана (переключение…)",
    ar: "📝 وضع الخطة (جارٍ التبديل…)",
  },
};

let updated = 0;
const dir = path.join(root, "src/webview/texts");
for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith(".json")) continue;
  const lang = file.replace(/\.json$/, "");
  const full = path.join(dir, file);
  const dict = JSON.parse(fs.readFileSync(full, "utf8"));
  let touched = false;
  for (const [key, byLang] of Object.entries(WEBVIEW)) {
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
console.log(`webview dictionaries updated: ${updated}`);
