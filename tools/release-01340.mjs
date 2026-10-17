// 发布 0.13.40:兼容 DSH 0.2.1-rc.1 并支持其新功能。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const PREV = "0.13.39";
const ENTRY_EN = `## 0.13.40
- **DSH 0.2.1-rc.1 compatibility, verified against the published host.** The wire contract the extension uses is unchanged: all 57 endpoints keep their signatures, the \`remote.mux\` streams and the \`dsh-auth-*\` browser cookie are untouched, and the \`$events\` vocabulary only gained \`plugin-market/changed\` (the \`api-session/*\` events gained resource clauses, but an owner connection — this extension's launch-token cookie — still receives all of them; measured live). Removed endpoints (\`terminal/follow|write|resize\`) were never used here; the new optional ones (\`cotTranslation/*\`, \`pluginMarket/*\`) 404 unless their bundle is composed, so they degrade as "endpoint unavailable".
- New features adopted from 0.2.1: the **session working directory** (\`workingDirectory\` projection + \`working-directory/change\` event) is shown as a composer pill that reveals the folder, and directory switches appear in the transcript as one-line notices; the host's \`user/message\` with \`source.kind="working-directory"\` is no longer rendered as something the user said. Pending **timed questions** are restored from the \`userQuestions\` projection after a reload or session switch (previously they vanished until the agent continued). The **background-jobs panel** is now fed by the new \`job/registered\` / \`job/settled\` session events with status, exit code and duration — \`session/control\` baselines carry only projections on 0.2.x, so the panel had no data source before. Session ⋯ gained **Copy session ID**.
- **Gateway authorization (\`remoteAccess/follow\`)**: the extension probes the new stream once, records whether this connection is \`owner\`, warns when a host grants limited access, and turns \`remote-access/denied\` into a readable permission message instead of a raw code.
- **Bundled plugin compatibility fix**: DSH 0.2.1 rejects plugins whose declared requirements the runtime does not satisfy, and \`dsh-git-rollback@0.1.10\` only declared \`^0.1.0-rc.6\` peers — the host's own evaluator flags that as incompatible on 0.2.0-rc.2 **and** 0.2.1-rc.1. v0.1.11 declares \`engines.dsh: ">=0.1.7-rc.2"\`, adds an icon and \`locale/*.json\` entries for 15 languages, so it loads clean and shows a localized title/description in the plugin manager.
- Verification: live probes against isolated 0.2.1-rc.1 and 0.2.0-rc.2 servers (contract 16/18 — the two failures are the optional bundles' 404s; 0.2.1 store integration 6/6; 0.2.0 backward compatibility 9/9 including graceful absence of the new projection/events), a plugin-metadata read from a real 0.2.1 plugin manager, \`tools/test-plugin-engines.mjs\` for the compatibility gate, plus jsdom interaction harnesses for the new UI paths. All new strings are localized in 14 languages, and the older harnesses (compaction, stats, send shortcut, attachments) still pass.`;

const ENTRY_ZH = `- **兼容 DSH 0.2.1-rc.1(对着已发布宿主实机核对)**。扩展用到的线协议没有变化:57 个端点签名全部不变,\`remote.mux\` 流派与 \`dsh-auth-*\` cookie 不变,\`$events\` 词表只多了 \`plugin-market/changed\`(\`api-session/*\` 增加了 resources 子句,但 owner 连接 —— 即本扩展用启动令牌换来的 cookie —— 实测仍全量收到)。移除的 \`terminal/follow|write|resize\` 本扩展从未使用;新增的 \`cotTranslation/*\`、\`pluginMarket/*\` 在未组合对应插件时返回 404,按「端点不可用」优雅降级。
- 采纳 0.2.1 的新功能:**会话工作目录**(\`workingDirectory\` 投影 + \`working-directory/change\` 事件)显示为输入框下方的目录胶囊(点击在资源管理器中定位),目录切换同时以单行提示出现在对话里;宿主注入的 \`user/message\`(\`source.kind="working-directory"\`)不再被渲染成用户发言。重载视图或切换会话后,**待答的限时提问**由 \`userQuestions\` 投影还原(此前会消失,直到 Agent 自己继续)。**后台任务面板**改由新的 \`job/registered\` / \`job/settled\` 事件驱动,带状态、退出码与耗时 —— 0.2.x 的 \`session/control\` 基线只携带 projections,面板此前没有数据来源。会话 ⋯ 菜单新增**复制会话 ID**。
- **网关授权(\`remoteAccess/follow\`)**:启动时探测一次新流,记录本连接是否为 \`owner\`;宿主只授予受限访问时给出提示,并把 \`remote-access/denied\` 翻成可读的权限说明,而不是原始错误码。
- **随包插件兼容修复**:DSH 0.2.1 会拒绝运行时不满足其声明要求的插件,而 \`dsh-git-rollback@0.1.10\` 只声明了 \`^0.1.0-rc.6\` 的 peer 范围 —— 用宿主自己的求值器实测,这在 0.2.0-rc.2 **与** 0.2.1-rc.1 上都被判为不兼容。v0.1.11 增加 \`engines.dsh: ">=0.1.7-rc.2"\`、图标与 15 种语言的 \`locale/*.json\`,现在加载无告警,插件管理里显示本地化的标题与描述。
- 验证:对隔离的 0.2.1-rc.1 与 0.2.0-rc.2 服务器做实机探针(契约 16/18,两项失败是可选项组合包的 404;0.2.1 存储集成 6/6;0.2.0 向后兼容 9/9,含新投影/事件缺失时的优雅降级)、从真实 0.2.1 插件管理读出插件元数据、\`tools/test-plugin-engines.mjs\` 校验兼容门禁,另有 jsdom 交互夹具覆盖新界面路径。新增文案已补齐 14 种语言;既有的压缩行 / 统计胶囊 / 发送快捷键 / 附件夹具全部仍通过。`;

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
