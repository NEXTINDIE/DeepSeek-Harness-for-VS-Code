// 发布 0.13.47:提问卡片题面去掉重复的小图标。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const PREV = "0.13.46";
const ENTRY_EN = `## 0.13.47
- Removed the small ❓ glyph that each question's text carried inside the 提问 card. The card header already shows that icon as its category marker, so the body started with a second identical icon on a shorter line — visually it looked like a bullet hanging off the question. The question text now starts at the card's own left margin, which also gives long questions a little more line width.
- Nothing else changed: options, custom input, pager, 跳过本题 / 提交回答, the countdown pill and the plan-review card are untouched; typecheck plus the plan-review and 0.2.1-feature suites still pass, and the result was checked in a rendered screenshot.`;

const ENTRY_ZH = `- 去掉提问卡片里每道题题面前那个小 ❓。卡片头部本就已经用同一个图标做类别标记,正文再出现一个同款小图标、还挂在题目行首,看起来像一颗多余的列表符号;现在题面直接从卡片左边距开始,长问题也宽松一点。
- 其他都没动:选项、自定义输入、翻页、跳过本题 / 提交回答、倒计时胶囊、计划审阅卡片均保持原样;typecheck 与计划审阅 / 0.2.1 功能两套夹具仍通过,并已用渲染截图核对。`;

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
