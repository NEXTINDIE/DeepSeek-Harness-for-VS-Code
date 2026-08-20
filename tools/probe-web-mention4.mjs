// 找 rc.8 中注册 @ 菜单 sources 的客户端包(文件/会话/智能体)。
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
const clientTs = (tree?.tree ?? []).filter(
  (e) => e.path.startsWith("packages/client/") && e.path.endsWith(".ts") && !e.path.includes("test") && !e.path.includes("spec") && !e.path.includes(".d.ts"),
);
const interesting = [];
for (const f of clientTs) {
  const s = await fetchText(f.path);
  if (!s) continue;
  if (/showGroupTitle|trigger: '@'|'@menu|inputSources|sources:|fileReferences\.list|referenceSource/i.test(s)) {
    interesting.push(f.path);
  }
}
console.log("== candidate files ==");
for (const p of interesting) console.log(p);
