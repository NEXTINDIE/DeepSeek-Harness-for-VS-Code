// 拉取 dsh-session-reference 包:会话提及语法与宿主展开逻辑。
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

const tree = await fetchJson("/repos/deepseek-ai/deepseek-harness/git/trees/dsh-v0.1.0-rc.8?recursive=1");
const files = (tree?.tree ?? []).filter((e) => e.path.includes("session-reference") && e.path.endsWith(".ts") && !e.path.includes("test") && !e.path.includes("spec"));
console.log("== session-reference files ==");
for (const f of files) console.log(f.path);
for (const f of files) {
  if (f.path.includes("types") || f.path.includes("index")) {
    const s = await fetchText(f.path);
    if (!s) continue;
    console.log(`\n===== ${f.path} (${s.length}) =====`);
    console.log(s.slice(0, 3500));
  }
}
