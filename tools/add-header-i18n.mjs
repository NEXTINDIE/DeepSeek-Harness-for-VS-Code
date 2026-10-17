/**
 * 0.13.48:顶部改版与菜单去 emoji 的新文案。
 * 新建对话 / 分叉会话 / 复制会话 ID / 新会话 —— EN_TEXT + 12 种语言。
 */
import fs from "node:fs";
import path from "node:path";

const root = "D:/Workspace/vscode";

const KEYS = {
  "新建对话": {
    en: "New chat",
    "zh-tw": "新建對話", ja: "新しい対話", ko: "새 대화", de: "Neuer Chat",
    fr: "Nouvelle conversation", es: "Nueva conversación", pt: "Nova conversa",
    th: "แชทใหม่", id: "Obrolan baru", tr: "Yeni sohbet",
    ru: "Новый диалог", ar: "محادثة جديدة",
  },
  "分叉会话": {
    en: "Fork session",
    "zh-tw": "分叉工作階段", ja: "セッションを分岐", ko: "세션 분기", de: "Sitzung abzweigen",
    fr: "Créer une branche de session", es: "Bifurcar sesión", pt: "Bifurcar sessão",
    th: "แตกแขนงเซสชัน", id: "Cabangkan sesi", tr: "Oturumu dallandır",
    ru: "Ответвить сеанс", ar: "تفريع الجلسة",
  },
  "复制会话 ID": {
    en: "Copy session ID",
    "zh-tw": "複製工作階段 ID", ja: "セッション ID をコピー", ko: "세션 ID 복사", de: "Sitzungs-ID kopieren",
    fr: "Copier l'ID de session", es: "Copiar ID de sesión", pt: "Copiar ID da sessão",
    th: "คัดลอก ID เซสชัน", id: "Salin ID sesi", tr: "Oturum kimliğini kopyala",
    ru: "Скопировать ID сеанса", ar: "نسخ معرّف الجلسة",
  },
  "新会话": {
    en: "New session",
    "zh-tw": "新工作階段", ja: "新しいセッション", ko: "새 세션", de: "Neue Sitzung",
    fr: "Nouvelle session", es: "Sesión nueva", pt: "Sessão nova",
    th: "เซสชันใหม่", id: "Sesi baru", tr: "Yeni oturum",
    ru: "Новый сеанс", ar: "جلسة جديدة",
  },
};

// 1) EN_TEXT(插在输入历史注释之前的位置即可,按锚点插入)
const uiPath = path.join(root, "src/webview/ui.ts");
let ui = fs.readFileSync(uiPath, "utf8");
const anchor = `  "重命名会话": "Rename session",`;
if (!ui.includes(anchor)) {
  console.error("EN_TEXT anchor not found");
  process.exit(1);
}
const lines = Object.entries(KEYS)
  .filter(([k]) => !ui.includes(`${JSON.stringify(k)}:`))
  .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v.en)},`)
  .join("\n");
if (lines) {
  ui = ui.replace(anchor, `${anchor}\n  // ---- 顶部改版:新建对话按钮与会话菜单(去 emoji) ----\n${lines}`);
  fs.writeFileSync(uiPath, ui, "utf8");
  console.log("ui.ts EN_TEXT: added", lines.split("\n").length);
} else {
  console.log("ui.ts EN_TEXT: nothing to add");
}

// 2) 12 语言词典
let updated = 0;
const dir = path.join(root, "src/webview/texts");
for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith(".json")) continue;
  const lang = file.replace(/\.json$/, "");
  const full = path.join(dir, file);
  const dict = JSON.parse(fs.readFileSync(full, "utf8"));
  let touched = false;
  for (const [key, byLang] of Object.entries(KEYS)) {
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
console.log(`texts/*.json updated: ${updated}`);
