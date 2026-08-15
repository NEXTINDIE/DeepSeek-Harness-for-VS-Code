// 插件 npm 发布脚本:发布前先查 registry,版本已存在则跳过(防止
// "You cannot publish over the previously published versions" 报错)。
//
// 背景:本工作区存在并发发布来源(自动化 / 其他会话可能抢先发布同一版本),
// 无条件 npm publish 会反复撞已发布版本号。本脚本把「查重 → 发布」做成一步。
//
// 用法:
//   node tools/publish-plugin.mjs               # 发布 plugins/dsh-git-rollback
//   node tools/publish-plugin.mjs <name>        # 发布指定插件
//
// 行为:
//   - 本地版本已在线 → 打印 "already published, skipping",退出码 0(不报错,自动化可继续)
//   - 本地版本未在线 → 进入 plugins/<name> 执行 npm publish(prepublishOnly 自动 build+test)
//   - --dry-run:只打印将执行的动作,不真正发布
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dryRun = process.argv.includes("--dry-run");
const name = process.argv.slice(2).find((a) => !a.startsWith("--")) || "dsh-git-rollback";

const pkgFile = join(root, "plugins", name, "package.json");
if (!existsSync(pkgFile)) {
  console.error(`[publish-plugin] 未找到 plugins/${name}/package.json`);
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(pkgFile, "utf8"));
const version = String(pkg.version ?? "").trim();
if (!version) {
  console.error(`[publish-plugin] ${name}:package.json 缺少 version`);
  process.exit(1);
}

// 1) 查 registry:已发布版本集合(versions 列表可能有缓存,dist-tags 也一并看)
let published = new Set();
let latest = "";
try {
  const versions = JSON.parse(execSync(`npm view ${name} versions --json`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  for (const v of Array.isArray(versions) ? versions : []) published.add(String(v));
  // dist-tags 可能返回对象 {latest: ...} 或数组 [{latest: ...}](registry 缓存形态不定)
  const distTags = JSON.parse(execSync(`npm view ${name} dist-tags --json`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  if (Array.isArray(distTags)) latest = String(distTags[0]?.latest ?? "");
  else latest = String(distTags?.latest ?? "");
} catch {
  console.error(`[publish-plugin] 查询 ${name} 的 registry 信息失败(网络/未登录?),跳过发布`);
  process.exit(1);
}

// 2) 决策
if (published.has(version)) {
  console.log(`[publish-plugin] ${name}@${version} 已在 npm 上(latest: ${latest}),跳过发布。`);
  console.log(`[publish-plugin] 如需发布新内容,请先把 plugins/${name}/package.json 的 version 递增。`);
  process.exit(0);
}

console.log(`[publish-plugin] ${name}@${version} 尚未发布,准备发布${dryRun ? "(dry-run,不执行)" : ""}...`);
if (dryRun) process.exit(0);

try {
  execSync("npm publish", { cwd: join(root, "plugins", name), stdio: "inherit" });
  console.log(`[publish-plugin] ${name}@${version} 发布成功。`);
  // 发布成功后同步 resources 副本并重打包 vsix(与发布流程一致)
  execSync(`node ${join(root, "tools", "sync-plugins.mjs")} ${name}`, { cwd: root, stdio: "inherit" });
} catch (error) {
  console.error(`[publish-plugin] 发布失败:${String(error)}`);
  process.exit(1);
}
