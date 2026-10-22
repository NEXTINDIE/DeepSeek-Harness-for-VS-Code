// 发布 0.13.62:正文行内文件路径可点击打开。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PREV = "0.13.61";
const EN = `## 0.13.62
- **File paths in the answer body are clickable.** Inline code that looks like a path (\`includes/config.php\`, \`vars.php\`, \`changelog\`) now renders as a path chip: dotted underline, link colour, tooltip with the full path; clicking it — or focusing it and pressing Enter — opens the file in the editor. Detection is deliberately conservative (no whitespace, needs an extension or a directory separator, rejects URLs and bare identifiers), so ordinary inline code stays plain.
- Relative paths resolve against the session's **effective** working directory (so paths inside a Git worktree open too), falling back to the session header; non-text files go to the normal VS Code viewer.
- Typecheck plus the plan / 0.2.1 / deliverable suites pass and no keys are missing.`;

const ZH = `- **正文里的文件路径可点击打开**。行内代码如果看起来是路径(\`includes/config.php\`、\`vars.php\`、\`changelog\`),现在渲染成路径胶囊:虚线下划线、链接色、悬停显示完整路径;点击即可在编辑器中打开,聚焦后按 Enter 同样可以。判定刻意保守(不能有空白、必须带扩展名或目录分隔符、排除 URL 与普通标识符),以免把普通行内代码变成链接。
- 相对路径按会话的**生效**工作目录解析(Git 工作树里的路径也能命中),取不到时回退会话头;非文本文件交给 VS Code 默认查看器。
- typecheck 与计划模式 / 0.2.1 / 交付卡三套夹具通过,无缺失键。`;

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
