// 一次性脚本:为回合级 Git 回退功能补齐宿主 bundle(13 语言)与 webview 词典(11 语言)键。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

// ---------- 宿主 bundle(英文默认 = l10n/bundle.l10n.json) ----------

const bundleKeys = {
  en: {
    "rollback.confirmMessage":
      "Restore the workspace to the state before turn {turn}? Uncommitted changes made after that point will be reverted (a safety snapshot is taken first).",
    "rollback.confirmYes": "Rollback",
    "rollback.done": "Workspace restored to the state before turn {turn}",
    "rollback.noRecord": "No turn-level rollback snapshots for this session (requires the DSH server-side plugin)",
    "rollback.noCheckpoint": "No rollback checkpoint for turn {turn}",
    "rollback.noGit": "Not a Git repository: {cwd}",
    "rollback.snapshotFailed": "Cannot take a safety snapshot, rollback aborted: {error}",
    "rollback.restoreFailed": "Rollback failed; the workspace was restored to its previous state: {error}",
  },
  "zh-cn": {
    "rollback.confirmMessage": "把工作区恢复到第 {turn} 回合之前的状态?该点之后的未提交改动将被还原(恢复前会先做一次安全快照)。",
    "rollback.confirmYes": "回退",
    "rollback.done": "工作区已恢复到第 {turn} 回合之前的状态",
    "rollback.noRecord": "该会话没有可用的回合级回退快照(需要 DSH 服务端插件)",
    "rollback.noCheckpoint": "没有第 {turn} 回合的回退快照",
    "rollback.noGit": "不是 Git 仓库:{cwd}",
    "rollback.snapshotFailed": "无法创建安全快照,已中止回退:{error}",
    "rollback.restoreFailed": "回退失败,工作区已还原到回退前的状态:{error}",
  },
  "zh-tw": {
    "rollback.confirmMessage": "把工作區還原到第 {turn} 回合之前的狀態?該點之後的未提交變更將被還原(還原前會先做一次安全快照)。",
    "rollback.confirmYes": "回退",
    "rollback.done": "工作區已還原到第 {turn} 回合之前的狀態",
    "rollback.noRecord": "此工作階段沒有可用的回合級回退快照(需要 DSH 伺服器端外掛)",
    "rollback.noCheckpoint": "沒有第 {turn} 回合的回退快照",
    "rollback.noGit": "不是 Git 存放庫:{cwd}",
    "rollback.snapshotFailed": "無法建立安全快照,已中止回退:{error}",
    "rollback.restoreFailed": "回退失敗,工作區已還原到回退前的狀態:{error}",
  },
  ja: {
    "rollback.confirmMessage": "ワークスペースを第 {turn} ターン以前の状態に復元しますか?それ以降のコミットされていない変更は元に戻されます(事前に安全スナップショットを作成します)。",
    "rollback.confirmYes": "復元",
    "rollback.done": "ワークスペースを第 {turn} ターン以前の状態に復元しました",
    "rollback.noRecord": "このセッションにはターン単位のロールバックスナップショットがありません(DSH サーバープラグインが必要です)",
    "rollback.noCheckpoint": "第 {turn} ターンのロールバックスナップショットがありません",
    "rollback.noGit": "Git リポジトリではありません:{cwd}",
    "rollback.snapshotFailed": "安全スナップショットを作成できないため、ロールバックを中止しました:{error}",
    "rollback.restoreFailed": "ロールバックに失敗し、ワークスペースを元の状態に復元しました:{error}",
  },
  ko: {
    "rollback.confirmMessage": "워크스페이스를 {turn} 턴 이전 상태로 복원할까요? 그 이후의 커밋되지 않은 변경 사항은 되돌려집니다(복원 전 안전 스냅샷을 먼저 만듭니다).",
    "rollback.confirmYes": "복원",
    "rollback.done": "워크스페이스를 {turn} 턴 이전 상태로 복원했습니다",
    "rollback.noRecord": "이 세션에는 턴 단위 롤백 스냅샷이 없습니다(DSH 서버 플러그인 필요)",
    "rollback.noCheckpoint": "{turn} 턴의 롤백 스냅샷이 없습니다",
    "rollback.noGit": "Git 저장소가 아닙니다: {cwd}",
    "rollback.snapshotFailed": "안전 스냅샷을 만들 수 없어 롤백을 중단했습니다: {error}",
    "rollback.restoreFailed": "롤백 실패, 워크스페이스를 롤백 전 상태로 복원했습니다: {error}",
  },
  de: {
    "rollback.confirmMessage": "Arbeitsbereich auf den Stand vor Runde {turn} zurücksetzen? Nicht committete Änderungen danach werden verworfen (zuvor wird ein Sicherungs-Snapshot erstellt).",
    "rollback.confirmYes": "Zurücksetzen",
    "rollback.done": "Arbeitsbereich auf den Stand vor Runde {turn} zurückgesetzt",
    "rollback.noRecord": "Keine rundenbezogenen Rollback-Snapshots für diese Sitzung (DSH-Server-Plugin erforderlich)",
    "rollback.noCheckpoint": "Kein Rollback-Checkpoint für Runde {turn}",
    "rollback.noGit": "Kein Git-Repository: {cwd}",
    "rollback.snapshotFailed": "Sicherungs-Snapshot fehlgeschlagen, Rollback abgebrochen: {error}",
    "rollback.restoreFailed": "Rollback fehlgeschlagen; Arbeitsbereich auf den vorherigen Stand zurückgesetzt: {error}",
  },
  fr: {
    "rollback.confirmMessage": "Restaurer l'espace de travail à l'état antérieur au tour {turn} ? Les modifications non validées ultérieures seront annulées (un instantané de sécurité est créé au préalable).",
    "rollback.confirmYes": "Restaurer",
    "rollback.done": "Espace de travail restauré à l'état antérieur au tour {turn}",
    "rollback.noRecord": "Aucun instantané de restauration par tour pour cette session (plugin serveur DSH requis)",
    "rollback.noCheckpoint": "Aucun point de restauration pour le tour {turn}",
    "rollback.noGit": "Ce n'est pas un dépôt Git : {cwd}",
    "rollback.snapshotFailed": "Impossible de créer l'instantané de sécurité, restauration annulée : {error}",
    "rollback.restoreFailed": "Échec de la restauration ; l'espace de travail a été rétabli à son état précédent : {error}",
  },
  es: {
    "rollback.confirmMessage": "¿Restaurar el espacio de trabajo al estado anterior al turno {turn}? Los cambios sin confirmar posteriores se revertirán (antes se crea una instantánea de seguridad).",
    "rollback.confirmYes": "Restaurar",
    "rollback.done": "Espacio de trabajo restaurado al estado anterior al turno {turn}",
    "rollback.noRecord": "No hay instantáneas de reversión por turno para esta sesión (requiere el complemento de servidor de DSH)",
    "rollback.noCheckpoint": "No hay punto de restauración para el turno {turn}",
    "rollback.noGit": "No es un repositorio Git: {cwd}",
    "rollback.snapshotFailed": "No se pudo crear la instantánea de seguridad, reversión cancelada: {error}",
    "rollback.restoreFailed": "Reversión fallida; el espacio de trabajo se restauró al estado anterior: {error}",
  },
  pt: {
    "rollback.confirmMessage": "Restaurar o espaço de trabalho para o estado anterior ao turno {turn}? As alterações não confirmadas posteriores serão revertidas (um instantâneo de segurança é criado antes).",
    "rollback.confirmYes": "Restaurar",
    "rollback.done": "Espaço de trabalho restaurado para o estado anterior ao turno {turn}",
    "rollback.noRecord": "Nenhum instantâneo de reversão por turno para esta sessão (requer o plugin de servidor do DSH)",
    "rollback.noCheckpoint": "Nenhum ponto de restauração para o turno {turn}",
    "rollback.noGit": "Não é um repositório Git: {cwd}",
    "rollback.snapshotFailed": "Não foi possível criar o instantâneo de segurança, reversão cancelada: {error}",
    "rollback.restoreFailed": "Falha na reversão; o espaço de trabalho foi restaurado ao estado anterior: {error}",
  },
  th: {
    "rollback.confirmMessage": "กู้คืนพื้นที่ทำงานเป็นสถานะก่อนเทิร์น {turn} หรือไม่ การเปลี่ยนแปลงที่ยังไม่ได้คอมมิตหลังจากนั้นจะถูกย้อนกลับ (จะสร้างสแนปช็อตความปลอดภัยก่อน)",
    "rollback.confirmYes": "ย้อนกลับ",
    "rollback.done": "กู้คืนพื้นที่ทำงานเป็นสถานะก่อนเทิร์น {turn} แล้ว",
    "rollback.noRecord": "ไม่มีสแนปช็อตย้อนกลับรายเทิร์นสำหรับเซสชันนี้ (ต้องใช้ปลั๊กอินฝั่งเซิร์ฟเวอร์ DSH)",
    "rollback.noCheckpoint": "ไม่มีจุดย้อนกลับสำหรับเทิร์น {turn}",
    "rollback.noGit": "ไม่ใช่ที่เก็บ Git: {cwd}",
    "rollback.snapshotFailed": "สร้างสแนปช็อตความปลอดภัยไม่ได้ ยกเลิกการย้อนกลับ: {error}",
    "rollback.restoreFailed": "การย้อนกลับล้มเหลว พื้นที่ทำงานถูกกู้คืนเป็นสถานะก่อนหน้า: {error}",
  },
  id: {
    "rollback.confirmMessage": "Pulihkan ruang kerja ke kondisi sebelum giliran {turn}? Perubahan yang belum di-commit setelah titik itu akan dikembalikan (snapshot pengaman dibuat terlebih dahulu).",
    "rollback.confirmYes": "Pulihkan",
    "rollback.done": "Ruang kerja dipulihkan ke kondisi sebelum giliran {turn}",
    "rollback.noRecord": "Tidak ada snapshot rollback per giliran untuk sesi ini (memerlukan plugin server DSH)",
    "rollback.noCheckpoint": "Tidak ada titik rollback untuk giliran {turn}",
    "rollback.noGit": "Bukan repositori Git: {cwd}",
    "rollback.snapshotFailed": "Tidak dapat membuat snapshot pengaman, rollback dibatalkan: {error}",
    "rollback.restoreFailed": "Rollback gagal; ruang kerja dikembalikan ke kondisi sebelumnya: {error}",
  },
  tr: {
    "rollback.confirmMessage": "Çalışma alanı {turn}. turdan önceki duruma geri yüklensin mi? Bu noktadan sonraki commit edilmemiş değişiklikler geri alınacaktır (önce bir güvenlik anlık görüntüsü alınır).",
    "rollback.confirmYes": "Geri al",
    "rollback.done": "Çalışma alanı {turn}. turdan önceki duruma geri yüklendi",
    "rollback.noRecord": "Bu oturum için tur bazlı geri alma anlık görüntüsü yok (DSH sunucu eklentisi gerekli)",
    "rollback.noCheckpoint": "{turn}. tur için geri alma noktası yok",
    "rollback.noGit": "Bir Git deposu değil: {cwd}",
    "rollback.snapshotFailed": "Güvenlik anlık görüntüsü alınamadı, geri alma iptal edildi: {error}",
    "rollback.restoreFailed": "Geri alma başarısız oldu; çalışma alanı önceki duruma geri yüklendi: {error}",
  },
  ar: {
    "rollback.confirmMessage": "استعادة مساحة العمل إلى الحالة قبل الجولة {turn}؟ سيتم التراجع عن التغييرات غير المثبتة بعد تلك النقطة (يتم أخذ لقطة أمان أولاً).",
    "rollback.confirmYes": "استعادة",
    "rollback.done": "تمت استعادة مساحة العمل إلى الحالة قبل الجولة {turn}",
    "rollback.noRecord": "لا توجد لقطات تراجع لكل جولة لهذه الجلسة (يتطلب ملحق خادم DSH)",
    "rollback.noCheckpoint": "لا توجد نقطة تراجع للجولة {turn}",
    "rollback.noGit": "ليس مستودع Git: {cwd}",
    "rollback.snapshotFailed": "تعذر إنشاء لقطة الأمان، تم إلغاء التراجع: {error}",
    "rollback.restoreFailed": "فشل التراجع؛ تمت استعادة مساحة العمل إلى حالتها السابقة: {error}",
  },
};

