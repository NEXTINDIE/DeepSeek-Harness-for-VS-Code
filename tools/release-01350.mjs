// 发布 0.13.50:对话内图片可点击放大 + 缩略图样式优化。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const PREV = "0.13.49";
const ENTRY_EN = `## 0.13.50
- **Images inside the conversation are now clickable.** Thumbnails in user messages and in tool results (read_image and friends) open the same full-size preview the composer's image chips use — Esc or a backdrop click closes it, and "open with the default app" still saves a temp file first. Keyboard users get the same thing: the frame is a focusable role=button, so Enter or Space opens it.
- Thumbnail presentation tidied up: an 8px rhythm between images, a slightly larger frame with a widget border and 8px radius, a true zoom-in cursor, a focus border in the theme accent on hover/focus, a constant 240×190 contain box so portrait and landscape screenshots don't jump, and a padded error line instead of a bare 10.5px warning.
- The preview header now says what the image is (图片 · PNG) instead of a made-up filename; the machine-readable name is still used for the temp file handed to the default app.
- Verified with a 12-check jsdom suite (placeholder → data swap, click/Enter/Space opening, Esc and 关闭 closing, external-open action, and the same path for tool-result images) plus rendered screenshots in both palettes.`;

const ENTRY_ZH = `- **对话里的图片现在可以点击放大**。用户消息与工具结果(read_image 之类)里的缩略图,点一下就走输入区图片芯片用的同一个放大弹层 —— Esc 或点遮罩关闭,「用默认应用打开」依旧先落临时文件再交给系统。键盘也能用:缩略图是可聚焦的 role=button,Enter / 空格即可打开。
- 缩略图样式整理:图片间距 8px;外框略大、用控件描边 + 8px 圆角;真正的放大镜光标;悬停/聚焦时边框转为主题强调色;固定 240×190 的 contain 区域,竖图横图切换不再跳动;加载失败改为带内边距的整行提示,而不是裸的一行小字。
- 放大弹层的标题改成说明图片类型(如「图片 · PNG」),不再编一个假文件名;机器可读的文件名仍用于「用默认应用打开」落盘。
- 验证:12 项 jsdom 夹具(占位→数据替换、点击/Enter/空格打开、Esc 与「关闭」按钮关闭、交给系统默认应用、工具结果图片同路径)+ 深色/浅色两套渲染截图。`;

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
