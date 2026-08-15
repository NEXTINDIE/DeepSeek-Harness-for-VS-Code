// 一次性脚本:为各语言词典补齐审批卡新文案键。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const additions = {
  "zh-tw": {
    "允许一次": "允許一次",
    "工具 {toolName} 请求越权执行": "工具 {toolName} 請求越權執行",
  },
  ja: {
    "允许一次": "1回だけ許可",
    "工具 {toolName} 请求越权执行": "ツール {toolName} が権限外の実行を要求",
  },
  ko: {
    "允许一次": "한 번만 허용",
    "工具 {toolName} 请求越权执行": "도구 {toolName} 권한 밖 실행 요청",
  },
  de: {
    "允许一次": "Einmal erlauben",
    "工具 {toolName} 请求越权执行": "Tool {toolName} fordert privilegierte Ausführung",
  },
  fr: {
    "允许一次": "Autoriser une fois",
    "工具 {toolName} 请求越权执行": "L'outil {toolName} demande une exécution privilégiée",
  },
  es: {
    "允许一次": "Permitir una vez",
    "工具 {toolName} 请求越权执行": "La herramienta {toolName} solicita ejecución privilegiada",
  },
  pt: {
    "允许一次": "Permitir uma vez",
    "工具 {toolName} 请求越权执行": "A ferramenta {toolName} solicita execução privilegiada",
  },
  th: {
    "允许一次": "อนุญาตครั้งเดียว",
    "工具 {toolName} 请求越权执行": "เครื่องมือ {toolName} ขอสิทธิ์การทำงานพิเศษ",
  },
  id: {
    "允许一次": "Izinkan sekali",
    "工具 {toolName} 请求越权执行": "Alat {toolName} meminta eksekusi istimewa",
  },
  tr: {
    "允许一次": "Bir kez izin ver",
    "工具 {toolName} 请求越权执行": "{toolName} aracı ayrıcalıklı çalıştırma istiyor",
  },
  ar: {
    "允许一次": "السماح مرة واحدة",
    "工具 {toolName} 请求越权执行": "تطلب الأداة {toolName} تنفيذًا بصلاحيات مميزة",
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
