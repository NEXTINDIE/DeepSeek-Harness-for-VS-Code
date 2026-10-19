// 发布 0.13.51:回合检查点适配 Git 工作树(生效工作目录 + 引用分链)。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const PREV = "0.13.50";
const ENTRY_EN = `## 0.13.51
- **Turn checkpoints now follow the session's effective working directory, so they stay correct when the experimental Git Worktrees plugin moves the session into a new checkout.** Root cause: the rollback plugin (and the extension's checkpoint reader) keyed everything on \`session.header.cwd\`, which is the immutable project directory. After \`create_worktree\` switched the session elsewhere, checkpoints kept snapshotting the old checkout, so the edits made in the worktree were captured by nothing and "restore checkpoint" silently became a no-op — the worst possible failure mode.
- Plugin 0.1.12 resolves the directory through the host's \`workingDirectory\` service (optional \`ctx.get\`, so older hosts fall back to the header), and **scopes the checkpoint and save refs per directory**: a session that hops between checkouts gets one chain per directory instead of two trees overwriting \`refs/dsh/checkpoints/<sid>\`. The legacy ref name is kept whenever the directory equals the project root, so existing histories keep working. Records already lived at \`<cwd>/.dsh/rollback\`, which now naturally means one record per checkout.
- The extension reads and previews checkpoints from the same effective directory (\`sessionCwd()\` helper shared by the divider state, the diff preview, fork-restore, undo and rollback), and re-reads them when \`workingDirectory\` changes — including worktrees created outside the VS Code workspace, which the file watcher never sees.
- Verified: a new plugin test builds a real repository plus \`git worktree\`, snapshots the same session/turn in both directories, and asserts separate records, separate refs, stable per-directory tokens, and that the worktree snapshot really contains the worktree-only file (14/14 plugin tests pass). Typecheck and the UI suites still pass.`;

const ENTRY_ZH = `- **回合检查点改为跟随会话的「生效工作目录」,因此在实验性 Git Worktrees 插件把会话切进新检出后依然正确**。根因:回退插件与扩展侧的检查点读取都以 \`session.header.cwd\` 为准,而它是**不可变的项目原始目录**。\`create_worktree\` 把会话切走之后,检查点仍在给旧检出拍快照 —— 工作树里的改动没有任何检查点覆盖,「还原检查点」静默变成空操作,这是最糟的失败形态。
- 插件 0.1.12 通过宿主的 \`workingDirectory\` 服务解析目录(用可选的 \`ctx.get\`,老宿主自动回退到会话头),并**按目录给检查点与保存点引用分链**:同一会话在不同检出之间切换时,每个目录各有一条链,不再让两棵树互相覆盖 \`refs/dsh/checkpoints/<sid>\`。目录等于项目根时沿用旧引用名,老历史继续可用。记录本来就写在 \`<cwd>/.dsh/rollback\`,现在自然变成"每个检出各一份记录"。
- 扩展侧同样按生效目录读写与预览检查点(新增 \`sessionCwd()\` 统一供分隔线状态、差异预览、分叉还原、撤销与回退使用),并在 \`workingDirectory\` 变化时重读一次 —— 包括创建在 VS Code 工作区之外、文件监听看不到的工作树。
- 验证:新增一项插件测试,搭真实仓库 + \`git worktree\`,对同一会话同一回合在两个目录各拍一次快照,断言记录分离、引用分离、目录令牌稳定,且工作树快照确实包含只存在于工作树的文件(插件 14/14 通过)。typecheck 与界面夹具同样通过。`;

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
