// 文案审计:抽取 panels.ts / ui.ts 中 t("...") 的中文源串,与 EN_TEXT 词典对比;并检查宿主 l10n 键。
import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function extractStrings(file) {
  const src = readFileSync(file, "utf8");
  const out = [];
  const re = /(?:^|[^\w])t\(\s*"((?:[^"\\]|\\.)*)"\s*[,)]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const s = m[1].replace(/\\(.)/g, "$1");
    if (s.includes("{") || s.includes("$")) continue; // 参数化/动态串跳过
    if (!/[\u4e00-\u9fff]/.test(s)) continue; // 只关心中文源串
    out.push(s);
  }
  return out;
}

function dictKeys(file) {
  const src = readFileSync(file, "utf8");
  const out = [];
  const re = /^\s*"((?:[^"\\]|\\.)*)"\s*:/gm;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1].replace(/\\(.)/g, "$1"));
  return out;
}

const uiKeys = new Set(dictKeys(`${root}src/webview/ui.ts`));

for (const file of [`${root}src/webview/panels.ts`, `${root}src/webview/ui.ts`]) {
  const used = extractStrings(file);
  const missing = [...new Set(used)].filter((s) => !uiKeys.has(s));
  console.log(`== ${file.replace(root, "")} ==`);
  console.log(`   t() 中文串 ${used.length} 个,去重 ${new Set(used).size} 个;缺 EN_TEXT 翻译:`);
  if (missing.length === 0) console.log("   (无,全部已翻译)");
  else for (const s of missing) console.log(`   ✗ ${s}`);
}

// 宿主侧:t("key") 与两个 bundle 的键对比
const hostFiles = [
  `${root}src/webview/channel.ts`,
  `${root}src/extension.ts`,
  `${root}src/dsh/hub.ts`,
  `${root}src/dsh/chatParticipant.ts`,
  `${root}src/dsh/serverManager.ts`,
];
const hostKeys = new Set();
for (const file of hostFiles) {
  let src = "";
  try { src = readFileSync(file, "utf8"); } catch { continue; }
  const re = /t\(\s*"([^"]+)"\s*[,)]/g;
  let m;
  while ((m = re.exec(src)) !== null) hostKeys.add(m[1]);
}
const en = new Set(dictKeys(`${root}l10n/bundle.l10n.json`));
const zh = new Set(dictKeys(`${root}l10n/bundle.l10n.zh-cn.json`));
const missingEn = [...hostKeys].filter((k) => !en.has(k));
const missingZh = [...hostKeys].filter((k) => !zh.has(k));
console.log(`== 宿主 l10n 键 ${hostKeys.size} 个 ==`);
console.log(`   缺英文: ${missingEn.length ? missingEn.join(", ") : "(无)"}`);
console.log(`   缺中文: ${missingZh.length ? missingZh.join(", ") : "(无)"}`);
