// 临时搜索脚本:在 web 客户端包中定位提问 pending.answer / pending.cancel 的实现。
import { readFileSync } from "node:fs";

const files = [
  "C:/Users/my/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js",
  "C:/Users/my/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/dsh-client-connection/lib/client.js",
];

for (const f of files) {
  const s = readFileSync(f, "utf8");
  console.log("== ", f.split("/").pop());
  for (const needle of ['answer(', "answer =", "cancel(", "cancel =", 'questions:', "questions ="]) {
    const idx = [];
    let i = 0;
    while ((i = s.indexOf(needle, i)) !== -1) {
      idx.push(i);
      i += needle.length;
      if (idx.length > 12) break;
    }
    console.log(`  ${JSON.stringify(needle)}: ${idx.length}`);
    for (const h of idx.slice(0, 4)) {
      console.log(s.slice(Math.max(0, h - 350), h + 350).replace(/\n{2,}/g, "\n"));
      console.log("  ----------------");
    }
  }
}
