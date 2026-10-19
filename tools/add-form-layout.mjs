// 0.13.56:表单新文案 + 设置表单宽松排版/线性图标按钮的样式。
import fs from "node:fs";
import path from "node:path";

const ROOT = "D:/Workspace/vscode";

// ---------- 1) i18n ----------
const KEYS = {
  "发现模型": { en: "Discover models", "zh-tw": "探索模型", ja: "モデルを検出", ko: "모델 찾기", de: "Modelle ermitteln", fr: "Découvrir les modèles", es: "Descubrir modelos", pt: "Descobrir modelos", th: "ค้นหาโมเดล", id: "Temukan model", tr: "Modelleri keşfet", ru: "Найти модели", ar: "اكتشاف النماذج" },
  "JSON 格式有误,修正后才会保存。": {
    en: "Invalid JSON — the value will not be saved until it is fixed.",
    "zh-tw": "JSON 格式有誤,修正後才會儲存。",
    ja: "JSON の書式が正しくありません。修正するまで保存されません。",
    ko: "JSON 형식이 잘못되었습니다. 수정하기 전에는 저장되지 않습니다.",
    de: "Ungültiges JSON — der Wert wird erst nach der Korrektur gespeichert.",
    fr: "JSON invalide — la valeur ne sera pas enregistrée avant correction.",
    es: "JSON no válido: no se guardará hasta corregirlo.",
    pt: "JSON inválido — não será salvo até ser corrigido.",
    th: "รูปแบบ JSON ไม่ถูกต้อง จะยังไม่บันทึกจนกว่าจะแก้ไข",
    id: "JSON tidak valid — tidak akan disimpan sampai diperbaiki.",
    tr: "Geçersiz JSON — düzeltilene kadar kaydedilmez.",
    ru: "Неверный JSON — значение не будет сохранено до исправления.",
    ar: "JSON غير صالح — لن يتم الحفظ حتى يتم تصحيحه.",
  },
};

const uiPath = path.join(ROOT, "src/webview/ui.ts");
let ui = fs.readFileSync(uiPath, "utf8");
const anchor = '  "点击查看大图": "Click to enlarge",';
const lines = Object.entries(KEYS)
  .filter(([k]) => !ui.includes(`${JSON.stringify(k)}:`))
  .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v.en)},`)
  .join("\n");
if (lines) {
  ui = ui.replace(anchor, `${anchor}\n${lines}`);
  fs.writeFileSync(uiPath, ui, "utf8");
  console.log("ui.ts EN_TEXT: added", lines.split("\n").length);
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

// ---------- 2) CSS ----------
const cssPath = path.join(ROOT, "media/chat.css");
const eol = fs.readFileSync(cssPath, "utf8").includes("\r\n") ? "\r\n" : "\n";
let css = fs.readFileSync(cssPath, "utf8").split("\r\n").join("\n");

const ANCHOR = ".settings-section {";
if (css.split(ANCHOR).length - 1 !== 1) {
  console.error("settings-section 锚点不匹配");
  process.exit(1);
}

const BLOCK = `/* ---------- 设置表单:宽松排版(标签在上、控件在下) + 线性图标按钮 ---------- */
.settings-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 4px 0 2px;
}

.settings-field-row {
  display: flex;
  min-width: 0;
  gap: 8px;
}

/* 输入类字段:标签 + 说明在上,控件占满整行 */
.settings-field-row.settings-field-col {
  flex-direction: column;
  align-items: stretch;
  gap: 5px;
}

.settings-field-label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--vscode-foreground);
  line-height: 1.4;
  overflow-wrap: break-word;
}

.settings-field-hint {
  font-size: 10.5px;
  line-height: 1.45;
  color: var(--vscode-descriptionForeground);
  margin-top: -2px;
}

.settings-field-hint[hidden] {
  display: none;
}

.settings-field-error {
  font-size: 10.5px;
  line-height: 1.4;
  color: var(--vscode-errorForeground, #f48771);
}

.settings-field-error[hidden] {
  display: none;
}

/* 控件:更高、更宽的点击区,聚焦有明确描边 */
.settings-input,
.settings-textarea,
select.settings-input {
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.45;
  padding: 6px 9px;
  min-height: 30px;
  border: 1px solid var(--vscode-input-border, var(--vscode-editorWidget-border, rgba(128, 128, 128, 0.35)));
  border-radius: 6px;
  background: var(--vscode-input-background, transparent);
  color: var(--vscode-input-foreground, inherit);
}

.settings-textarea {
  min-height: 74px;
  resize: vertical;
  font-family: var(--vscode-editor-font-family, Consolas, monospace);
  line-height: 1.5;
}

.settings-input:focus,
.settings-textarea:focus,
select.settings-input:focus {
  outline: 1px solid var(--vscode-focusBorder, #007fd4);
  outline-offset: -1px;
  border-color: transparent;
}

.settings-input.invalid,
.settings-textarea.invalid {
  border-color: var(--vscode-errorForeground, #f48771);
  outline-color: var(--vscode-errorForeground, #f48771);
}

/* 密钥行:输入框 + 图标按钮同一行 */
.settings-input-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.settings-input-row .settings-input {
  flex: 1;
  min-width: 0;
}

/* 布尔字段:标签与开关同一行 */
.settings-field-row input[type="checkbox"] {
  width: 15px;
  height: 15px;
  accent-color: var(--vscode-focusBorder, #007fd4);
}

/* 操作行:与字段之间用细分隔线分开 */
.settings-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--vscode-panel-border, rgba(128, 128, 128, 0.22));
}

.settings-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid var(--vscode-editorWidget-border, var(--dsh-surface-border));
  background: var(--vscode-input-background, transparent);
  color: var(--vscode-foreground);
  font-size: 11.5px;
  line-height: 1.5;
  cursor: pointer;
}

.settings-btn:hover {
  background: var(--vscode-toolbar-hoverBackground, var(--dsh-surface-soft));
}

.settings-btn svg {
  flex: none;
  opacity: 0.9;
}

.settings-btn-primary {
  border-color: var(--vscode-focusBorder, #007fd4);
  color: var(--vscode-textLink-foreground, #3794ff);
}

.settings-btn-small {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  font-size: 11px;
  flex: none;
}

.settings-section {`;

css = css.replace(ANCHOR, BLOCK);

// 分区更宽松:内边距与标题分隔
const SECTION_OLD = `.settings-section {
  display: flex;
  flex-direction: column;
  gap: 3px;
  border: 1px solid var(--vscode-panel-border, rgba(128, 128, 128, 0.25));
  border-radius: 6px;
  padding: 6px;
}`;
if (css.split(SECTION_OLD).length - 1 !== 1) {
  console.error("settings-section 规则体不匹配");
  process.exit(1);
}
css = css.replace(
  SECTION_OLD,
  `.settings-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--vscode-panel-border, rgba(128, 128, 128, 0.25));
  border-radius: 10px;
  padding: 12px 14px 12px;
  background: var(--vscode-editorWidget-background, transparent);
}`,
);

fs.writeFileSync(cssPath, eol === "\r\n" ? css.split("\n").join("\r\n") : css, "utf8");
console.log("chat.css: 表单排版 + 按钮样式");
