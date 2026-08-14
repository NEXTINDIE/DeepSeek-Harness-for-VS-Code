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
