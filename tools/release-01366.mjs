// 发布 0.13.66:适配 0.2.1-rc.3 + 首次切换推理强度失效修复 + 长会话打开卡死修复。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PREV = "0.13.65";

const EN = `## 0.13.66
- **Adapted to dsh v0.2.1-rc.3.** A mechanical diff of the published packages shows a **zero-change wire contract** — 173 Typert endpoints, 23 forwarded events, 21 session projections, the session-event vocabulary and the three mux constants are all identical, which matches the release notes (all three rc.3 items are web-only: the sidebar/conversation/right-rail "More" menus, the lost-draft fix, and the API-key adapter refreshing its model list like account sign-in). Nothing was needed at the protocol layer; the corridor plus the two client-facing implications are now recorded in the wire type header.
- **Fixed: the first reasoning-effort (or model) switch appeared to do nothing.** \`session/selectModel\` changes the **session-local** selection and saves the profile default in the background, while \`session/modelCatalog\` reports the **deployment default**. The old code re-read the catalog right after the switch and wrote it back over the UI, so the first click was immediately reverted by a stale default and only the second click seemed to work. The UI now trusts the \`selected\` value returned by \`selectModel\`, uses the catalog only for the model list, never overwrites with a failed catalog read, and retries once after 300 ms when the host resolved the requested effort away — performing the "second click" on the user's behalf.
- **Long conversations no longer freeze when opened.** The root cause was quadratic: replaying \`assistant/message\` looked up its turn from the event, and whenever \`turn\` was missing (older or trimmed history records) every message merged into one \`turn=0\` node that was re-rendered in full for each new message. Assistant messages now fall back to the current turn and \`turn/start\` records it. Measured in headless Chromium with the real bundle: **300 turns 6.35 s → 0.24 s**, and a proper 4 000-turn session opens in **3.2 s** (linear, ~0.8 ms/turn).
- Also included: history replay builds the DOM in a detached container and attaches it once, \`refreshActionsReveal\` runs once after replay instead of per turn, \`.msg\` carries \`content-visibility: auto\` with an intrinsic size so off-screen messages skip layout and paint, and the init payload's delta merge accumulates parts before a single join.`;

const ZH = `- **适配 dsh v0.2.1-rc.3**。对已发布包机械 diff:**线协议零变化** —— 173 个 Typert 端点、23 条转发事件、21 个会话投影、会话事件词表与三条 mux 流常量全部一致;与发布说明吻合,rc.3 的三项都在网页端:左/中/右栏「更多」菜单、丢失草稿修复、API Key 适配器的模型列表改为与账号登录一致地刷新。协议层无需改动,已在 wire 类型头注释里补上该走廊与两条对客户端的含义。
- **修复:第一次切换推理强度(或模型)像没生效**。\`session/selectModel\` 只保证**会话本地**立即生效,默认值是**后台保存**的;而 \`session/modelCatalog\` 返回的是**部署默认值**。旧代码切换后立刻重读目录并回写界面,第一次点击马上被滞后的默认值覆盖,只有第二次点才"成功"。现在界面以 \`selectModel\` 响应里的 \`selected\` 为准,目录只用于模型清单,目录读取失败不再回推;当宿主把请求的推理强度解析掉时,自动等 300 ms 重试一次 —— 相当于替用户完成"第二次点击"。
- **打开超长对话不再卡死**。根因是平方级:重放 \`assistant/message\` 时按事件里的 \`turn\` 归并,一旦 \`turn\` 缺失(旧日志或裁剪过的历史记录),所有消息会并进同一个 \`turn=0\` 节点,每来一条就整块重渲染一次。现在缺 \`turn\` 时回退到当前回合,并由 \`turn/start\` 记录当前回合。真实包在无头 Chromium 实测:**300 轮 6.35 s → 0.24 s**,正常 4000 轮会话 **3.2 s** 打开(线性,约 0.8 ms/轮)。
- 同版本还包含:重放期离屏构建 DOM 后一次性挂载、\`refreshActionsReveal\` 改为重放后一次、\`.msg\` 加 \`content-visibility: auto\`(视口外消息跳过排版/绘制)、init 载荷的 delta 合并改为数组累积后一次 join。`;

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
