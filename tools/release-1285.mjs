// 发布 0.12.85(避免 shell 转义截断:直接在脚本内写发布说明)。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const EN = `## 0.12.85
- @ mention menu polish: ① removed the emoji icons (🤖/📄/💬) from every row for a clean, compact list; ② typing @ now shows a loading listbox right away (web parity) — the Agents group appears instantly from the local scan while "Loading files…" / "Loading sessions…" rows with a CSS spinner fill the Files & folders and Session conversations groups until the server candidates arrive, then the loading rows are replaced in place.
- @ 提及菜单优化:① 移除每行的 emoji 图标(🤖/📄/💬),列表更简洁紧凑;② 输入 @ 立即显示加载列表框(与网页端一致)—— 智能体分组由本地扫描即时出现,「正在加载文件资源…」「正在加载会话列表…」加载行(纯 CSS 旋转圆点)占位,服务器候选到达后原位替换。`;

const pkgPath = `${root}package.json`;
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const [a, b, c] = pkg.version.split(".").map(Number);
const version = `${a}.${b}.${c + 1}`;
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

const readme = readFileSync(`${root}README.md`, "utf8");
writeFileSync(`${root}README.md`, readme.split(pkg.version).join(version), "utf8");
// 注意:上面用的是旧版本号替换;直接替换一次
const readme2 = readFileSync(`${root}README.md`, "utf8");
writeFileSync(`${root}README.md`, readme2, "utf8");

for (const f of ["CHANGELOG.md", ".dsh/agent/extension-changelog.md"]) {
  const path = `${root}${f}`;
  const s = readFileSync(path, "utf8");
  const marker = f === "CHANGELOG.md" ? "# Changelog\n\n" : "# dsh-vscode Changelog";
  const i = s.indexOf(marker);
  if (i >= 0) {
    const inserted = `${s.slice(0, i + marker.length)}\n${EN.trim()}\n${s.slice(i + marker.length)}`;
    writeFileSync(path, inserted, "utf8");
  } else {
    writeFileSync(path, `${marker}\n\n${EN.trim()}\n`, "utf8");
  }
  console.log(`${f}: entry added`);
}
console.log(`released v${version}`);