const bundleFiles = {
  en: `${root}l10n/bundle.l10n.json`,
  "zh-cn": `${root}l10n/bundle.l10n.zh-cn.json`,
  "zh-tw": `${root}l10n/bundle.l10n.zh-tw.json`,
  ja: `${root}l10n/bundle.l10n.ja.json`,
  ko: `${root}l10n/bundle.l10n.ko.json`,
  de: `${root}l10n/bundle.l10n.de.json`,
  fr: `${root}l10n/bundle.l10n.fr.json`,
  es: `${root}l10n/bundle.l10n.es.json`,
  pt: `${root}l10n/bundle.l10n.pt.json`,
  th: `${root}l10n/bundle.l10n.th.json`,
  id: `${root}l10n/bundle.l10n.id.json`,
  tr: `${root}l10n/bundle.l10n.tr.json`,
  ar: `${root}l10n/bundle.l10n.ar.json`,
};

// ---------- webview 词典(中文源键;英文在 ui.ts 的 EN_TEXT) ----------

const webviewKey = "Git 回退到本回合之前";
const webviewTexts = {
  "zh-tw": "Git 回退到本回合之前",
  ja: "Git でこのターンの前に戻す",
  ko: "Git: 이 턴 이전으로 되돌리기",
  de: "Git: Zustand vor dieser Runde wiederherstellen",
  fr: "Git : restaurer l'état avant ce tour",
  es: "Git: restaurar el estado anterior a este turno",
  pt: "Git: restaurar o estado antes deste turno",
  th: "Git: ย้อนกลับไปก่อนเทิร์นนี้",
  id: "Git: kembalikan ke sebelum giliran ini",
  tr: "Git: bu turdan önceki duruma geri dön",
  ar: "Git: العودة إلى ما قبل هذه الجولة",
};

