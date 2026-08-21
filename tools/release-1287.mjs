// 发布 0.12.87:下拉框配色优化。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const EN = `## 0.12.87
- Dropdown readability & polish: ① declared color-scheme: light dark so native controls (select popups, checkboxes, scrollbars) follow the VS Code theme instead of rendering as a white popup with pale text in dark themes; ② the model/thinking/preset selects (previously background: transparent — the cause of the white popup + near-white text) now use the input background with a subtle border and rounded corners, and their native popup options get explicit background/foreground for guaranteed contrast in every theme; ③ the session dropdown and @/slash menus now set an explicit foreground color on the popup (menu background + theme-aware text) so light-menu themes stay readable.
- 下拉框配色优化:① 声明 color-scheme: light dark,原生控件(下拉弹层/复选框/滚动条)跟随 VS Code 主题,不再出现暗色主题下"白色弹层 + 浅色文字";② 模型/思考/预设下拉(此前 background: transparent —— 正是白底浅字的根源)改用输入框实底背景 + 细边框圆角,原生弹层选项显式设置背景/前景色,任何主题下保证对比度;③ 会话下拉与 @/斜杠菜单弹层显式设置前景色(菜单背景 + 主题感知文字),浅色菜单主题下同样清晰可读。`;

const pkgPath = `${root}package.json`;
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const [a, b, c] = pkg.version.split(".").map(Number);
const version = `${a}.${b}.${c + 1}`;
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

for (const f of ["CHANGELOG.md", ".dsh/agent/extension-changelog.md"]) {
  const path = `${root}${f}`;
  const s = readFileSync(path, "utf8");
  const marker = f === "CHANGELOG.md" ? "# Changelog\n\n" : "# dsh-vscode Changelog";
  const i = s.indexOf(marker);
  const inserted = i >= 0 ? `${s.slice(0, i + marker.length)}\n${EN.trim()}\n${s.slice(i + marker.length)}` : `${marker}\n\n${EN.trim()}\n`;
  writeFileSync(path, inserted, "utf8");
  console.log(`${f}: entry added`);
}
console.log(`released v${version}`);
