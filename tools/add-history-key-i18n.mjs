/**
 * 0.13.41:方向键历史召回改造所需文案,三层一次补齐。
 *  1) package.nls.*.json(dsh.historyKey 的 label / 描述 / 三个 enum 描述)
 *  2) src/webview/texts/*.json + ui.ts 的 EN_TEXT(设置面板与提示文案)
 * 只追加缺失键。
 */
import fs from "node:fs";
import path from "node:path";

const root = "D:/Workspace/vscode";

/** ---------- package.nls(贡献点) ---------- */
const NLS = {
  "config.historyKey": {
    en: "How ↑/↓ recall previous inputs: only at the edge of the text (default), on every press, or never",
    "zh-cn": "↑/↓ 调回历史输入的时机:只在光标到达边界时(默认)、每次按键都调回、或关闭",
    "zh-tw": "↑/↓ 調回歷史輸入的時機:只在游標到達邊界時(預設)、每次按鍵都調回、或關閉",
    ja: "↑/↓ で以前の入力を呼び出すタイミング:カーソルが端にあるときのみ(既定)/ 毎回 / 無効",
    ko: "↑/↓로 이전 입력을 불러오는 시점: 커서가 끝에 있을 때만(기본), 매번, 사용 안 함",
    de: "Wann ↑/↓ frühere Eingaben zurückholen: nur am Textrand (Standard), bei jedem Tastendruck oder nie",
    fr: "Quand ↑/↓ rappellent les saisies précédentes : uniquement au bord du texte (par défaut), à chaque appui, ou jamais",
    es: "Cuándo ↑/↓ recuperan entradas anteriores: solo en el borde del texto (predeterminado), en cada pulsación o nunca",
    pt: "Quando ↑/↓ recuperam entradas anteriores: apenas na borda do texto (padrão), a cada tecla ou nunca",
    th: "จังหวะที่ ↑/↓ เรียกประวัติการพิมพ์: เฉพาะเมื่อเคอร์เซอร์อยู่ขอบข้อความ (ค่าเริ่มต้น) / ทุกครั้งที่กด / ปิด",
    id: "Kapan ↑/↓ memanggil input sebelumnya: hanya di tepi teks (default), setiap penekanan, atau tidak pernah",
    tr: "↑/↓ önceki girişleri ne zaman geri getirsin: yalnızca metnin kenarında (varsayılan), her basışta veya hiç",
    ru: "Когда ↑/↓ возвращают предыдущий ввод: только у края текста (по умолчанию), при каждом нажатии или никогда",
    ar: "متى يعيد ↑/↓ الإدخالات السابقة: عند حافة النص فقط (الافتراضي)، أو عند كل ضغطة، أو أبدًا",
  },
  "config.historyKey.edge": {
    en: "Only at the edge: ↑/↓ move the caret while it can still move, and recall history on the press that cannot move further",
    "zh-cn": "只在边界召回:光标还能上下移动时只移动光标;已经到不了更上方 / 更下方时,那一次按键立即调回历史",
    "zh-tw": "只在邊界召回:游標還能上下移動時只移動游標;已經到不了更上方 / 更下方時,該次按鍵立即調回歷史",
    ja: "端でのみ: カーソルが動ける間は移動し、動けなくなった押下で履歴を呼び出す",
    ko: "끝에서만: 커서가 움직일 수 있으면 이동하고, 더 못 움직이는 누름에서 기록을 불러옵니다",
    de: "Nur am Rand: ↑/↓ bewegen den Cursor, solange er sich bewegen kann; am Rand holt dieser Tastendruck den Verlauf",
    fr: "Uniquement au bord : ↑/↓ déplacent le curseur tant qu'il peut bouger, et rappellent l'historique quand il ne peut plus",
    es: "Solo en el borde: ↑/↓ mueven el cursor mientras pueda moverse; en el borde esa pulsación recupera el historial",
    pt: "Apenas na borda: ↑/↓ movem o cursor enquanto ele puder se mover; na borda essa tecla recupera o histórico",
    th: "เฉพาะที่ขอบ: ↑/↓ เลื่อนเคอร์เซอร์เมื่อยังเลื่อนได้ และเรียกประวัติเมื่อเลื่อนต่อไม่ได้แล้ว",
    id: "Hanya di tepi: ↑/↓ memindahkan kursor selama masih bisa; di tepi, penekanan itu memanggil riwayat",
    tr: "Yalnızca kenarda: ↑/↓ imleç hareket edebildikçe onu taşır, edemediğinde o basış geçmişi getirir",
    ru: "Только у края: ↑/↓ двигают курсор, пока это возможно; у края это нажатие возвращает историю",
    ar: "عند الحافة فقط: ↑/↓ تحرّكان المؤشر ما دام يتحرك، وعند الحافة تعيد تلك الضغطة السجل",
  },
  "config.historyKey.always": {
    en: "On every press: ↑/↓ recall the previous/next input immediately and never move the caret",
    "zh-cn": "一按就召回:↑/↓ 直接调回上一条 / 下一条输入,不再移动光标",
    "zh-tw": "一按就召回:↑/↓ 直接調回上一條 / 下一條輸入,不再移動游標",
    ja: "毎回: ↑/↓ は前 / 次の入力を即座に呼び出し、カーソルは移動しません",
    ko: "매번: ↑/↓가 이전/다음 입력을 즉시 불러오고 커서는 움직이지 않습니다",
    de: "Bei jedem Druck: ↑/↓ holen sofort die vorige/nächste Eingabe, der Cursor bleibt",
    fr: "À chaque appui : ↑/↓ rappellent immédiatement la saisie précédente/suivante, sans déplacer le curseur",
    es: "En cada pulsación: ↑/↓ recuperan de inmediato la entrada anterior/siguiente y no mueven el cursor",
    pt: "A cada tecla: ↑/↓ recuperam imediatamente a entrada anterior/seguinte e não movem o cursor",
    th: "ทุกครั้ง: ↑/↓ เรียกข้อมูลก่อนหน้า/ถัดไปทันที และไม่เลื่อนเคอร์เซอร์",
    id: "Setiap penekanan: ↑/↓ langsung memanggil input sebelumnya/berikutnya dan tidak memindahkan kursor",
    tr: "Her basışta: ↑/↓ önceki/sonraki girişi hemen getirir, imleç hareket etmez",
    ru: "При каждом нажатии: ↑/↓ сразу возвращают предыдущий/следующий ввод, курсор не двигается",
    ar: "عند كل ضغطة: يعيد ↑/↓ الإدخال السابق/التالي فورًا دون تحريك المؤشر",
  },
  "config.historyKey.off": {
    en: "Never: plain ↑/↓ only move the caret (Ctrl/Alt + ↑/↓ still recall history)",
    "zh-cn": "关闭:普通 ↑/↓ 只移动光标;仍可用 Ctrl/Alt + ↑/↓ 调回历史",
    "zh-tw": "關閉:一般 ↑/↓ 只移動游標;仍可用 Ctrl/Alt + ↑/↓ 調回歷史",
    ja: "無効: 通常の ↑/↓ はカーソル移動のみ(Ctrl/Alt + ↑/↓ では履歴を呼び出せます)",
    ko: "사용 안 함: 일반 ↑/↓는 커서만 이동(Ctrl/Alt + ↑/↓로는 기록을 불러올 수 있음)",
    de: "Nie: ↑/↓ bewegen nur den Cursor (Strg/Alt + ↑/↓ holen weiterhin den Verlauf)",
    fr: "Jamais : ↑/↓ ne déplacent que le curseur (Ctrl/Alt + ↑/↓ rappellent toujours l'historique)",
    es: "Nunca: ↑/↓ solo mueven el cursor (Ctrl/Alt + ↑/↓ siguen recuperando el historial)",
    pt: "Nunca: ↑/↓ apenas movem o cursor (Ctrl/Alt + ↑/↓ ainda recuperam o histórico)",
    th: "ปิด: ↑/↓ เลื่อนเคอร์เซอร์เท่านั้น (Ctrl/Alt + ↑/↓ ยังเรียกประวัติได้)",
    id: "Tidak pernah: ↑/↓ hanya memindahkan kursor (Ctrl/Alt + ↑/↓ tetap memanggil riwayat)",
    tr: "Hiç: ↑/↓ yalnızca imleci taşır (Ctrl/Alt + ↑/↓ geçmişi getirir)",
    ru: "Никогда: ↑/↓ только двигают курсор (Ctrl/Alt + ↑/↓ по-прежнему возвращают историю)",
    ar: "أبدًا: ↑/↓ تحرّكان المؤشر فقط (Ctrl/Alt + ↑/↓ لا تزال تعيد السجل)",
  },
};