function addKeys(file, dict) {
  const json = JSON.parse(readFileSync(file, "utf8"));
  let added = 0;
  for (const [k, v] of Object.entries(dict)) {
    if (json[k] === undefined) {
      json[k] = v;
      added += 1;
    }
  }
  writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  return added;
}

for (const [lang, dict] of Object.entries(bundleKeys)) {
  const added = addKeys(bundleFiles[lang], dict);
  console.log(`bundle ${lang}: +${added} keys`);
}

for (const [lang, value] of Object.entries(webviewTexts)) {
  const file = `${root}src/webview/texts/${lang}.json`;
  const added = addKeys(file, { [webviewKey]: value });
  console.log(`texts ${lang}.json: +${added} keys`);
}

// ---------- 第二批:菜单项(撤销本回合文件改动 / 查看检查点) ----------

const menuTexts = {
  "撤销本回合文件改动": {
    "zh-tw": "復原本回合檔案變更",
    ja: "このターンのファイル変更を元に戻す",
    ko: "이 턴의 파일 변경 되돌리기",
    de: "Dateiänderungen dieser Runde rückgängig machen",
    fr: "Annuler les modifications de fichiers de ce tour",
    es: "Deshacer los cambios de archivos de este turno",
    pt: "Desfazer as alterações de arquivo deste turno",
    th: "ยกเลิกการเปลี่ยนแปลงไฟล์ของเทิร์นนี้",
    id: "Batalkan perubahan file giliran ini",
    tr: "Bu turdaki dosya değişikliklerini geri al",
    ar: "التراجع عن تغييرات ملفات هذه الجولة",
  },
  "查看检查点": {
    "zh-tw": "查看檢查點",
    ja: "チェックポイントを表示",
    ko: "체크포인트 보기",
    de: "Checkpoints anzeigen",
    fr: "Voir les points de contrôle",
    es: "Ver puntos de control",
    pt: "Ver pontos de verificação",
    th: "ดูจุดตรวจสอบ",
    id: "Lihat titik pemeriksaan",
    tr: "Kontrol noktalarını görüntüle",
    ar: "عرض نقاط التحقق",
  },
};

for (const [key, dict] of Object.entries(menuTexts)) {
  for (const [lang, value] of Object.entries(dict)) {
    const file = `${root}src/webview/texts/${lang}.json`;
    const added = addKeys(file, { [key]: value });
    console.log(`texts ${lang}.json "${key}": +${added} keys`);
  }
}

// ---------- 第三批:回退确认(代码审核)与检查点清单弹窗 ----------

