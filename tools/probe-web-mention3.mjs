// 查 rc.8 网页端 @ 菜单的 sources(文件/会话/智能体)注册与选中行为。
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
const hits = (tree?.tree ?? []).filter(
  (e) => e.path.includes("ui-conversation") && e.path.endsWith(".ts") && !e.path.includes("test") && !e.path.includes("spec"),
);
console.log("== ui-conversation files ==");
for (const f of hits) console.log(f.path);

// 找注册 @ sources 的文件
for (const f of hits) {
  const s = await fetchText(f.path);
  if (!s) continue;
  if (/fileReferences|InputTriggerSource|source: '|'at'|mentionSources|@menu/i.test(s)) {
    console.log("\n===" + f.path + "===");
    const lines = s.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (/fileReferences|InputTriggerSource|@menu|sources|sessionRef|agentSource|registerSource/i.test(lines[i])) {
        console.log(lines.slice(Math.max(0, i - 2), i + 6).join("\n").slice(0, 500));
        console.log("---");
      }
    }
  }
}
