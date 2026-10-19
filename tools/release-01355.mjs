// 发布 0.13.55:账号卡片修复(头像/金额) + 默认权限空白修复。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const PREV = "0.13.54";
const ENTRY_EN = `## 0.13.55
- **Account card: avatar and money fixed.** A relative or unreachable \`avatarUrl\` used to render as a broken-image icon; only http(s)/data URLs are used now, images carry \`referrerpolicy="no-referrer"\`, and a load failure swaps in the initial. Balances came straight from the Platform's decimal string, so a value like \`1.404286135000000\` (float noise) was printed verbatim — amounts are now formatted with two decimals and thousands separators (\`¥1.40\`, \`¥0.00\`, \`$1,234.50\`), falling back to the raw string if it is not numeric.
- **「默认权限」 no longer renders a blank page.** When the permission namespace's schema could not be resolved into a preset list, the section returned early and left the content pane empty. It now falls back to the generic namespace form with an explanation ("no presets could be parsed; showing the generic form"), and every section render is wrapped so a throw shows a readable message instead of an empty pane.
- Two of my own regressions, caught by the new harness before release: the previous patch had removed the account section's final \`body.append(section)\` (which is why the card disappeared while the nav kept working), and the permission renderer's early return needed a boolean so the caller can tell "nothing to show" apart from "rendered".
- Verified: 4 new checks for money formatting, avatar fallback, the permission fallback path and the normal three-preset path, plus all nine UI suites, typecheck and 682 localized keys.`;

const ENTRY_ZH = `- **账号卡片:头像与金额修复**。相对路径或失效的 \`avatarUrl\` 之前会渲染成破图图标;现在只接受 http(s)/data URL,图片带 \`referrerpolicy="no-referrer"\`,加载失败则退回首字母。余额原本直接拼接平台返回的十进制字符串,像 \`1.404286135000000\`(浮点噪声)就原样显示了 —— 现在统一两位小数 + 千位分隔(\`¥1.40\`、\`¥0.00\`、\`$1,234.50\`),非数字时原样回退。
- **「默认权限」不再空白**。当 permission 命名空间的 schema 解析不出预设列表时,分区提前 return,右侧内容区就空着。现在会退回通用表单并说明原因(「没有从宿主设置里解析出可选预设,下面按通用表单展示」),同时每个分区的渲染都包了 try/catch,抛错时给出可读提示而不是留白。
- 我自己的两处回归,被新夹具在发布前抓住:上一版补丁误删了账号分区末尾的 \`body.append(section)\`(所以导航正常、内容却不见了),以及权限渲染函数的提前 return 需要返回布尔值,让调用方能区分「没内容可显示」与「已渲染」。
- 验证:新增 4 项金额/头像检查 + 权限回退路径与正常三预设路径,以及全部九套界面夹具、typecheck 与 682 个本地化键。`;

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
