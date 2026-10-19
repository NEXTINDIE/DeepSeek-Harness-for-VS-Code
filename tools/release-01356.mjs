// 发布 0.13.56:设置表单排版放宽 + 线性图标按钮 + 对象数组按 JSON 编辑。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const PREV = "0.13.55";
const ENTRY_EN = `## 0.13.56
- **Settings forms are no longer a dense grid.** Every schema field now renders as label + one-line description + a full-width control, with a 14px rhythm between fields, 30px-tall inputs, a focus ring taken from the theme, a divider above the action row and roomier section padding. Nested objects keep their disclosure group, and the "discover models" block got the same breathing room (2 columns that collapse to 1 below 430px).
- **Buttons use line icons instead of emoji.** 保存 / 重置命名空间 / 发现模型 / 清除 now carry the save, refresh, search and trash glyphs from the shared icon set (drawn in the current foreground colour), so they match the rest of the UI and read the same in light and dark themes.
- **Arrays of objects are edited as JSON instead of \`[object Object]\`.** The \`Models\`-style fields used to join each item with \`String(...)\`, printing \`[object Object]\` per row; they now show pretty-printed JSON, validate on every keystroke, mark the field invalid with an inline message when the text does not parse, and only submit a valid array.
- Also hardened two things found while testing: \`ns.secrets\` is read defensively (a host payload without it used to kill the whole section), and a failing section now logs the exception to the webview console instead of silently leaving an empty pane.
- Verified with a 12-check harness (values actually rendered, secret fields keep their placeholder, JSON round-trip, invalid JSON blocked with a visible message, and buttons carrying SVGs with emoji-free labels) plus the ten existing suites, typecheck and 684 keys; the form was rendered from the real bundle at both widths.`;

const ENTRY_ZH = `- **设置表单不再是密集网格**。每个 schema 字段改成「标签 + 一行说明 + 占满整行的控件」,字段之间 14px 节奏,输入框 30px 高,聚焦用主题描边;操作行上方加了一条分隔线,分区内边距也放宽。"发现模型"区块同样放宽(两列,430px 以下自动变一列)。
- **按钮改用线性图标,不再是 emoji**。保存 / 重置命名空间 / 发现模型 / 清除 分别使用共享图标集里的 save、refresh、search、trash(随前景色绘制),与其余界面一致,亮暗主题表现相同。
- **对象数组按 JSON 编辑,不再显示 \`[object Object]\`**。\`Models\` 这类字段原来用 \`String(...)\` 逐项拼接,每一项都变成 \`[object Object]\`;现在直接给格式化后的 JSON,输入时即时校验,解析失败会在字段下方标错并阻止提交。
- 顺带加固两处测试中发现的问题:防御性读取 \`ns.secrets\`(宿主少这个字段时原本会让整个分区渲染失败),以及分区渲染失败时把异常打到 webview 控制台,而不是静默留白。
- 验证:12 项夹具(字段值确实渲染、密钥保留占位符、JSON 往返、非法 JSON 被拦截并提示、按钮带 SVG 且文案无 emoji)+ 既有十套夹具、typecheck 与 684 个本地化键;表单另用真实包在两种宽度下渲染核对。`;

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
