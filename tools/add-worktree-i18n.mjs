// 0.13.54:工作树卡片 + 账号自动刷新的 14 语言文案。
import fs from "node:fs";
import path from "node:path";

const ROOT = "D:/Workspace/vscode";

const KEYS = {
  "工作树": { en: "Worktree", "zh-tw": "工作樹", ja: "ワークツリー", ko: "워크트리", de: "Worktree", fr: "Arbre de travail", es: "Árbol de trabajo", pt: "Árvore de trabalho", th: "เวิร์กทรี", id: "Worktree", tr: "Çalışma ağacı", ru: "Рабочее дерево", ar: "شجرة العمل" },
  "定位": { en: "Reveal", "zh-tw": "定位", ja: "表示", ko: "위치 열기", de: "Anzeigen", fr: "Révéler", es: "Mostrar", pt: "Mostrar", th: "แสดงตำแหน่ง", id: "Tampilkan", tr: "Göster", ru: "Показать", ar: "إظهار" },
  "在资源管理器中显示该工作树": { en: "Reveal this worktree in the explorer", "zh-tw": "在檔案總管中顯示此工作樹", ja: "このワークツリーをエクスプローラーで表示", ko: "이 워크트리를 탐색기에 표시", de: "Diesen Worktree im Explorer anzeigen", fr: "Révéler ce worktree dans l'explorateur", es: "Mostrar este árbol de trabajo en el explorador", pt: "Mostrar esta árvore de trabalho no explorador", th: "แสดงเวิร์กทรีนี้ในตัวสำรวจไฟล์", id: "Tampilkan worktree ini di penjelajah", tr: "Bu çalışma ağacını gezginde göster", ru: "Показать это рабочее дерево в проводнике", ar: "إظهار شجرة العمل هذه في المستكشف" },
  "复制路径": { en: "Copy path", "zh-tw": "複製路徑", ja: "パスをコピー", ko: "경로 복사", de: "Pfad kopieren", fr: "Copier le chemin", es: "Copiar ruta", pt: "Copiar caminho", th: "คัดลอกพาธ", id: "Salin jalur", tr: "Yolu kopyala", ru: "Копировать путь", ar: "نسخ المسار" },
};

const uiPath = path.join(ROOT, "src/webview/ui.ts");
let ui = fs.readFileSync(uiPath, "utf8");
const anchor = '  "点击查看大图": "Click to enlarge",';
if (!ui.includes(anchor)) {
  console.error("EN_TEXT anchor missing");
  process.exit(1);
}
const lines = Object.entries(KEYS)
  .filter(([k]) => !ui.includes(`${JSON.stringify(k)}:`))
  .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v.en)},`)
  .join("\n");
if (lines) {
  ui = ui.replace(anchor, `${anchor}\n  // ---- 工作树卡片 ----\n${lines}`);
  fs.writeFileSync(uiPath, ui, "utf8");
  console.log("ui.ts EN_TEXT: added", lines.split("\n").length);
} else {
  console.log("ui.ts EN_TEXT: nothing to add");
}

let updated = 0;
const dir = path.join(ROOT, "src/webview/texts");
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
