// 发布 0.13.61:计划模式紫色边框 + 权限说明文案补齐。
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PREV = "0.13.60";
const EN = `## 0.13.61
- **Plan-mode composer border is now purple.** It uses the same \`--dsh-plan\` token as the 计划模式 chip, so the border and the chip read as one state (and no longer collide with the amber 完全访问 permission chip).
- **Permission descriptions no longer show raw keys.** The permission menu rendered the i18n keys themselves (\`perm.desc.readOnly\`, \`perm.desc.workspaceWrite\`, \`perm.desc.dangerFullAccess\`) because those four strings were missing from the webview dictionaries — \`t()\` fell back to the key. All four are added in 14 languages, so 只读 / 工作区可写 / 完全访问 now carry a one-line explanation again.
- Typecheck and the i18n checks pass with nothing missing.`;

const ZH = `- **计划模式的输入框边框改为紫色**。与「计划模式」芯片共用 \`--dsh-plan\` 令牌,边框与芯片看起来是同一个状态,也不再和琥珀色的「完全访问」权限芯片撞色。
- **权限说明不再显示原始键名**。权限弹层此前直接渲染了 \`perm.desc.readOnly\` / \`perm.desc.workspaceWrite\` / \`perm.desc.dangerFullAccess\` —— 因为这四条文案在 Webview 词典里缺失,\`t()\` 回退成了键本身。现在四种预设补齐 14 种语言,只读 / 工作区可写 / 完全访问 又各自带上了一行说明。
- typecheck 与 i18n 校验通过,无缺失键。`;

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
