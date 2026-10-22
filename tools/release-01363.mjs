// 发布 0.13.63:正文复制改用当前选区;正文本地图片重新可见。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PREV = "0.13.62";
const EN = `## 0.13.63
- **Copying from the transcript now uses the current selection.** Ctrl+C and the webview's right-click Copy are handled explicitly: the selected text is written to the clipboard, so pasting no longer returns the previous clipboard content (the old path copied whatever element had focus — usually the empty composer). If focus has already moved away, a short-lived snapshot of the last transcript selection is used, and copying inside the composer or other panels keeps its native behaviour.
- **Images in the answer body render again.** The webview CSP only admits \`data:\` URLs and extension resources, so relative / absolute / \`file:\` image sources were blocked and showed a broken-image icon. Local images are now read by the host and inlined as data URLs; relative paths resolve against the session's effective working directory (worktrees included), with an 8 MB cap and a visible "missing" state whose tooltip names the reason.
- Selections are no longer destroyed by re-renders: streaming blocks repaint at most once per animation frame, and whole-node rebuilds are deferred while a transcript selection exists (the view also stops auto-scrolling under the cursor).
- Typecheck plus the copy / inline-image / plan suites pass.`;

const ZH = `- **正文复制改用当前选区**。Ctrl+C 与 webview 的右键「复制」改为显式写入正文选区,粘贴不再得到上一次的剪贴板内容(旧路径复制的是焦点元素的选区,通常就是空的输入框)。焦点已经移走时用最近一次正文选区的短期快照兜底;在输入框或其它面板里复制仍走原生行为。
- **正文里的本地图片重新可见**。webview 的 CSP 只放行 \`data:\` 与扩展资源,相对 / 绝对 / \`file:\` 图片一律被拦成裂图;现在由宿主读盘并内联为 data URL,相对路径按会话**生效**工作目录解析(工作树内也能命中),单张上限 8 MB,读不到时显示缺失态、悬停可见原因。
- 选区不再被重绘冲掉:流式块每帧至多重绘一次,存在正文选区时整块重建会被推迟(期间也不再自动滚动)。
- typecheck 与复制 / 正文图片 / 计划模式三套夹具通过。`;

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
  writeFileSync(path, `${s.slice(0, i + marker.length)}\n${EN.trim()}\n${ZH.trim()}\n\n${s.slice(i + marker.length)}`, "utf8");
  console.log(`${f}: entry added`);
}
console.log(`released v${version}`);
