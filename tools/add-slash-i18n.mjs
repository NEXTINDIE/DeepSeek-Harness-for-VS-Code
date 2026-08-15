// 一次性脚本:为各语言词典补齐斜杠补全与技能 token 的新文案键。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const additions = {
  "zh-tw": {
    "命令 / 技能": "命令 / 技能",
    "命令 {name}": "命令 {name}",
    "插入 /名称 调用技能(发送时自动展开技能正文)": "插入 /名稱 呼叫技能(傳送時自動展開技能正文)",
  },
  ja: {
    "命令 / 技能": "コマンド / スキル",
    "命令 {name}": "コマンド {name}",
    "插入 /名称 调用技能(发送时自动展开技能正文)": "/名前 を挿入してスキルを呼び出す(送信時に本文を自動展開)",
  },
  ko: {
    "命令 / 技能": "명령 / 스킬",
    "命令 {name}": "명령 {name}",
    "插入 /名称 调用技能(发送时自动展开技能正文)": "/이름 을 삽입해 스킬 호출(전송 시 본문 자동 확장)",
  },
  de: {
    "命令 / 技能": "Befehle / Fähigkeiten",
    "命令 {name}": "Befehl {name}",
    "插入 /名称 调用技能(发送时自动展开技能正文)": "/Name einfügen, um die Fähigkeit aufzurufen (Inhalt wird beim Senden entfaltet)",
  },
  fr: {
    "命令 / 技能": "Commandes / compétences",
    "命令 {name}": "Commande {name}",
    "插入 /名称 调用技能(发送时自动展开技能正文)": "Insérer /nom pour invoquer (le corps est déployé à l'envoi)",
  },
  es: {
    "命令 / 技能": "Comandos / habilidades",
    "命令 {name}": "Comando {name}",
    "插入 /名称 调用技能(发送时自动展开技能正文)": "Insertar /nombre para invocar (el cuerpo se expande al enviar)",
  },
  pt: {
    "命令 / 技能": "Comandos / habilidades",
    "命令 {name}": "Comando {name}",
    "插入 /名称 调用技能(发送时自动展开技能正文)": "Inserir /nome para invocar (o corpo é expandido ao enviar)",
  },
  th: {
    "命令 / 技能": "คำสั่ง / สกิล",
    "命令 {name}": "คำสั่ง {name}",
    "插入 /名称 调用技能(发送时自动展开技能正文)": "แทรก /ชื่อ เพื่อเรียกใช้ (ขยายเนื้อหาเมื่อส่ง)",
  },
  id: {
    "命令 / 技能": "Perintah / skill",
    "命令 {name}": "Perintah {name}",
    "插入 /名称 调用技能(发送时自动展开技能正文)": "Sisipkan /nama untuk memanggil (isi diperluas saat mengirim)",
  },
  tr: {
    "命令 / 技能": "Komutlar / beceriler",
    "命令 {name}": "Komut {name}",
    "插入 /名称 调用技能(发送时自动展开技能正文)": "/ad ekleyerek çağır (gönderirken içerik genişler)",
  },
  ar: {
    "命令 / 技能": "الأوامر / المهارات",
    "命令 {name}": "الأمر {name}",
    "插入 /名称 调用技能(发送时自动展开技能正文)": "أدخل /الاسم للاستدعاء (يُوسّع المحتوى عند الإرسال)",
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
  console.log(`${lang}.json: +${added}`);
}
