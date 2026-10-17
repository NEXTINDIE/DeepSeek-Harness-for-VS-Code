// 发布 0.13.45:兼容 DSH 0.2.1-rc.2。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const PREV = "0.13.44";
const ENTRY_EN = `## 0.13.45
- **DSH 0.2.1-rc.2 compatibility — the wire contract did not move at all.** Verified two ways: a mechanical diff of the published packages (rc.1 → rc.2) and a live isolated rc.2 server driven by this extension's own client. Result: 173 Typert endpoints, 23 forwarded \`$events\` entries, 21 session projections, 57 session event types and all three mux stream constants are identical; envelope, cookie auth and the \`remoteAccess\` baseline are unchanged. rc.2 adds exactly two packages and neither touches the wire: \`dsh-web-deepseek-api\` (DeepSeek Search/Fetch provider behind the existing \`web_search\`/\`web_fetch\` tools) and \`dsh-client-ui-deepseek-model-label-1017\` (a 1017 badge for the Web UI's model labels).
- Model catalog re-checked because the commit-message generator depends on it: \`deepseek-flash\` and \`deepseek-v4-pro\` are still there and Flash still reports \`off/low/high/max\` reasoning efforts, so nothing had to change there — the new V4.1 labelling is display-only.
- The one visible side effect was in Settings: rc.2 composes two new namespaces (\`web\`, \`web-deepseek-api\`). They now have proper titles instead of raw ids, \`web-deepseek-api\` is grouped with the model providers (it is a credentials/endpoint config), and both titles are localized in 14 languages — these are dynamic keys that \`check-i18n\` cannot see, so they were added to \`EN_TEXT\` plus all 12 Webview dictionaries by hand.
- Everything else in this release is verification only: the plan-review, history-key, 0.2.1-feature, stats, attachment, compaction and send-key suites all still pass, together with typecheck and the duplicate-key check.`;

const ENTRY_ZH = `- **兼容 DSH 0.2.1-rc.2 —— 线协议一个字节都没动**。两条路验证:把已发布包 rc.1 → rc.2 做机械 diff,再用本扩展自己的客户端驱动一台隔离的 rc.2 服务器实跑。结果:173 个 Typert 端点、23 条 \`$events\` 词表、21 个会话投影、57 种会话事件、三条 mux 流常量全部一致;信封、cookie 认证、\`remoteAccess\` 基线也不变。rc.2 只新增两个包,且都不进线协议:\`dsh-web-deepseek-api\`(DeepSeek Search/Fetch 提供方,挂在既有的 \`web_search\`/\`web_fetch\` 工具后面)与 \`dsh-client-ui-deepseek-model-label-1017\`(网页端模型标签上的 1017 徽标)。
- 因为「生成提交信息」依赖模型目录,专门复查了一遍:\`deepseek-flash\` 与 \`deepseek-v4-pro\` 都还在,Flash 的推理等级仍是 \`off/low/high/max\`,所以那部分无需改动 —— 新的 V4.1 标注只影响显示名。
- 唯一可见的变化在设置页:rc.2 组合进了两个新命名空间(\`web\`、\`web-deepseek-api\`)。现在它们有正经标题(不再是原始 id),\`web-deepseek-api\` 归到模型供应商一组(它本质是凭据 + 端点配置),两条标题都补齐了 14 种语言 —— 它们是 \`check-i18n\` 扫不到的动态键,所以手工补进了 \`EN_TEXT\` 与 12 份 Webview 词典。
- 其余都是回归验证:计划审阅 / 输入历史 / 0.2.1 功能 / 统计胶囊 / 附件 / 压缩行 / 发送键七套夹具 + typecheck + 重复键检查全部通过。`;

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
