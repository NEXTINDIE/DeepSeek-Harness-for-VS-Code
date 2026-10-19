// 发布 0.13.57:交付文件卡对齐网页端(类型图标 / 整卡可点 / 图标化操作)。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const PREV = "0.13.56";
const ENTRY_EN = `## 0.13.57
- **Deliverable cards now match the web card anatomy.** Every presented file used to show the same copy glyph as its icon — it looked like a stray button. Icons are now a 34px rounded tile tinted by file type with the matching pictogram: images (purple), archives and .vsix (amber), source and config files (blue), documents (green), everything else neutral. Same name + description layout, same one-line height.
- **The whole card opens the file**, like the web's full-card preview target, while the action buttons stop propagation so a click never fires twice.
- **Actions are icon buttons instead of a text button.** The right-hand split control is now 打开 (arrow) + chevron, and the menu lists 打开 / 复制路径 / 用默认应用打开 / 在资源管理器中显示 — all with line icons, no emoji.
- Verified with an 8-check harness (four cards rendered with the expected per-type tones and distinct icons, whole-card click, single fire from the open button, four menu entries with no emoji, 复制路径 sending copyText) plus all eleven existing suites, typecheck and 684 keys; the cards were rendered from the real bundle.`;

const ENTRY_ZH = `- **交付文件卡对齐网页端**。之前每张产物卡都用同一个「复制」图形当图标,看起来像个多余按钮。现在图标改成 34px 圆角瓷砖,按文件类型着色并配对应图形:图片(紫)、压缩包与 .vsix(琥珀)、源码与配置(蓝)、文档(绿),其余中性色;名称 + 描述的两行结构与行高保持不变。
- **整张卡可点即打开**,与网页端"整卡预览"一致;操作按钮各自 stopPropagation,不会触发两次。
- **操作改成图标按钮**:右侧是「打开」(箭头)+ 展开箭头,菜单为 打开 / 复制路径 / 用默认应用打开 / 在资源管理器中显示,全部线性图标、无 emoji。
- 验证:8 项夹具(四张卡的类型色调与图形各不相同、整卡点击、打开按钮只触发一次、菜单四项无 emoji、复制路径发出 copyText)+ 既有十一套夹具、typecheck 与 684 键;卡片用真实包渲染核对。`;

const pkgPath = `${root}package.json`;
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const [a, b, c] = pkg.version.split(".").map(Number);
const version = `${a}.${b}.${c + 1}`;
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

let readme = readFileSync(`${root}README.md`, "utf8");
readme = readme.split(`Latest: ${PREV}`).join(`Latest: ${version}`).split(`最新版本:${PREV}`).join(`最新版本:${version}`);
writeFileSync(`${root}README.md`, readme, "utf8");

for (const f of ["CHANGELOG.md", ".dsh/agent/extension-changelog.md"]) {
  const path = `${root}${f}`;
  const s = readFileSync(path, "utf8");
  const marker = f === "CHANGELOG.md" ? "# Changelog\n\n" : "# dsh-vscode Changelog";
  const i = s.indexOf(marker);
  const inserted = i >= 0 ? `${s.slice(0, i + marker.length)}\n${ENTRY_EN.trim()}\n${ENTRY_ZH.trim()}\n\n${s.slice(i + marker.length)}` : `${marker}\n\n${ENTRY_EN.trim()}\n`;
  writeFileSync(path, inserted, "utf8");
  console.log(`${f}: entry added`);
}
console.log(`released v${version}`);
