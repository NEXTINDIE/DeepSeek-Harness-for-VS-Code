// 一次性脚本:为各语言词典补齐计划审批内联输入的新文案键。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const additions = {
  "zh-tw": { "输入修改意见,回车发送": "輸入修改意見,按 Enter 傳送" },
  ja: { "输入修改意见,回车发送": "修正意見を入力し、Enter で送信" },
  ko: { "输入修改意见,回车发送": "수정 의견을 입력하고 Enter로 전송" },
  de: { "输入修改意见,回车发送": "Feedback eingeben, mit Enter senden" },
  fr: { "输入修改意见,回车发送": "Saisissez votre retour, Entrée pour envoyer" },
  es: { "输入修改意见,回车发送": "Escribe tu comentario, Enter para enviar" },
  pt: { "输入修改意见,回车发送": "Digite o feedback, Enter para enviar" },
  th: { "输入修改意见,回车发送": "พิมพ์ข้อเสนอแนะ แล้วกด Enter เพื่อส่ง" },
  id: { "输入修改意见,回车发送": "Ketik masukan, Enter untuk mengirim" },
  tr: { "输入修改意见,回车发送": "Geri bildirimi yazın, göndermek için Enter" },
  ar: { "输入修改意见,回车发送": "اكتب ملاحظاتك واضغط Enter للإرسال" },
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
