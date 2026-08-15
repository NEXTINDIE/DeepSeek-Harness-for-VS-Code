// 插件同步脚本:把 plugins/<name> 的编译产物同步到 resources/<name>,供 vsix 打包随扩展分发。
//
// 约定:
//   plugins/<name>/          — DSH 服务端插件源码(所有新插件一律建在此目录)
//   resources/<name>/        — 编译后的插件包(扩展激活时从 resources/ 幂等安装到用户 DSH profile)
//   tools/sync-plugins.mjs   — 编译 + 同步桥梁(npm run build 自动执行,也可单独运行)
//
// 用法:
//   node tools/sync-plugins.mjs            # 同步全部插件
//   node tools/sync-plugins.mjs dsh-git-rollback   # 只同步指定插件
//
// 说明:存在 tsconfig.json 的插件先用仓库根 node_modules 里的 tsc 编译(src -> lib),
//       再把 lib/ + package.json + README.md 整体复制到 resources/<name>(先清后写,不留残留)。
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pluginsDir = join(root, "plugins");
const resourcesDir = join(root, "resources");
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");

if (!existsSync(pluginsDir)) {
  console.log("[sync-plugins] 没有 plugins/ 目录,跳过");
  process.exit(0);
}

const requested = process.argv.slice(2);
const names = requested.length
  ? requested
  : readdirSync(pluginsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

for (const name of names) {
  const src = join(pluginsDir, name);
  const pkgFile = join(src, "package.json");
  if (!existsSync(pkgFile)) {
    console.warn(`[sync-plugins] 跳过 ${name}:没有 package.json`);
    continue;
  }

  // 1) 编译(src -> lib)
  if (existsSync(join(src, "tsconfig.json"))) {
    if (!existsSync(tsc)) {
      console.error(`[sync-plugins] ${name}:未找到 typescript,请先 npm install`);
      process.exit(1);
    }
    execSync(`node "${tsc}" -p tsconfig.json`, { cwd: src, stdio: "inherit" });
  }

  // 2) 同步到 resources/<name>(先清后写)
  const dst = join(resourcesDir, name);
  rmSync(dst, { recursive: true, force: true });
  mkdirSync(dst, { recursive: true });
  if (existsSync(join(src, "lib"))) cpSync(join(src, "lib"), join(dst, "lib"), { recursive: true });
  cpSync(pkgFile, join(dst, "package.json"));
  if (existsSync(join(src, "README.md"))) cpSync(join(src, "README.md"), join(dst, "README.md"));

  const pkg = JSON.parse(readFileSync(pkgFile, "utf8"));
  console.log(`[sync-plugins] ${name}@${pkg.version} -> resources/${name}`);
}
