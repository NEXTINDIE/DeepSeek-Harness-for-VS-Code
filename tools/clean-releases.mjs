// 打包前清理 Releases 目录中的旧版本 .vsix,只保留即将生成的新包。
import { readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "Releases");
let removed = 0;
for (const name of readdirSync(dir)) {
  if (name.startsWith("dsh-vscode-") && name.endsWith(".vsix")) {
    unlinkSync(join(dir, name));
    removed++;
    console.log(`[clean-releases] removed ${name}`);
  }
}
console.log(`[clean-releases] done, removed ${removed} old package(s)`);
