// 拉取 dsh-file-reference 包与 @ 菜单的 sources 注册,弄清文件/会话引用的语法与提交流。
const BASE = "https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.1.0-rc.8/";
async function fetchText(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) return null;
  return await res.text();
}
async function fetchJson(path) {
  const res = await fetch("https://api.github.com" + path, { headers: { "User-Agent": "dsh-vscode" } });
  if (!res.ok) return null;
  return await res.json();
}

// 1) dsh-file-reference 包文件清单
const tree = await fetchJson("/repos/deepseek-ai/deepseek-harness/git/trees/dsh-v0.1.0-rc.8?recursive=1");
const fr = (tree?.tree ?? []).filter((e) => e.path.includes("file-reference") && e.path.endsWith(".ts") && !e.path.includes("test"));
console.log("== file-reference files ==");
for (const f of fr) console.log(f.path);

// 2) grammar 内容
const grammar = await fetchText("packages/core/file-reference/src/grammar.ts");
if (grammar) {
  console.log("\n== grammar.ts ==");
  console.log(grammar.slice(0, 3000));
}