const dialogTexts = {
  "回退确认": {
    "zh-tw": "回退確認",
    ja: "ロールバックの確認",
    ko: "롤백 확인",
    de: "Rollback-Bestätigung",
    fr: "Confirmation du rollback",
    es: "Confirmación de reversión",
    pt: "Confirmação de reversão",
    th: "ยืนยันการย้อนกลับ",
    id: "Konfirmasi rollback",
    tr: "Geri alma onayı",
    ar: "تأكيد التراجع",
  },
  "确认回退": {
    "zh-tw": "確認回退",
    ja: "ロールバックを実行",
    ko: "롤백 실행",
    de: "Rollback ausführen",
    fr: "Confirmer le rollback",
    es: "Confirmar reversión",
    pt: "Confirmar reversão",
    th: "ยืนยัน",
    id: "Konfirmasi",
    tr: "Geri almayı onayla",
    ar: "تأكيد",
  },
  "正在计算差异…": {
    "zh-tw": "正在計算差異…",
    ja: "差分を計算中…",
    ko: "차이 계산 중…",
    de: "Diff wird berechnet…",
    fr: "Calcul du diff…",
    es: "Calculando diferencias…",
    pt: "Calculando diferenças…",
    th: "กำลังคำนวณความแตกต่าง…",
    id: "Menghitung perbedaan…",
    tr: "Fark hesaplanıyor…",
    ar: "جارٍ حساب الفروقات…",
  },
  "回退到回合 {turn} 之前": {
    "zh-tw": "回退到回合 {turn} 之前",
    ja: "第 {turn} ターン以前にロールバック",
    ko: "{turn} 턴 이전으로 롤백",
    de: "Auf den Stand vor Runde {turn} zurücksetzen",
    fr: "Revenir avant le tour {turn}",
    es: "Volver al estado anterior al turno {turn}",
    pt: "Voltar ao estado anterior ao turno {turn}",
    th: "ย้อนกลับไปก่อนเทิร์น {turn}",
    id: "Kembalikan ke sebelum giliran {turn}",
    tr: "{turn}. turdan önceki duruma dön",
    ar: "العودة إلى ما قبل الجولة {turn}",
  },
  "将撤销自该检查点以来的以下改动:": {
    "zh-tw": "將撤銷自該檢查點以來的以下改動:",
    ja: "このチェックポイント以降の以下の変更が取り消されます:",
    ko: "이 체크포인트 이후의 다음 변경 사항이 취소됩니다:",
    de: "Die folgenden Änderungen seit diesem Checkpoint werden rückgängig gemacht:",
    fr: "Les modifications suivantes depuis ce point de contrôle seront annulées :",
    es: "Se revertirán los siguientes cambios desde este punto de control:",
    pt: "As seguintes alterações desde este ponto de verificação serão revertidas:",
    th: "การเปลี่ยนแปลงต่อไปนี้นับตั้งแต่จุดตรวจสอบนี้จะถูกยกเลิก:",
    id: "Perubahan berikut sejak titik pemeriksaan ini akan dibatalkan:",
    tr: "Bu kontrol noktasından bu yana yapılan şu değişiklikler geri alınacak:",
    ar: "سيتم التراجع عن التغييرات التالية منذ نقطة التحقق هذه:",
  },
  "无文件差异": {
    "zh-tw": "無檔案差異",
    ja: "ファイル差分なし",
    ko: "파일 차이 없음",
    de: "Keine Dateiunterschiede",
    fr: "Aucune différence de fichier",
    es: "Sin diferencias de archivos",
    pt: "Sem diferenças de arquivo",
    th: "ไม่มีความแตกต่างของไฟล์",
    id: "Tidak ada perbedaan file",
    tr: "Dosya farkı yok",
    ar: "لا توجد فروقات في الملفات",
  },
  "二进制文件": {
    "zh-tw": "二進位檔案",
    ja: "バイナリファイル",
    ko: "바이너리 파일",
    de: "Binärdatei",
    fr: "Fichier binaire",
    es: "Archivo binario",
    pt: "Arquivo binário",
    th: "ไฟล์ไบนารี",
    id: "File biner",
    tr: "İkili dosya",
    ar: "ملف ثنائي",
  },
  "加载差异…": {
    "zh-tw": "載入差異…",
    ja: "差分を読み込み中…",
    ko: "차이 불러오는 중…",
    de: "Diff wird geladen…",
    fr: "Chargement du diff…",
    es: "Cargando diferencias…",
    pt: "Carregando diferenças…",
    th: "กำลังโหลดความแตกต่าง…",
    id: "Memuat perbedaan…",
    tr: "Fark yükleniyor…",
    ar: "جارٍ تحميل الفروقات…",
  },
  "未跟踪文件清单不可用(检查点记录截断),回退后请手动检查工作区": {
    "zh-tw": "未跟蹤檔案清單不可用(檢查點記錄截斷),回退後請手動檢查工作區",
    ja: "未追跡ファイル一覧が利用できません(チェックポイント記録が切り捨てられています)。ロールバック後に手動で確認してください",
    ko: "미추적 파일 목록을 사용할 수 없습니다(체크포인트 기록 잘림). 롤백 후 수동으로 확인하세요",
    de: "Liste der nicht verfolgten Dateien nicht verfügbar (Checkpoint-Datensatz abgeschnitten); Arbeitsbereich nach dem Rollback manuell prüfen",
    fr: "Liste des fichiers non suivis indisponible (enregistrement tronqué) ; vérifiez l'espace de travail après le rollback",
    es: "Lista de archivos sin seguimiento no disponible (registro truncado); revisa el espacio de trabajo tras la reversión",
    pt: "Lista de arquivos não rastreados indisponível (registro truncado); verifique o espaço de trabalho após a reversão",
    th: "ไม่มีรายการไฟล์ที่ไม่ได้ติดตาม (บันทึกถูกตัดทอน) โปรดตรวจสอบพื้นที่ทำงานด้วยตนเองหลังย้อนกลับ",
    id: "Daftar file yang tidak dilacak tidak tersedia (catatan terpotong); periksa ruang kerja secara manual setelah rollback",
    tr: "İzlenmeyen dosya listesi kullanılamıyor (kayıt kesilmiş); geri alma sonrasında çalışma alanını elle kontrol edin",
    ar: "قائمة الملفات غير المتعقبة غير متاحة (السجل مقتطع)؛ تحقق من مساحة العمل يدويًا بعد التراجع",
  },
  "将删除新建的未跟踪文件({count} 个)": {
    "zh-tw": "將刪除新建的未跟蹤檔案({count} 個)",
    ja: "チェックポイント後に作成された未追跡ファイルを {count} 件削除します",
    ko: "체크포인트 이후 생성된 미추적 파일 {count}개를 삭제합니다",
    de: "Löscht {count} nach dem Checkpoint erstellte nicht verfolgte Datei(en)",
    fr: "Supprimera {count} fichier(s) non suivi(s) créé(s) après le point de contrôle",
    es: "Se eliminarán {count} archivo(s) sin seguimiento creado(s) después del punto de control",
    pt: "Excluirá {count} arquivo(s) não rastreado(s) criado(s) após o ponto de verificação",
    th: "จะลบไฟล์ที่ไม่ได้ติดตามซึ่งสร้างหลังจุดตรวจสอบ {count} ไฟล์",
    id: "Akan menghapus {count} file yang tidak dilacak yang dibuat setelah titik pemeriksaan",
    tr: "Kontrol noktasından sonra oluşturulan {count} izlenmeyen dosya silinecek",
    ar: "سيتم حذف {count} ملف غير متعقب أُنشئ بعد نقطة التحقق",
  },
  "共 {files} 个文件,+{added} 行,−{deleted} 行": {
    "zh-tw": "共 {files} 個檔案,+{added} 行,−{deleted} 行",
    ja: "計 {files} ファイル、+{added} 行、−{deleted} 行",
    ko: "총 {files}개 파일,+{added}줄,−{deleted}줄",
    de: "{files} Dateien,+{added} Zeilen,−{deleted} Zeilen",
    fr: "{files} fichiers, +{added} lignes, −{deleted} lignes",
    es: "{files} archivos, +{added} líneas, −{deleted} líneas",
    pt: "{files} arquivos, +{added} linhas, −{deleted} linhas",
    th: "รวม {files} ไฟล์,+{added} บรรทัด,−{deleted} บรรทัด",
    id: "{files} file,+{added} baris,−{deleted} baris",
    tr: "{files} dosya,+{added} satır,−{deleted} satır",
    ar: "{files} ملفًا,+{added} سطرًا,−{deleted} سطرًا",
  },
  "差异过大,仅显示前 300 个文件": {
    "zh-tw": "差異過大,僅顯示前 300 個檔案",
    ja: "差分が大きすぎるため、先頭 300 ファイルのみ表示します",
    ko: "차이가 너무 커서 처음 300개 파일만 표시합니다",
    de: "Diff zu groß; nur die ersten 300 Dateien werden angezeigt",
    fr: "Diff trop volumineux ; seuls les 300 premiers fichiers sont affichés",
    es: "Diferencia demasiado grande; solo se muestran los primeros 300 archivos",
    pt: "Diferença muito grande; exibindo apenas os primeiros 300 arquivos",
    th: "ความแตกต่างใหญ่เกินไป แสดงเฉพาะ 300 ไฟล์แรก",
    id: "Perbedaan terlalu besar; hanya menampilkan 300 file pertama",
    tr: "Fark çok büyük; yalnızca ilk 300 dosya gösteriliyor",
    ar: "الفروقات كبيرة جدًا؛ يتم عرض أول 300 ملف فقط",
  },
  "回退前状态会先存入保存点,/redo 可恢复;忽略文件不受影响": {
    "zh-tw": "回退前狀態會先存入保存點,/redo 可恢復;忽略檔案不受影響",
    ja: "ロールバック前の状態はセーブポイントに保存され、/redo で復元できます。無視ファイルは変更されません",
    ko: "롤백 전 상태는 저장점에 먼저 저장되며 /redo로 복원할 수 있습니다. 무시된 파일은 변경되지 않습니다",
    de: "Der Zustand vor dem Rollback wird zuerst als Sicherung gespeichert (/redo stellt ihn wieder her); ignorierte Dateien bleiben unberührt",
    fr: "L'état avant le rollback est sauvegardé d'abord (/redo le restaure) ; les fichiers ignorés ne sont jamais touchés",
    es: "El estado previo se guarda primero (/redo lo restaura); los archivos ignorados nunca se tocan",
    pt: "O estado anterior à reversão é salvo primeiro (/redo o restaura); arquivos ignorados nunca são tocados",
    th: "สถานะก่อนย้อนกลับจะถูกบันทึกก่อน (/redo กู้คืนได้); ไฟล์ที่ถูกละเว้นจะไม่ถูกแตะต้อง",
    id: "Status sebelum rollback disimpan terlebih dahulu (/redo memulihkannya); file yang diabaikan tidak pernah disentuh",
    tr: "Geri alma öncesi durum önce kaydedilir (/redo geri getirir); yok sayılan dosyalara dokunulmaz",
    ar: "تُحفظ الحالة قبل التراجع أولاً (/redo يستعيدها)؛ الملفات المتجاهلة لا تُمس أبدًا",
  },
  "检查点": {
    "zh-tw": "檢查點",
    ja: "チェックポイント",
    ko: "체크포인트",
    de: "Checkpoints",
    fr: "Points de contrôle",
    es: "Puntos de control",
    pt: "Pontos de verificação",
    th: "จุดตรวจสอบ",
    id: "Titik pemeriksaan",
    tr: "Kontrol noktaları",
    ar: "نقاط التحقق",
  },
  "关闭": {
    "zh-tw": "關閉",
    ja: "閉じる",
    ko: "닫기",
    de: "Schließen",
    fr: "Fermer",
    es: "Cerrar",
    pt: "Fechar",
    th: "ปิด",
    id: "Tutup",
    tr: "Kapat",
    ar: "إغلاق",
  },
  "会话共 {count} 个检查点 · HEAD {head} · 未提交改动 {dirty} 项": {
    "zh-tw": "工作階段共 {count} 個檢查點 · HEAD {head} · 未提交變更 {dirty} 項",
    ja: "セッションには {count} 件のチェックポイント · HEAD {head} · 未コミット変更 {dirty} 件",
    ko: "세션에 체크포인트 {count}개 · HEAD {head} · 커밋되지 않은 변경 {dirty}건",
    de: "{count} Checkpoints · HEAD {head} · {dirty} nicht committete Änderungen",
    fr: "{count} points de contrôle · HEAD {head} · {dirty} modifications non validées",
    es: "{count} puntos de control · HEAD {head} · {dirty} cambios sin confirmar",
    pt: "{count} pontos de verificação · HEAD {head} · {dirty} alterações não confirmadas",
    th: "จุดตรวจสอบ {count} รายการ · HEAD {head} · การเปลี่ยนแปลงที่ยังไม่ได้คอมมิต {dirty} รายการ",
    id: "{count} titik pemeriksaan · HEAD {head} · {dirty} perubahan belum di-commit",
    tr: "{count} kontrol noktası · HEAD {head} · {dirty} commit edilmemiş değişiklik",
    ar: "{count} نقطة تحقق · HEAD {head} · {dirty} تغيير غير مثبت",
  },
  "回合 {turn}": {
    "zh-tw": "回合 {turn}",
    ja: "ターン {turn}",
    ko: "턴 {turn}",
    de: "Runde {turn}",
    fr: "Tour {turn}",
    es: "Turno {turn}",
    pt: "Turno {turn}",
    th: "เทิร์น {turn}",
    id: "Giliran {turn}",
    tr: "{turn}. tur",
    ar: "الجولة {turn}",
  },
  "个文件": {
    "zh-tw": "個檔案",
    ja: "ファイル",
    ko: "파일",
    de: "Dateien",
    fr: "fichiers",
    es: "archivos",
    pt: "arquivos",
    th: "ไฟล์",
    id: "file",
    tr: "dosya",
    ar: "ملفات",
  },
  "回退到此回合前": {
    "zh-tw": "回退到此回合前",
    ja: "このターン以前にロールバック",
    ko: "이 턴 이전으로 롤백",
    de: "Auf den Stand vor dieser Runde zurücksetzen",
    fr: "Revenir avant ce tour",
    es: "Volver al estado anterior a este turno",
    pt: "Voltar ao estado anterior a este turno",
    th: "ย้อนกลับไปก่อนเทิร์นนี้",
    id: "Kembalikan ke sebelum giliran ini",
    tr: "Bu turdan önceki duruma dön",
    ar: "العودة إلى ما قبل هذه الجولة",
  },
  "暂无检查点。检查点会在每个回合开始前自动创建(turn/start 时快照工作区)": {
    "zh-tw": "暫無檢查點。檢查點會在每個回合開始前自動建立(turn/start 時快照工作區)",
    ja: "チェックポイントはまだありません。各ターン開始時に自動的に作成されます(turn/start でワークスペースをスナップショット)",
    ko: "아직 체크포인트가 없습니다. 각 턴 시작 시 자동으로 생성됩니다(turn/start에 워크스페이스 스냅샷)",
    de: "Noch keine Checkpoints. Sie werden automatisch zu Beginn jeder Runde erstellt (Schnappschuss bei turn/start)",
    fr: "Aucun point de contrôle pour l'instant. Ils sont créés automatiquement au début de chaque tour (instantané à turn/start)",
    es: "Aún no hay puntos de control. Se crean automáticamente al inicio de cada turno (instantánea en turn/start)",
    pt: "Ainda não há pontos de verificação. Eles são criados automaticamente no início de cada turno (instantâneo em turn/start)",
    th: "ยังไม่มีจุดตรวจสอบ จะถูกสร้างอัตโนมัติเมื่อแต่ละเทิร์นเริ่มต้น (สแนปช็อตที่ turn/start)",
    id: "Belum ada titik pemeriksaan. Titik pemeriksaan dibuat otomatis saat setiap giliran dimulai (snapshot pada turn/start)",
    tr: "Henüz kontrol noktası yok. Her tur başladığında otomatik oluşturulur (turn/start anında anlık görüntü)",
    ar: "لا توجد نقاط تحقق بعد. تُنشأ تلقائيًا عند بدء كل جولة (لقطة عند turn/start)",
  },
  "/rollback [N] 直接回退;/redo 恢复最近回退;清理 refs/dsh/checkpoints|saves/<会话ID> 与 .dsh/rollback 记录": {
    "zh-tw": "/rollback [N] 直接回退;/redo 恢復最近回退;清理 refs/dsh/checkpoints|saves/<工作階段ID> 與 .dsh/rollback 記錄",
    ja: "/rollback [N] で直接ロールバック;/redo で直前のロールバックを復元;クリーンアップ:git update-ref -d refs/dsh/checkpoints|saves/<セッションID> と .dsh/rollback の記録",
    ko: "/rollback [N] 직접 롤백;/redo 최근 롤백 복원;정리:git update-ref -d refs/dsh/checkpoints|saves/<세션ID> 및 .dsh/rollback 기록",
    de: "/rollback [N] setzt direkt zurück; /redo stellt den letzten Rollback wieder her; Aufräumen: git update-ref -d refs/dsh/checkpoints|saves/<SitzungsID> plus .dsh/rollback-Datensatz",
    fr: "/rollback [N] annule directement ; /redo restaure le dernier rollback ; nettoyage : git update-ref -d refs/dsh/checkpoints|saves/<ID de session> plus l'enregistrement .dsh/rollback",
    es: "/rollback [N] revierte directamente; /redo restaura la última reversión; limpieza: git update-ref -d refs/dsh/checkpoints|saves/<ID de sesión> más el registro .dsh/rollback",
    pt: "/rollback [N] reverte diretamente; /redo restaura a última reversão; limpeza: git update-ref -d refs/dsh/checkpoints|saves/<ID da sessão> mais o registro .dsh/rollback",
    th: "/rollback [N] ย้อนกลับโดยตรง; /redo กู้คืนการย้อนกลับล่าสุด; ทำความสะอาด: git update-ref -d refs/dsh/checkpoints|saves/<รหัสเซสชัน> พร้อมบันทึก .dsh/rollback",
    id: "/rollback [N] mengembalikan langsung; /redo memulihkan rollback terakhir; pembersihan: git update-ref -d refs/dsh/checkpoints|saves/<ID sesi> beserta catatan .dsh/rollback",
    tr: "/rollback [N] doğrudan geri alır; /redo son geri almayı geri getirir; temizlik: git update-ref -d refs/dsh/checkpoints|saves/<oturum kimliği> ve .dsh/rollback kaydı",
    ar: "/rollback [N] يتراجع مباشرة؛ /redo يستعيد آخر تراجع؛ التنظيف: git update-ref -d refs/dsh/checkpoints|saves/<معرف الجلسة> مع سجل .dsh/rollback",
  },
  "差异不可用": {
    "zh-tw": "差異不可用",
    ja: "差分を取得できません",
    ko: "차이를 사용할 수 없음",
    de: "Diff nicht verfügbar",
    fr: "Diff indisponible",
    es: "Diferencia no disponible",
    pt: "Diferença indisponível",
    th: "ไม่มีความแตกต่างให้ใช้",
    id: "Perbedaan tidak tersedia",
    tr: "Fark kullanılamıyor",
    ar: "الفروقات غير متاحة",
  },
};

