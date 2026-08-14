import { readFileSync } from "node:fs";
const s = readFileSync(process.argv[2], "utf8");
let n = 0;
let idx = s.indexOf("permission");
while (idx !== -1 && n < 20) {
  const ctx = s.slice(Math.max(0, idx - 250), idx + 350).replace(/\s+/g, " ");
  console.log(ctx);
  console.log("---");
  n++;
  idx = s.indexOf("permission", idx + 1);
}
console.log("total hits:", n);
