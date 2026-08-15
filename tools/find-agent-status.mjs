// Scan @deepseek-ai packages for agent status transitions.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
const base = 'C:/Users/my/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai';
for (const d of readdirSync(base)) {
  if (!d.startsWith('dsh-agent')) continue;
  const idx = base + '/' + d + '/index.js';
  if (!existsSync(idx)) continue;
  const s = readFileSync(idx, 'utf8');
  const hits = [];
  const re = /(?:status\s*=\s*|status:\s*)(['"])([a-z-]+)\1/g;
  let m;
  while ((m = re.exec(s))) hits.push(m[2]);
  if (hits.length) console.log(d, JSON.stringify(hits));
}