for (const [key, dict] of Object.entries(dialogTexts)) {
  for (const [lang, value] of Object.entries(dict)) {
    const file = `${root}src/webview/texts/${lang}.json`;
    const added = addKeys(file, { [key]: value });
    console.log(`texts ${lang}.json "${key.slice(0, 12)}…": +${added} keys`);
  }
}

// ---------- 第四批:「撤销本回合改动并新建分支」替换旧的「分支并回退到更早位置」 ----------

const OLD_KEYS = ["分支并回退到更早位置", "选择回退点(在其后开启新分支)", "⚠️ 没有更早的对话点"];

function dropKeys(file, keys) {
  const json = JSON.parse(readFileSync(file, "utf8"));
  let removed = 0;
  for (const key of keys) {
    if (json[key] !== undefined) {
      delete json[key];
      removed += 1;
    }
  }
  writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  return removed;
}

const newMenuItem = {
  "撤销本回合改动并新建分支": {
    "zh-tw": "復原本回合變更並新建分支",
    ja: "このターンの変更を取り消してここから分岐",
    ko: "이 턴의 변경을 취소하고 여기서 분기",
    de: "Änderungen dieser Runde rückgängig machen und hier abzweigen",
    fr: "Annuler les changements de ce tour et créer une branche ici",
    es: "Deshacer los cambios de este turno y crear una rama aquí",
    pt: "Desfazer as alterações deste turno e ramificar daqui",
    th: "ยกเลิกการเปลี่ยนแปลงของเทิร์นนี้และแตกสาขาจากตรงนี้",
    id: "Batalkan perubahan giliran ini dan buat cabang dari sini",
    tr: "Bu turun değişikliklerini geri al ve buradan dal oluştur",
    ar: "التراجع عن تغييرات هذه الجولة وإنشاء فرع من هنا",
  },
};