/** ---------- Webview 词典(中文为源键) ---------- */
const WEBVIEW = {
  "输入历史:↑/↓ 调回之前发送过的内容": {
    "zh-tw": "輸入歷史:↑/↓ 調回之前傳送過的內容",
    ja: "入力履歴: ↑/↓ で以前送信した内容を呼び出す",
    ko: "입력 기록: ↑/↓로 이전에 보낸 내용을 불러옵니다",
    de: "Eingabeverlauf: ↑/↓ holt zuvor gesendete Inhalte zurück",
    fr: "Historique : ↑/↓ rappellent ce que vous avez déjà envoyé",
    es: "Historial: ↑/↓ recuperan lo que ya enviaste",
    pt: "Histórico: ↑/↓ recuperam o que você já enviou",
    th: "ประวัติการพิมพ์: ↑/↓ เรียกข้อความที่เคยส่งแล้ว",
    id: "Riwayat input: ↑/↓ memanggil isi yang pernah dikirim",
    tr: "Giriş geçmişi: ↑/↓ daha önce gönderdiklerinizi geri getirir",
    ru: "История ввода: ↑/↓ возвращают ранее отправленный текст",
    ar: "سجل الإدخال: يعيد ↑/↓ ما أرسلته سابقًا",
  },
  "↑/↓ 到边界才召回历史": {
    "zh-tw": "↑/↓ 到邊界才召回歷史", ja: "↑/↓ は端でのみ履歴を呼び出す", ko: "↑/↓ 끝에서만 기록 불러오기",
    de: "↑/↓ holen den Verlauf erst am Rand", fr: "↑/↓ ne rappellent qu'au bord", es: "↑/↓ solo en el borde",
    pt: "↑/↓ apenas na borda", th: "↑/↓ เรียกประวัติเฉพาะที่ขอบ", id: "↑/↓ hanya di tepi",
    tr: "↑/↓ yalnızca kenarda hatırla", ru: "↑/↓ только у края", ar: "↑/↓ عند الحافة فقط",
  },
  "光标还能上下移动时只移动光标;已经到首行 / 末行时,那一次按键立即调回历史(推荐:不会抢走光标移动)": {
    "zh-tw": "游標還能上下移動時只移動游標;已經到首行 / 末行時,該次按鍵立即調回歷史(建議)",
    ja: "カーソルが動ける間は移動のみ。先頭行 / 最終行に達している押下では即座に履歴を呼び出します(推奨)",
    ko: "커서가 움직일 수 있으면 이동만 하고, 첫 줄 / 마지막 줄에 닿으면 그 누름으로 바로 기록을 불러옵니다(권장)",
    de: "Solange der Cursor wandern kann, wandert er; am ersten/letzten Rand holt genau dieser Tastendruck den Verlauf (empfohlen)",
    fr: "Le curseur se déplace tant qu'il le peut ; arrivé au bord, l'appui rappelle l'historique (recommandé)",
    es: "El cursor se mueve mientras pueda; al llegar al borde, esa pulsación recupera el historial (recomendado)",
    pt: "O cursor se move enquanto puder; na borda, essa tecla recupera o histórico (recomendado)",
    th: "เลื่อนเคอร์เซอร์เมื่อยังทำได้ เมื่อถึงขอบบน/ล่างการกดนั้นจะเรียกประวัติทันที (แนะนำ)",
    id: "Kursor bergerak selama bisa; di tepi, penekanan itu memanggil riwayat (disarankan)",
    tr: "İmleç hareket edebildikçe kayar; kenara gelince o basış geçmişi getirir (önerilir)",
    ru: "Курсор движется, пока может; у края это нажатие возвращает историю (рекомендуется)",
    ar: "يتحرك المؤشر ما دام ممكنًا، وعند الحافة تعيد الضغطة السجل (موصى به)",
  },
  "↑/↓ 一按就召回历史": {
    "zh-tw": "↑/↓ 一按就召回歷史", ja: "↑/↓ は1回で履歴を呼び出す", ko: "↑/↓ 한 번에 기록 불러오기",
    de: "↑/↓ holen den Verlauf bei jedem Druck", fr: "↑/↓ rappellent à chaque appui", es: "↑/↓ en cada pulsación",
    pt: "↑/↓ a cada tecla", th: "↑/↓ เรียกประวัติทุกครั้งที่กด", id: "↑/↓ setiap penekanan",
    tr: "↑/↓ her basışta hatırla", ru: "↑/↓ при каждом нажатии", ar: "↑/↓ عند كل ضغطة",
  },
  "普通 ↑/↓ 不再移动光标,按下即调回上一条 / 下一条输入;要移动光标请用鼠标或 ←/→": {
    "zh-tw": "一般 ↑/↓ 不再移動游標,按下即調回上一條 / 下一條輸入;要移動游標請用滑鼠或 ←/→",
    ja: "通常の ↑/↓ はカーソルを動かさず、押すたびに前 / 次の入力を呼び出します。カーソル移動はマウスか ←/→ で",
    ko: "일반 ↑/↓는 커서를 움직이지 않고 누르는 즉시 이전/다음 입력을 불러옵니다. 커서 이동은 마우스나 ←/→를 쓰세요",
    de: "↑/↓ bewegen den Cursor nicht mehr und holen sofort die vorige/nächste Eingabe; Cursor mit Maus oder ←/→ bewegen",
    fr: "↑/↓ ne déplacent plus le curseur et rappellent l'entrée précédente/suivante ; utilisez la souris ou ←/→",
    es: "↑/↓ ya no mueven el cursor: recuperan la entrada anterior/siguiente; use el ratón o ←/→",
    pt: "↑/↓ não movem mais o cursor e recuperam a entrada anterior/seguinte; use o mouse ou ←/→",
    th: "↑/↓ ไม่เลื่อนเคอร์เซอร์แล้ว แต่เรียกข้อมูลก่อนหน้า/ถัดไปทันที ใช้เมาส์หรือ ←/→ เพื่อเลื่อนเคอร์เซอร์",
    id: "↑/↓ tidak lagi memindahkan kursor dan langsung memanggil input sebelumnya/berikutnya; pakai mouse atau ←/→",
    tr: "↑/↓ artık imleci taşımaz, hemen önceki/sonraki girişi getirir; imleç için fare veya ←/→ kullanın",
    ru: "↑/↓ больше не двигают курсор, а сразу возвращают предыдущий/следующий ввод; двигайте курсор мышью или ←/→",
    ar: "لم يعد ↑/↓ يحرّك المؤشر بل يعيد الإدخال السابق/التالي فورًا؛ حرّك المؤشر بالفأرة أو ←/→",
  },
  "关闭 ↑/↓ 召回": {
    "zh-tw": "關閉 ↑/↓ 召回", ja: "↑/↓ の履歴呼び出しを無効化", ko: "↑/↓ 기록 불러오기 끄기",
    de: "↑/↓-Verlauf deaktivieren", fr: "Désactiver le rappel ↑/↓", es: "Desactivar ↑/↓",
    pt: "Desativar ↑/↓", th: "ปิดการเรียกประวัติด้วย ↑/↓", id: "Matikan ↑/↓",
    tr: "↑/↓ hatırlamayı kapat", ru: "Отключить ↑/↓", ar: "تعطيل ↑/↓",
  },
  "普通方向键只移动光标;仍可用 Ctrl/Alt + ↑/↓ 调回历史": {
    "zh-tw": "一般方向鍵只移動游標;仍可用 Ctrl/Alt + ↑/↓ 調回歷史",
    ja: "通常の方向キーはカーソル移動のみ。Ctrl/Alt + ↑/↓ で履歴を呼び出せます",
    ko: "일반 방향키는 커서만 이동하며 Ctrl/Alt + ↑/↓로 기록을 불러올 수 있습니다",
    de: "Normale Pfeiltasten bewegen nur den Cursor; Strg/Alt + ↑/↓ holt weiterhin den Verlauf",
    fr: "Les flèches ne déplacent que le curseur ; Ctrl/Alt + ↑/↓ rappellent l'historique",
    es: "Las flechas solo mueven el cursor; Ctrl/Alt + ↑/↓ siguen recuperando el historial",
    pt: "As setas apenas movem o cursor; Ctrl/Alt + ↑/↓ ainda recuperam o histórico",
    th: "ปุ่มลูกศรเลื่อนเคอร์เซอร์เท่านั้น ส่วน Ctrl/Alt + ↑/↓ ยังเรียกประวัติได้",
    id: "Tombol panah hanya memindahkan kursor; Ctrl/Alt + ↑/↓ tetap memanggil riwayat",
    tr: "Ok tuşları yalnızca imleci taşır; Ctrl/Alt + ↑/↓ geçmişi getirir",
    ru: "Стрелки только двигают курсор; Ctrl/Alt + ↑/↓ по-прежнему возвращают историю",
    ar: "الأسهم تحرّك المؤشر فقط؛ Ctrl/Alt + ↑/↓ لا تزال تعيد السجل",
  },
  "Ctrl/Alt + ↑/↓ 在任何模式下都能立即调回历史;模式保存在 dsh.historyKey。": {
    "zh-tw": "Ctrl/Alt + ↑/↓ 在任何模式下都能立即調回歷史;模式儲存在 dsh.historyKey。",
    ja: "Ctrl/Alt + ↑/↓ はどのモードでも即座に履歴を呼び出します。モードは dsh.historyKey に保存されます。",
    ko: "Ctrl/Alt + ↑/↓는 모든 모드에서 즉시 기록을 불러옵니다. 모드는 dsh.historyKey에 저장됩니다.",
    de: "Strg/Alt + ↑/↓ holt in jedem Modus sofort den Verlauf; der Modus steht in dsh.historyKey.",
    fr: "Ctrl/Alt + ↑/↓ rappellent toujours l'historique ; le mode est enregistré dans dsh.historyKey.",
    es: "Ctrl/Alt + ↑/↓ recuperan el historial en cualquier modo; el modo se guarda en dsh.historyKey.",
    pt: "Ctrl/Alt + ↑/↓ recuperam o histórico em qualquer modo; o modo fica em dsh.historyKey.",
    th: "Ctrl/Alt + ↑/↓ เรียกประวัติได้ทันทีในทุกโหมด โหมดถูกบันทึกใน dsh.historyKey",
    id: "Ctrl/Alt + ↑/↓ selalu memanggil riwayat; mode disimpan di dsh.historyKey.",
    tr: "Ctrl/Alt + ↑/↓ her modda geçmişi getirir; mod dsh.historyKey içinde saklanır.",
    ru: "Ctrl/Alt + ↑/↓ возвращают историю в любом режиме; режим хранится в dsh.historyKey.",
    ar: "Ctrl/Alt + ↑/↓ تعيد السجل في كل الأوضاع؛ يُحفظ الوضع في dsh.historyKey.",
  },
};

