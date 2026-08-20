// 模拟扩展的智能体扫描逻辑:验证 .dsh/agent 下的文件能否被 @ 提及发现。
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function parseAgentFrontMatter(raw, fallbackName) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { name: fallbackName, body: raw.trim() };
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w.-]+)\s*:\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  const name = (fields.name ?? fallbackName).trim() || fallbackName;
  return { name, ...(fields.description ? { description: fields.description } : {}), body: raw.slice(m[0].length).trim() };
}

const dir = ".dsh/agent";
const out = [];
for (const f of readdirSync(dir)) {
  if (!f.endsWith(".md")) continue;
  const raw = readFileSync(join(dir, f), "utf8");
  const parsed = parseAgentFrontMatter(raw, f.replace(/\.md$/, ""));
  out.push({ file: f, name: parsed.name, description: parsed.description, bodyLen: parsed.body.length });
}
console.log(JSON.stringify(out, null, 1));
// 模拟 @ 候选过滤
for (const q of ["dsh", "vscode", "developer"]) {
  console.log(`query "@${q}" ->`, out.filter((a) => a.name.toLowerCase().includes(q)).map((a) => "@" + a.name));
}
