// 一次性脚本:为各语言词典补齐计划模式进入/退出命令的新文案键。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const additions = {
  "zh-tw": {
    "点击退出计划模式(发送 /plan off)": "點擊退出計畫模式(傳送 /plan off)",
    "插入 /plan 到输入框,回车后进入计划模式": "插入 /plan 到輸入框,按 Enter 進入計畫模式",
    "插入 /plan off 到输入框,回车后退出计划模式": "插入 /plan off 到輸入框,按 Enter 退出計畫模式",
    "退出计划模式": "退出計畫模式",
  },
  ja: {
    "点击退出计划模式(发送 /plan off)": "クリックで計画モードを終了(/plan off を送信)",
    "插入 /plan 到输入框,回车后进入计划模式": "/plan を入力欄に挿入し、Enter で計画モードに入る",
    "插入 /plan off 到输入框,回车后退出计划模式": "/plan off を入力欄に挿入し、Enter で計画モードを終了",
    "退出计划模式": "計画モードを終了",
  },
  ko: {
    "点击退出计划模式(发送 /plan off)": "클릭하여 계획 모드 종료(/plan off 전송)",
    "插入 /plan 到输入框,回车后进入计划模式": "/plan을 입력란에 삽입하고 Enter로 계획 모드 시작",
    "插入 /plan off 到输入框,回车后退出计划模式": "/plan off를 입력란에 삽입하고 Enter로 계획 모드 종료",
    "退出计划模式": "계획 모드 종료",
  },
  de: {
    "点击退出计划模式(发送 /plan off)": "Klicken zum Beenden des Planungsmodus (sendet /plan off)",
    "插入 /plan 到输入框,回车后进入计划模式": "/plan einfügen; Enter startet den Planungsmodus",
    "插入 /plan off 到输入框,回车后退出计划模式": "/plan off einfügen; Enter beendet den Planungsmodus",
    "退出计划模式": "Planungsmodus beenden",
  },
  fr: {
    "点击退出计划模式(发送 /plan off)": "Cliquer pour quitter le mode plan (envoie /plan off)",
    "插入 /plan 到输入框,回车后进入计划模式": "Insérer /plan ; Entrée active le mode plan",
    "插入 /plan off 到输入框,回车后退出计划模式": "Insérer /plan off ; Entrée quitte le mode plan",
    "退出计划模式": "Quitter le mode plan",
  },
  es: {
    "点击退出计划模式(发送 /plan off)": "Clic para salir del modo plan (envía /plan off)",
    "插入 /plan 到输入框,回车后进入计划模式": "Insertar /plan; Enter activa el modo plan",
    "插入 /plan off 到输入框,回车后退出计划模式": "Insertar /plan off; Enter sale del modo plan",
    "退出计划模式": "Salir del modo plan",
  },
  pt: {
    "点击退出计划模式(发送 /plan off)": "Clique para sair do modo plano (envia /plan off)",
    "插入 /plan 到输入框,回车后进入计划模式": "Inserir /plan; Enter ativa o modo plano",
    "插入 /plan off 到输入框,回车后退出计划模式": "Inserir /plan off; Enter sai do modo plano",
    "退出计划模式": "Sair do modo plano",
  },
  th: {
    "点击退出计划模式(发送 /plan off)": "คลิกเพื่อออกจากโหมดแผน (ส่ง /plan off)",
    "插入 /plan 到输入框,回车后进入计划模式": "แทรก /plan แล้วกด Enter เพื่อเข้าโหมดแผน",
    "插入 /plan off 到输入框,回车后退出计划模式": "แทรก /plan off แล้วกด Enter เพื่อออกจากโหมดแผน",
    "退出计划模式": "ออกจากโหมดแผน",
  },
  id: {
    "点击退出计划模式(发送 /plan off)": "Klik untuk keluar dari mode rencana (mengirim /plan off)",
    "插入 /plan 到输入框,回车后进入计划模式": "Sisipkan /plan; Enter memasuki mode rencana",
    "插入 /plan off 到输入框,回车后退出计划模式": "Sisipkan /plan off; Enter keluar dari mode rencana",
    "退出计划模式": "Keluar dari mode rencana",
  },
  tr: {
    "点击退出计划模式(发送 /plan off)": "Plan modundan çıkmak için tıkla (/plan off gönderir)",
    "插入 /plan 到输入框,回车后进入计划模式": "/plan ekle; Enter plan moduna girer",
    "插入 /plan off 到输入框,回车后退出计划模式": "/plan off ekle; Enter plan modundan çıkar",
    "退出计划模式": "Plan modundan çık",
  },
  ar: {
    "点击退出计划模式(发送 /plan off)": "انقر للخروج من وضع الخطة (يرسل /plan off)",
    "插入 /plan 到输入框,回车后进入计划模式": "أدخل /plan؛ Enter يدخل وضع الخطة",
    "插入 /plan off 到输入框,回车后退出计划模式": "أدخل /plan off؛ Enter يخرج من وضع الخطة",
    "退出计划模式": "الخروج من وضع الخطة",
  },
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
