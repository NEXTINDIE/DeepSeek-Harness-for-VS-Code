// 一次性脚本:为各语言词典补齐系统提示词卡片的新文案键。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const additions = {
  "zh-tw": {
    "系统提示词": "系統提示詞",
    "已注入模型 · 点击展开": "已注入模型 · 點擊展開",
  },
  ja: {
    "系统提示词": "システムプロンプト",
    "已注入模型 · 点击展开": "モデルに注入済み · クリックで展開",
  },
  ko: {
    "系统提示词": "시스템 프롬프트",
    "已注入模型 · 点击展开": "모델에 주입됨 · 클릭하여 펼치기",
  },
  de: {
    "系统提示词": "System-Prompt",
    "已注入模型 · 点击展开": "Ins Modell eingespielt · zum Aufklappen klicken",
  },
  fr: {
    "系统提示词": "Invite système",
    "已注入模型 · 点击展开": "Injecté dans le modèle · cliquer pour déplier",
  },
  es: {
    "系统提示词": "Indicación del sistema",
    "已注入模型 · 点击展开": "Inyectado en el modelo · clic para expandir",
  },
  pt: {
    "系统提示词": "Prompt do sistema",
    "已注入模型 · 点击展开": "Injetado no modelo · clique para expandir",
  },
  th: {
    "系统提示词": "พรอมต์ระบบ",
    "已注入模型 · 点击展开": "ฉีดเข้าสู่โมเดลแล้ว · คลิกเพื่อขยาย",
  },
  id: {
    "系统提示词": "Prompt sistem",
    "已注入模型 · 点击展开": "Disuntikkan ke model · klik untuk meluaskan",
  },
  tr: {
    "系统提示词": "Sistem istemi",
    "已注入模型 · 点击展开": "Modele enjekte edildi · genişletmek için tıkla",
  },
  ar: {
    "系统提示词": "موجه النظام",
    "已注入模型 · 点击展开": "تم الحقن في النموذج · انقر للتوسيع",
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