const EN_TEXT_EXTRA_KEYS = Object.keys(WEBVIEW);

let nlsUpdated = 0;
for (const file of fs.readdirSync(root)) {
  const m = /^package\.nls(\.[a-z-]+)?\.json$/.exec(file);
  if (!m) continue;
  const lang = (m[1] ?? ".en").slice(1);
  const full = path.join(root, file);
  const dict = JSON.parse(fs.readFileSync(full, "utf8"));
  let touched = false;
  for (const [key, byLang] of Object.entries(NLS)) {
    const value = byLang[lang] ?? byLang.en;
    if (dict[key] === undefined) {
      dict[key] = value;
      touched = true;
    }
  }
  if (touched) {
    fs.writeFileSync(full, `${JSON.stringify(dict, null, 2)}\n`, "utf8");
    nlsUpdated += 1;
  }
}

let textsUpdated = 0;
const textsDir = path.join(root, "src/webview/texts");
for (const file of fs.readdirSync(textsDir)) {
  if (!file.endsWith(".json")) continue;
  const lang = file.replace(/\.json$/, "");
  const full = path.join(textsDir, file);
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
    textsUpdated += 1;
  }
}

console.log(`package.nls updated: ${nlsUpdated}; webview texts updated: ${textsUpdated}`);
console.log(`ui.ts 需补 EN_TEXT 的键(${EN_TEXT_EXTRA_KEYS.length}):`);
for (const k of EN_TEXT_EXTRA_KEYS) console.log(`  ${k}`);