for (const [key, dict] of Object.entries(newMenuItem)) {
  for (const [lang, value] of Object.entries(dict)) {
    const file = `${root}src/webview/texts/${lang}.json`;
    const added = addKeys(file, { [key]: value });
    const removed = dropKeys(file, OLD_KEYS);
    console.log(`texts ${lang}.json "${key.slice(0, 10)}…": +${added} / −${removed} old`);
  }
}

// ---------- 第五批:「对比」按钮(webview)+ rollback.compareFailed(宿主 bundle) ----------

const compareWebview = {
  "对比": {
    "zh-tw": "比較",
    ja: "比較",
    ko: "비교",
    de: "Vergleichen",
    fr: "Comparer",
    es: "Comparar",
    pt: "Comparar",
    th: "เปรียบเทียบ",
    id: "Bandingkan",
    tr: "Karşılaştır",
    ar: "مقارنة",
  },
};

for (const [key, dict] of Object.entries(compareWebview)) {
  for (const [lang, value] of Object.entries(dict)) {
    const file = `${root}src/webview/texts/${lang}.json`;
    const added = addKeys(file, { [key]: value });
    console.log(`texts ${lang}.json "${key}": +${added} keys`);
  }
}

const compareBundle = {
  "rollback.compareFailed": {
    en: "Compare failed: {error}",
    "zh-cn": "对比失败:{error}",
    "zh-tw": "對比失敗:{error}",
    ja: "比較に失敗しました:{error}",
    ko: "비교 실패: {error}",
    de: "Vergleich fehlgeschlagen: {error}",
    fr: "Échec de la comparaison : {error}",
    es: "Error al comparar: {error}",
    pt: "Falha na comparação: {error}",
    th: "การเปรียบเทียบล้มเหลว: {error}",
    id: "Gagal membandingkan: {error}",
    tr: "Karşılaştırma başarısız: {error}",
    ar: "فشلت المقارنة: {error}",
  },
};

