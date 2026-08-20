// 拉取 rc.8 网页端 @ 菜单相关源码,分析文件/会话引用的实现与线协议。
const BASE = "https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.1.0-rc.8/";

async function fetchText(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) return null;
  return await res.text();
}

const files = [
  "packages/client/ui-input-trigger/src/core/detect.ts",
  "packages/client/ui-input-trigger/src/core/menu.ts",
  "packages/client/ui-input-trigger/src/core/contract.ts",
  "packages/client/ui-conversation/src/client/service.ts",
];

for (const f of files) {
  const s = await fetchText(f);
  if (!s) {
    console.log(`\n===== ${f} ===== (404)`);
    continue;
  }
  console.log(`\n===== ${f} (${s.length}) =====`);
  // 找 mention/@/reference/session 相关片段
  const lines = s.split("\n");
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (/mention|@|reference|sessionRef|fileRef|popup|candidate/i.test(lines[i])) hits.push(i);
  }
  const shown = new Set();
  for (const i of hits) {
    const block = Math.floor(i / 30);
    if (shown.has(block)) continue;
    shown.add(block);
    console.log(`--- lines ${block * 30}-${block * 30 + 30} ---`);
    console.log(lines.slice(block * 30, block * 30 + 30).join("\n").slice(0, 2400));
  }
}
