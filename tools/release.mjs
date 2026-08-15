// 发布脚本:递增版本号 + 自动生成中英双语更新日志条目。
// 用法:
//   node tools/release.mjs [--note "中文摘要"] [--noteEn "英文摘要"] [--minor|--major]
// 说明:
//   - 默认递增 patch;--minor / --major 递增次/主版本。
//   - 未提供 --note / --noteEn 时,自动从 git 最近 15 条提交摘取英文摘要,
//     中文摘要给出通用说明。
//   - 同时更新:package.json(版本)、README.md(版本替换)、
//     CHANGELOG.md(双语条目)、.dsh/agent/extension-changelog.md(智能体同步)。
//   - 打印新版本号,供后续打包使用。
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
};
const noteZh = arg("--note");
const noteEn = arg("--noteEn");
const kind = args.includes("--minor") ? 1 : args.includes("--major") ? 0 : 2;

const pkgPath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const oldVersion = pkg.version;
const [a, b, c] = oldVersion.split(".").map(Number);
const next = kind === 2 ? [a, b, c + 1] : kind === 1 ? [a, b + 1, 0] : [a + 1, 0, 0];
const version = next.join(".");

pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// README 中的旧版本号替换为新版本号
const readmePath = join(root, "README.md");
try {
  const readme = readFileSync(readmePath, "utf8");
  writeFileSync(readmePath, readme.split(oldVersion).join(version));
} catch {
  // README 缺失时忽略
}

// 摘要:优先 --note/--noteEn;缺失时从 git 自动汇总
let en = noteEn;
let zh = noteZh;
if (!en || !zh) {
  try {
    const log = execSync("git log --oneline -15", { cwd: root, encoding: "utf8" })
      .trim()
      .split("\n")
      .map((l) => l.replace(/^[0-9a-f]{7,}\s*/, ""))
      .filter(Boolean);
    if (!en) en = log.join("; ") || "Minor improvements and fixes.";
    if (!zh) zh = `本次发布包含若干改进与修复(最近 ${log.length} 条提交),详见英文条目。`;
  } catch {
    en = en ?? "Minor improvements and fixes.";
    zh = zh ?? "本次发布包含若干改进与修复。";
  }
}
const entry = `## ${version}\n- ${en}\n- ${zh}\n`;

// CHANGELOG.md:在标题后插入新条目
const changelogPath = join(root, "CHANGELOG.md");
try {
  const cl = readFileSync(changelogPath, "utf8");
  writeFileSync(changelogPath, cl.replace(/^# Changelog\n\n/, `# Changelog\n\n${entry}\n`));
} catch {
  writeFileSync(changelogPath, `# Changelog\n\n${entry}\n`);
}

// .dsh/agent/extension-changelog.md:在文档标题后同步插入新条目(标题不在文件开头,须按 indexOf 定位)
const agentPath = join(root, ".dsh", "agent", "extension-changelog.md");
try {
  const agent = readFileSync(agentPath, "utf8");
  const marker = "# dsh-vscode Changelog";
  const i = agent.indexOf(marker);
  if (i >= 0) {
    const inserted = `${agent.slice(0, i + marker.length)}\n\n${entry.trim()}\n${agent.slice(i + marker.length)}`;
    writeFileSync(agentPath, inserted);
  }
} catch {
  // 智能体文件缺失时忽略
}

console.log(`released v${version}`);
console.log(entry.trim());