for (const [key, dict] of Object.entries(compareBundle)) {
  for (const [lang, value] of Object.entries(dict)) {
    const file = bundleFiles[lang];
    const added = addKeys(file, { [key]: value });
    console.log(`bundle ${lang} "${key}": +${added} keys`);
  }
}

// ---------- 第六批:自动安装设置(package.nls)+ 重启提示(bundle) ----------

const nlsFiles = {
  en: `${root}package.nls.json`,
  "zh-cn": `${root}package.nls.zh-cn.json`,
  "zh-tw": `${root}package.nls.zh-tw.json`,
  ja: `${root}package.nls.ja.json`,
  ko: `${root}package.nls.ko.json`,
  de: `${root}package.nls.de.json`,
  fr: `${root}package.nls.fr.json`,
  es: `${root}package.nls.es.json`,
  pt: `${root}package.nls.pt.json`,
  th: `${root}package.nls.th.json`,
  id: `${root}package.nls.id.json`,
  tr: `${root}package.nls.tr.json`,
  ar: `${root}package.nls.ar.json`,
};

const installSetting = {
  "config.installRollbackPlugin": {
    en: "Automatically install the turn-level Git rollback plugin into the DSH web profile (enables /rollback, /redo, /checkpoints; takes effect after the DSH server restarts)",
    "zh-cn": "自动把回合级 Git 回退插件安装到 DSH web profile(启用 /rollback、/redo、/checkpoints;重启 DSH 服务器后生效)",
    "zh-tw": "自動把回合級 Git 回退外掛安裝到 DSH web profile(啟用 /rollback、/redo、/checkpoints;重啟 DSH 伺服器後生效)",
    ja: "ターン単位の Git ロールバックプラグインを DSH web profile に自動インストールします(/rollback、/redo、/checkpoints が有効化;DSH サーバー再起動後に有効)",
    ko: "턴 단위 Git 롤백 플러그인을 DSH web profile에 자동 설치합니다(/rollback, /redo, /checkpoints 활성화;DSH 서버 재시작 후 적용)",
    de: "Das Git-Rollback-Plugin pro Runde automatisch im DSH-Webprofil installieren (aktiviert /rollback, /redo, /checkpoints; wirkt nach einem Neustart des DSH-Servers)",
    fr: "Installer automatiquement le plugin de restauration Git par tour dans le profil web DSH (active /rollback, /redo, /checkpoints ; effet après redémarrage du serveur DSH)",
    es: "Instala automáticamente el complemento de reversión Git por turno en el perfil web de DSH (habilita /rollback, /redo, /checkpoints; surte efecto tras reiniciar el servidor DSH)",
    pt: "Instala automaticamente o plugin de reversão Git por turno no perfil web do DSH (ativa /rollback, /redo, /checkpoints; entra em vigor após reiniciar o servidor DSH)",
    th: "ติดตั้งปลั๊กอิน Git rollback รายเทิร์นลงในโปรไฟล์ web ของ DSH โดยอัตโนมัติ (เปิดใช้งาน /rollback, /redo, /checkpoints; มีผลหลังรีสตาร์ทเซิร์ฟเวอร์ DSH)",
    id: "Instal otomatis plugin rollback Git per giliran ke profil web DSH (mengaktifkan /rollback, /redo, /checkpoints; berlaku setelah server DSH dimulai ulang)",
    tr: "Turn bazlı Git geri alma eklentisini DSH web profiline otomatik kur (/rollback, /redo, /checkpoints etkinleştirilir; DSH sunucusu yeniden başlatıldığında etkili olur)",
    ar: "تثبيت ملحق التراجع Git لكل جولة تلقائيًا في ملف تعريف DSH على الويب (تفعيل /rollback و /redo و /checkpoints؛ يسري بعد إعادة تشغيل خادم DSH)",
  },
};

for (const [key, dict] of Object.entries(installSetting)) {
  for (const [lang, value] of Object.entries(dict)) {
    const file = nlsFiles[lang];
    const added = addKeys(file, { [key]: value });
    console.log(`nls ${lang} "${key}": +${added} keys`);
  }
}

