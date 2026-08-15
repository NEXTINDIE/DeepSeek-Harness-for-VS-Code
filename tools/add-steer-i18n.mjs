// 为插队(steer)修复添加 i18n 键:
// 1) texts/*.json(12 个语言文件): 新增 webview 提示文案键(中文源串)
// 2) l10n/bundle.l10n.*.json(13 个): 新增 notice.steerAccepted / notice.steerUnavailable
// 保持 2 空格缩进 + LF + 无 BOM,键插在"排队消息"相关区域附近(JSON 对象顺序无关紧要,统一追加到末尾前的固定锚点键之后)。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const TEXT_KEY = "当前回合已结束,无法插队;消息将在下一轮自动处理";

const textValues = {
  "zh-tw": "當前回合已結束,無法插隊;消息將在下一輪自動處理",
  "ja": "現在のターンは終了しており、割り込みはできません。メッセージは次のターンで自動的に送信されます",
  "ko": "현재 턴이 종료되어 끼어들기가 불가능합니다. 메시지는 다음 턴에서 자동으로 전송됩니다",
  "de": "Die aktuelle Runde ist beendet und kann nicht mehr unterbrochen werden; die Nachricht wird automatisch in der nächsten Runde gesendet",
  "fr": "La tournée en cours est terminée et n'accepte plus d'interruption ; le message sera envoyé automatiquement au prochain tour",
  "es": "El turno actual ha terminado y ya no acepta interrupciones; el mensaje se enviará automáticamente en el próximo turno",
  "pt": "A rodada atual terminou e não aceita mais interrupções; a mensagem será enviada automaticamente na próxima rodada",
  "th": "รอบปัจจุบันสิ้นสุดแล้วและไม่สามารถแทรกคิวได้ ข้อความจะถูกส่งอัตโนมัติในรอบถัดไป",
  "id": "Giliran saat ini telah berakhir dan tidak dapat menerima sisipan; pesan akan dikirim otomatis pada giliran berikutnya",
  "tr": "Mevcut tur sona erdi ve araya girme kabul edilmiyor; mesaj bir sonraki turda otomatik gönderilecek",
  "ar": "انتهى الدور الحالي ولم يعد يقبل التدخل؛ سيتم إرسال الرسالة تلقائيًا في الدور التالي",
  "ru": "Текущий ход завершён, вмешательство больше невозможно; сообщение будет отправлено автоматически в следующем ходе",
};

const bundleValues = {
  "notice.steerAccepted": {
    "en": "Steered into the current turn — it will be handled right after the current response finishes",
    "zh-cn": "已插队:将在当前回答结束后优先处理该消息",
    "zh-tw": "已插隊:將在當前回答結束後優先處理該訊息",
    "ja": "割り込み挿入しました:現在の回答が終わり次第、このメッセージを優先して処理します",
    "ko": "끼어들기 완료: 현재 응답이 끝난 후 이 메시지를 우선 처리합니다",
    "de": "Eingefügt: wird direkt nach der aktuellen Antwort priorisiert bearbeitet",
    "fr": "Insertion réussie : sera traitée en priorité dès la fin de la réponse en cours",
    "es": "Insertado: se procesará con prioridad al terminar la respuesta actual",
    "pt": "Inserido: será processado com prioridade após a resposta atual terminar",
    "th": "แทรกคิวแล้ว: จะถูกประมวลผลทันทีหลังจากคำตอบปัจจุบันเสร็จสิ้น",
    "id": "Disisipkan: akan diproses dengan prioritas setelah respons saat ini selesai",
    "tr": "Araya eklendi: mevcut yanıt bittikten hemen sonra öncelikli olarak işlenecek",
    "ar": "تم التدخل: سيتم معالجة الرسالة بأولوية فور انتهاء الرد الحالي",
    "ru": "Вмешательство выполнено: сообщение будет обработано сразу после завершения текущего ответа",
  },
  "notice.steerUnavailable": {
    "en": "The current turn has ended and no longer accepts steering; the message will be sent automatically in the next turn",
    "zh-cn": "当前回合已结束,无法插队;该消息将在下一轮自动发送",
    "zh-tw": "當前回合已結束,無法插隊;該訊息將在下一輪自動發送",
    "ja": "現在のターンは終了しており、割り込みできません。メッセージは次のターンで自動送信されます",
    "ko": "현재 턴이 종료되어 끼어들 수 없습니다. 메시지는 다음 턴에서 자동 전송됩니다",
    "de": "Die aktuelle Runde ist beendet, eine Unterbrechung ist nicht mehr möglich; die Nachricht wird automatisch in der nächsten Runde gesendet",
    "fr": "La tournée en cours est terminée et n'accepte plus d'interruption ; le message sera envoyé automatiquement au prochain tour",
    "es": "El turno actual ha terminado y ya no se puede interrumpir; el mensaje se enviará automáticamente en el próximo turno",
    "pt": "A rodada atual terminou e não é mais possível interromper; a mensagem será enviada automaticamente na próxima rodada",
    "th": "รอบปัจจุบันสิ้นสุดแล้ว ไม่สามารถแทรกคิวได้ ข้อความจะถูกส่งอัตโนมัติในรอบถัดไป",
    "id": "Giliran saat ini telah berakhir dan tidak dapat disisipi; pesan akan dikirim otomatis pada giliran berikutnya",
    "tr": "Mevcut tur sona erdi ve araya girilemiyor; mesaj bir sonraki turda otomatik gönderilecek",
    "ar": "انتهى الدور الحالي ولم يعد من الممكن التدخل؛ سيتم إرسال الرسالة تلقائيًا في الدور التالي",
    "ru": "Текущий ход завершён, вмешательство невозможно; сообщение будет отправлено автоматически в следующем ходе",
  },
};

let changed = 0;
const langs = ["zh-tw", "ja", "ko", "de", "fr", "es", "pt", "th", "id", "tr", "ar", "ru"];
for (const lang of langs) {
  const file = `${root}src/webview/texts/${lang}.json`;
  const obj = JSON.parse(readFileSync(file, "utf8"));
  if (obj[TEXT_KEY] !== undefined) {
    console.log(`texts/${lang}.json: key already present, skip`);
    continue;
  }
  obj[TEXT_KEY] = textValues[lang];
  writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
  changed++;
  console.log(`texts/${lang}.json: +1 key`);
}

const bundleLangs = ["en", "zh-cn", "zh-tw", "ja", "ko", "de", "fr", "es", "pt", "th", "id", "tr", "ar", "ru"];
for (const lang of bundleLangs) {
  const file = lang === "en" ? `${root}l10n/bundle.l10n.json` : `${root}l10n/bundle.l10n.${lang}.json`;
  const obj = JSON.parse(readFileSync(file, "utf8"));
  let added = 0;
  for (const [key, values] of Object.entries(bundleValues)) {
    if (obj[key] === undefined) {
      obj[key] = values[lang];
      added++;
    } else {
      console.log(`bundle ${lang}: ${key} already present`);
    }
  }
  if (added) {
    writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
    changed++;
    console.log(`bundle.l10n.${lang}.json: +${added} keys`);
  }
}

console.log(`\ndone, ${changed} files touched`);
