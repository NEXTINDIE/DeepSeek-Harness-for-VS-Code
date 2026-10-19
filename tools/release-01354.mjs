// 发布 0.13.54:账号状态自动刷新 + 工作树卡片。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const PREV = "0.13.53";
const ENTRY_EN = `## 0.13.54
- **The account card now updates itself.** The extension subscribes to the host's \`account/watch\` stream, so finishing a browser sign-in, signing out, or an expired authorization reaches the settings page immediately — no manual refresh. State frames are merged rather than replacing the card (a state-only frame never wipes the balance), and the moment the session turns signed-in the full profile and balance are fetched once automatically, with a 5-second back-off so a failing balance lookup cannot spin.
- **New worktree card.** When the session's effective directory is a linked Git worktree (what the experimental Git Worktrees plugin creates), a compact card appears above the transcript: branch name, path, and 定位 / 复制路径 buttons. A new \`resolveWorktree()\` helper reads it with \`git rev-parse\` only — no writes, 5s timeout, silent when the directory is not a repository — and results are cached per directory. The card refreshes on every \`working-directory/change\` and stays hidden for ordinary checkouts, so it never adds noise.
- Fixed a real bug the new harness caught: \`--git-common-dir\` returns a **relative** \`.git\` in a normal checkout while \`--absolute-git-dir\` is absolute, so a naive comparison reported every ordinary repository as a worktree. Both paths are now resolved against the directory before comparing.
- Verified with a 15-check harness that builds a real repository plus \`git worktree\`: main checkout vs linked worktree vs non-git directory, the card's branch/path/buttons, hiding on the main checkout, and the account merge rules (state frame keeps the balance, sign-in transition auto-fetches). Typecheck, 681 keys and all nine UI suites pass; the card was rendered from the real bundle.`;

const ENTRY_ZH = `- **账号卡片现在会自动更新**。扩展订阅宿主的 \`account/watch\` 状态流:浏览器里完成登录、退出、授权过期都会立刻反映到设置页,不用再点刷新。状态帧是**合并**而不是替换(只有状态的帧不会把余额抹掉);一旦登录态变为已登录,自动补拉一次完整资料与余额,并带 5 秒退避,避免余额拉取失败后空转。
- **新增工作树卡片**。当会话的生效目录是 linked Git 工作树(实验性 Git Worktrees 插件创建的那种)时,对话上方会出现一张紧凑卡片:分支名、路径,以及「定位 / 复制路径」。新增的 \`resolveWorktree()\` 只用 \`git rev-parse\` 读取,不写仓库,5 秒超时,非 git 目录静默返回;结果按目录缓存。目录每次变化(\`working-directory/change\`)都会刷新,普通检出下整卡隐藏,不制造噪音。
- 顺手修掉一个新夹具抓到的真实 bug:普通检出里 \`--git-common-dir\` 返回的是**相对**的 \`.git\`,而 \`--absolute-git-dir\` 是绝对路径,朴素比较会把每个普通仓库都判成工作树。现在两者都先解析成绝对路径再比较。
- 验证:15 项夹具搭真实仓库 + \`git worktree\`(主检出 / 链接工作树 / 非 git 目录、卡片的分支/路径/按钮、主检出下隐藏、以及账号合并规则:状态帧保留余额、登录态变化自动补拉)。typecheck、681 键与全部九套界面夹具通过,卡片另用真实包渲染核对。`;

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
