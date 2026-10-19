// 0.13.56 补充:发现模型表单与标题行也放宽(与命名空间表单一致)。
import fs from "node:fs";

const file = "D:/Workspace/vscode/media/chat.css";
const eol = fs.readFileSync(file, "utf8").includes("\r\n") ? "\r\n" : "\n";
let css = fs.readFileSync(file, "utf8").split("\r\n").join("\n");

const OLD = `.settings-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
}

.settings-field { display: flex; flex-direction: column; gap: 2px; }

.settings-field > .settings-field-label {
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
}`;
if (css.split(OLD).length - 1 !== 1) {
  console.error("settings-form-grid 锚点不匹配");
  process.exit(1);
}
const NEW = `.settings-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 14px;
  margin-bottom: 4px;
}

@media (max-width: 430px) {
  .settings-form-grid {
    grid-template-columns: 1fr;
  }
}

.settings-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.settings-field > .settings-field-label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--vscode-foreground);
}`;
css = css.replace(OLD, NEW);

// 标题行允许换行(长命名空间 id + rev 徽标不再挤成一行)
const TITLE = `.settings-section-title {
  display: flex;
  align-items: center;
  gap: 6px;`;
if (css.split(TITLE).length - 1 !== 1) {
  console.error("settings-section-title 锚点不匹配");
  process.exit(1);
}
css = css.replace(
  TITLE,
  `.settings-section-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;`,
);

fs.writeFileSync(file, eol === "\r\n" ? css.split("\n").join("\r\n") : css, "utf8");
console.log("chat.css: 发现模型表单间距 + 标题换行");
