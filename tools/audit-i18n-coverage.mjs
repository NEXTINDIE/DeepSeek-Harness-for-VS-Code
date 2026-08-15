// 审计:以中文为源语言,列出各语言词典缺失的键(webview texts / l10n bundles / package.nls)。
import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function keys(file) {
  try {
    return new Set(Object.keys(JSON.parse(readFileSync(file, "utf8"))));
  } catch {
    return new Set();
  }
}

// 1) webview texts/*.json:源键 = ui.ts EN_TEXT 的全部中文键
const uiSrc = readFileSync(`${root}src/webview/ui.ts`, "utf8");
const zhKeys = new Set();
const re = /^\s*"((?:[^"\\]|\\.)*)"\s*:/gm;
let m;
while ((m = re.exec(uiSrc)) !== null) {
  const s = m[1].replace(/\\(.)/g, "$1");
  if (/[\u4e00-\u9fff]/.test(s)) zhKeys.add(s);
}
// 排除 t() 源串本身作为"键"出现的(即 EN_TEXT 键)+ 其余动态键
const langs = ["zh-tw", "ja", "ko", "de", "fr", "es", "pt", "th", "id", "tr", "ar"];
console.log("== webview texts ==");
for (const lang of langs) {
  const have = keys(`${root}src/webview/texts/${lang}.json`);
  const missing = [...zhKeys].filter((k) => !have.has(k));
  console.log(`${lang}: 缺 ${missing.length} 个`);
  if (missing.length) console.log("  " + missing.join(" | "));
}

// 2) l10n bundles:源键 = bundle.l10n.zh-cn.json(中文)
console.log("\n== l10n bundles ==");
const zhBundle = keys(`${root}l10n/bundle.l10n.zh-cn.json`);
const bundleLangs = ["zh-tw", "ja", "ko", "de", "fr", "es", "pt", "th", "id", "tr", "ar"];
for (const lang of bundleLangs) {
  const have = keys(`${root}l10n/bundle.l10n.${lang}.json`);
  const missing = [...zhBundle].filter((k) => !have.has(k));
  console.log(`${lang}: 缺 ${missing.length} 个`);
  if (missing.length) console.log("  " + missing.join(" | "));
}

// 3) package.nls:源键 = package.nls.zh-cn.json(中文)
console.log("\n== package.nls ==");
const zhNls = keys(`${root}package.nls.zh-cn.json`);
const nlsLangs = ["zh-tw", "ja", "ko", "de", "fr", "es", "pt", "th", "id", "tr", "ar"];
for (const lang of nlsLangs) {
  const have = keys(`${root}package.nls.${lang}.json`);
  const missing = [...zhNls].filter((k) => !have.has(k));
  console.log(`${lang}: 缺 ${missing.length} 个`);
  if (missing.length) console.log("  " + missing.join(" | "));
}
