// 发布 0.13.69:修复每个会话的模型/思考深度未正确记录,导致所有会话显示同一个默认值。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PREV = "0.13.68";

const EN = `## 0.13.69
- **Fixed: every conversation showed the same model and thinking depth.** \`session/modelCatalog\` only returns the deployment default; each Session's own choice lives in the \`modelSelection\` projection (\`next\` = the selection the next request uses, \`lastUsed\` = the selection the latest request actually used). The extension used \`catalog.default\` as \`current\`, so switching Sessions always overwrote the model pill and reasoning segments with the deployment default. \`getSessionModels\` now reads \`session/projections\` (with a default fallback for old hosts/new Sessions) and returns the Session's own \`provider / model / reasoningEffort\`; the status bar follows the same value.
- **Switching Sessions now restores that Session's choice, not the previous one.** Opening a remembered Session, creating a Session on startup, and selecting any Session all refresh the current model/effort from that Session before the UI is pushed. Creating a Session now applies the configured default thinking depth \`await\`ed before the first state push (previously it raced the push, so the pill briefly or permanently showed the deployment default).
- **A model without reasoning no longer keeps the previous Session's effort.** \`updateCurrentModel\` and \`applyLocalModelSelection\` now clear \`reasoningEffort\` when the Session/model has none, instead of leaving a stale "high"/"max" chip.
- **Verified**: against a live 0.2.2-rc.1 server, Session A selected \`off\`, Session B selected \`max\`; both \`getSessionModels\` and the status bar returned the matching effort, and an unselected Session fell back to the catalog default — 5/5. A new offline regression covers \`next\` priority, \`lastUsed\` fallback, missing projection, projection failure, status sync and effort clearing — 7/7. Typecheck and the production build pass.`;

const ZH = `- **修复:所有对话显示成同一个模型和思考深度**。\`session/modelCatalog\` 只返回部署默认值;每个会话自己的选择记录在 \`modelSelection\` 投影里(\`next\` = 下一次请求将使用的选择,\`lastUsed\` = 最近一次请求实际使用的选择)。扩展此前把 \`catalog.default\` 当成 \`current\`,所以切换会话时模型胶囊和推理等级总被部署默认值覆盖。现在 \`getSessionModels\` 会读取 \`session/projections\`(老宿主/新会话回退默认值),返回该会话自己的 \`provider / model / reasoningEffort\`;状态栏同步同一个值。
- **切换会话会恢复该会话自己的选择,而不是上一个会话的**。恢复上次会话、启动时新建会话、手动选择会话,都会在推送界面前先从该会话刷新模型/思考深度。新建会话时配置的默认思考深度现在会 \`await\` 落地后再推状态(此前与推送并发,胶囊会短暂或一直显示部署默认值)。
- **不支持推理的模型不会再残留上一个会话的思考深度**。\`updateCurrentModel\` 与 \`applyLocalModelSelection\` 在会话/模型没有 \`reasoningEffort\` 时会清空该值,不再留下过期的「高 / 最高」胶囊。
- **验证**:真实 0.2.2-rc.1 服务器上会话 A 选 \`off\`、会话 B 选 \`max\`,\`getSessionModels\` 与状态栏均返回对应值,未选择的新会话回退目录默认值 —— 5/5。新增离线回归覆盖 \`next\` 优先、\`lastUsed\` 回退、无投影、投影失败、状态同步与 effort 清空 —— 7/7。typecheck 与生产构建通过。`;

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