const restartBundle = {
  "rollback.pluginInstalledHint": {
    en: "The turn-level Git rollback plugin is installed for the DSH web profile, but the running server has not loaded it yet. Restart the DSH server to activate /rollback, /redo and /checkpoints.",
    "zh-cn": "回合级 Git 回退插件已安装到 DSH web profile,但当前运行的服务器尚未加载。重启 DSH 服务器后 /rollback、/redo、/checkpoints 生效。",
    "zh-tw": "回合級 Git 回退外掛已安裝到 DSH web profile,但目前執行的伺服器尚未載入。重啟 DSH 伺服器後 /rollback、/redo、/checkpoints 生效。",
    ja: "ターン単位の Git ロールバックプラグインは DSH web profile にインストール済みですが、実行中のサーバーにはまだ読み込まれていません。DSH サーバーを再起動すると /rollback、/redo、/checkpoints が有効になります。",
    ko: "턴 단위 Git 롤백 플러그인이 DSH web profile에 설치되었지만 실행 중인 서버에 아직 로드되지 않았습니다. DSH 서버를 다시 시작하면 /rollback, /redo, /checkpoints가 활성화됩니다.",
    de: "Das Git-Rollback-Plugin pro Runde ist im DSH-Webprofil installiert, wurde aber vom laufenden Server noch nicht geladen. Starten Sie den DSH-Server neu, um /rollback, /redo und /checkpoints zu aktivieren.",
    fr: "Le plugin de restauration Git par tour est installé dans le profil web DSH, mais le serveur en cours ne l'a pas encore chargé. Redémarrez le serveur DSH pour activer /rollback, /redo et /checkpoints.",
    es: "El complemento de reversión Git por turno está instalado en el perfil web de DSH, pero el servidor en ejecución aún no lo ha cargado. Reinicia el servidor DSH para activar /rollback, /redo y /checkpoints.",
    pt: "O plugin de reversão Git por turno está instalado no perfil web do DSH, mas o servidor em execução ainda não o carregou. Reinicie o servidor DSH para ativar /rollback, /redo e /checkpoints.",
    th: "ปลั๊กอิน Git rollback รายเทิร์นติดตั้งในโปรไฟล์ web ของ DSH แล้ว แต่เซิร์ฟเวอร์ที่ทำงานอยู่ยังไม่ได้โหลด รีสตาร์ทเซิร์ฟเวอร์ DSH เพื่อเปิดใช้ /rollback, /redo และ /checkpoints",
    id: "Plugin rollback Git per giliran sudah terpasang di profil web DSH, tetapi server yang berjalan belum memuatnya. Mulai ulang server DSH untuk mengaktifkan /rollback, /redo, dan /checkpoints.",
    tr: "Turn bazlı Git geri alma eklentisi DSH web profiline kuruldu ancak çalışan sunucu henüz yüklemedi. /rollback, /redo ve /checkpoints'i etkinleştirmek için DSH sunucusunu yeniden başlatın.",
    ar: "تم تثبيت ملحق التراجع Git لكل جولة في ملف تعريف DSH على الويب، لكن الخادم قيد التشغيل لم يحمّله بعد. أعد تشغيل خادم DSH لتفعيل /rollback و /redo و /checkpoints.",
  },
  "rollback.pluginRestartNow": {
    en: "Restart Now",
    "zh-cn": "立即重启",
    "zh-tw": "立即重啟",
    ja: "今すぐ再起動",
    ko: "지금 다시 시작",
    de: "Jetzt neu starten",
    fr: "Redémarrer maintenant",
    es: "Reiniciar ahora",
    pt: "Reiniciar agora",
    th: "รีสตาร์ทตอนนี้",
    id: "Mulai ulang sekarang",
    tr: "Şimdi yeniden başlat",
    ar: "إعادة التشغيل الآن",
  },
  "rollback.pluginRestarted": {
    en: "DSH server restarted; the rollback plugin is active now.",
    "zh-cn": "DSH 服务器已重启,回合级回退插件已生效。",
    "zh-tw": "DSH 伺服器已重啟,回合級回退外掛已生效。",
    ja: "DSH サーバーを再起動しました。ロールバックプラグインが有効になりました。",
    ko: "DSH 서버를 다시 시작했습니다. 롤백 플러그인이 활성화되었습니다.",
    de: "DSH-Server neu gestartet; das Rollback-Plugin ist jetzt aktiv.",
    fr: "Serveur DSH redémarré ; le plugin de restauration est actif.",
    es: "Servidor DSH reiniciado; el complemento de reversión ya está activo.",
    pt: "Servidor DSH reiniciado; o plugin de reversão está ativo.",
    th: "รีสตาร์ทเซิร์ฟเวอร์ DSH แล้ว ปลั๊กอินย้อนกลับพร้อมใช้งาน",
    id: "Server DSH dimulai ulang; plugin rollback aktif sekarang.",
    tr: "DSH sunucusu yeniden başlatıldı; geri alma eklentisi artık etkin.",
    ar: "تمت إعادة تشغيل خادم DSH؛ ملحق التراجع نشط الآن.",
  },
  "rollback.pluginManualRestart": {
    en: "The DSH server was not started by this extension. Restart it from the terminal that launched it.",
    "zh-cn": "当前 DSH 服务器不是由本扩展启动的,请在其启动终端中重启。",
    "zh-tw": "目前 DSH 伺服器不是由本擴充功能啟動的,請在其啟動終端機中重啟。",
    ja: "この拡張機能によって DSH サーバーは起動されていません。起動したターミナルから再起動してください。",
    ko: "현재 DSH 서버는 이 확장에서 시작한 것이 아닙니다. 시작한 터미널에서 다시 시작하세요.",
    de: "Der DSH-Server wurde nicht von dieser Erweiterung gestartet. Starten Sie ihn in dem Terminal neu, das ihn gestartet hat.",
    fr: "Le serveur DSH n'a pas été démarré par cette extension. Redémarrez-le depuis le terminal qui l'a lancé.",
    es: "El servidor DSH no fue iniciado por esta extensión. Reinícialo desde la terminal que lo inició.",
    pt: "O servidor DSH não foi iniciado por esta extensão. Reinicie-o no terminal que o iniciou.",
    th: "เซิร์ฟเวอร์ DSH ไม่ได้เริ่มต้นโดยส่วนขยายนี้ โปรดรีสตาร์ทจากเทอร์มินัลที่เปิดใช้งาน",
    id: "Server DSH tidak dimulai oleh ekstensi ini. Mulai ulang dari terminal yang meluncurkannya.",
    tr: "DSH sunucusu bu uzantı tarafından başlatılmadı. Başlatan terminalden yeniden başlatın.",
    ar: "لم يبدأ خادم DSH بواسطة هذا الملحق. أعد تشغيله من الطرفية التي شغّلته.",
  },
};

for (const [key, dict] of Object.entries(restartBundle)) {
  for (const [lang, value] of Object.entries(dict)) {
    const file = bundleFiles[lang];
    const added = addKeys(file, { [key]: value });
    console.log(`bundle ${lang} "${key}": +${added} keys`);
  }
}
