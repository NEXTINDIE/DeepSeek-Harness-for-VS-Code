import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * 回合级 Git 回退服务端插件的自动安装器。
 *
 * 快照与回退执行由 DSH 服务端插件 `dsh-git-rollback` 承担(命令 /rollback /redo /checkpoints)。
 * 为了让所有扩展用户开箱即用,扩展把编译好的插件打进 vsix 的
 * `resources/dsh-git-rollback/`,激活时自动安装进插件运行所需的两个解析面:
 *   1. `<dshHome>/profiles/web/node_modules/dsh-git-rollback` —— DSH 前端模块系统
 *      (clientModules)用 `createRequire(ctx.baseUrl)` 从这里解析包的 `dsh.client`
 *      声明与 `exports["./client"]`,用于网页端回合分隔线 UI 的 bundle 分发;
 *   2. `<dshHome 同级>/.dsh-vscode/server/node_modules/dsh-git-rollback`(扩展部署的
 *      DSH 服务器,存在时)与 `~` 根级 `node_modules` —— DSH host loader 对裸包名的
 *      import 从服务器部署目录向上解析 node_modules;插件必须落在该解析链上才会被
 *      真正加载(仅落在 profiles/web 会让插件列表显示"已启用"但 host 从未激活)。
 * 两个面都带 `.dsh-version` 版本标记,幂等增量更新。
 * 另在 cordis.patch.yml 追加插件装载行(已存在则跳过),并在 profile package.json
 * 写入 file: 依赖(便于日后 pnpm 规范化安装)。
 * 安装不影响服务器运行;新行在服务器下次启动时生效(扩展连接后检测并提示重启)。
 */

const PROFILE = "web";
const PLUGIN_NAME = "dsh-git-rollback";
const VERSION_FILE = ".dsh-version";

export interface InstallResult {
  /** 插件文件是否已就位(本次或之前)。 */
  installed: boolean;
  /** 本次是否发生了写入(新增/升级)。 */
  changed: boolean;
  reason?: string;
}

/** DSH 主目录:优先 DSH_HOME 环境变量,否则 ~/.dsh。 */
export function dshHome(): string {
  const env = process.env.DSH_HOME?.trim();
  if (env) return env;
  return join(homedir(), ".dsh");
}

function readJson(file: string): unknown {
  const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(text);
}

function readVersion(dir: string): string {
  try {
    const pkg = readJson(join(dir, "package.json")) as { version?: string };
    return String(pkg.version ?? "").trim();
  } catch {
    return "";
  }
}

/** 把插件包安装进一个 node_modules 目录(幂等;版本一致则跳过)。返回是否写入。 */
function installInto(nodeModulesDir: string, bundledDir: string): { installed: boolean; changed: boolean; reason?: string } {
  const targetDir = join(nodeModulesDir, PLUGIN_NAME);
  try {
    const bundledVersion = readVersion(bundledDir);
    const installedVersion = existsSync(join(targetDir, VERSION_FILE))
      ? readFileSync(join(targetDir, VERSION_FILE), "utf8").trim()
      : "";
    if (bundledVersion && installedVersion === bundledVersion) {
      return { installed: true, changed: false };
    }
    // 先清旧目录,避免残留旧文件(如上一版没有的 client.js)
    rmSync(targetDir, { recursive: true, force: true });
    mkdirSync(join(targetDir, "lib"), { recursive: true });
    for (const file of readdirSync(join(bundledDir, "lib"))) {
      copyFileSync(join(bundledDir, "lib", file), join(targetDir, "lib", file));
    }
    copyFileSync(join(bundledDir, "package.json"), join(targetDir, "package.json"));
    writeFileSync(join(targetDir, VERSION_FILE), bundledVersion || "0");
    return { installed: true, changed: true };
  } catch (error) {
    return { installed: false, changed: false, reason: String(error) };
  }
}

/** 把编译好的插件装进用户的 DSH(幂等;失败不抛出,返回 reason)。 */
export async function ensureRollbackPluginInstalled(bundledDir: string): Promise<InstallResult> {
  try {
    const profileDir = join(dshHome(), "profiles", PROFILE);
    // profile 尚未初始化(dsh web 还没跑过):等服务器启动创建后再装,调用方会在服务器上线后重试
    if (!existsSync(join(profileDir, "cordis.patch.yml"))) {
      return { installed: false, changed: false, reason: "profile-missing" };
    }

    // 两个解析面都安装:
    // 1) profile node_modules —— clientModules(createRequire(ctx.baseUrl))解析 dsh.client 声明
    // 2) 服务器部署 node_modules + 用户根级 node_modules —— host loader 对裸包名的 import 解析链
    const targets = [join(profileDir, "node_modules")];
    const serverModules = join(homedir(), ".dsh-vscode", "server", "node_modules");
    if (existsSync(serverModules)) targets.push(serverModules);
    const userRootModules = join(homedir(), "node_modules");
    if (existsSync(userRootModules)) targets.push(userRootModules);

    const results = targets.map((dir) => installInto(dir, bundledDir));
    const installed = results.some((r) => r.installed);
    const changed = results.some((r) => r.changed);
    const reasons = results.map((r) => r.reason).filter((r) => r !== undefined);
    if (!installed && reasons.length > 0) return { installed: false, changed: false, reason: reasons.join("; ") };

    // cordis.patch.yml 追加插件装载行(顶部注释 + 末尾 `[]` 的默认形态要原地替换)
    const patchFile = join(profileDir, "cordis.patch.yml");
    const patchContent = readFileSync(patchFile, "utf8");
    if (!patchContent.includes(PLUGIN_NAME)) {
      const block =
        `- insert:\n` +
        `    - id: git-rollback\n` +
        `      name: ${PLUGIN_NAME}\n` +
        `      config:\n` +
        `        enabled: true\n` +
        `        gitBin: git\n` +
        `        commitPrefix: "dsh-checkpoint"\n` +
        `        refPrefix: "refs/dsh"\n`;
      const trimmedEnd = patchContent.trimEnd();
      if (trimmedEnd.endsWith("[]")) {
        writeFileSync(patchFile, trimmedEnd.slice(0, trimmedEnd.lastIndexOf("[]")) + block);
      } else {
        writeFileSync(patchFile, trimmedEnd + "\n" + block);
      }
    }

    // profile package.json 依赖(file: 指向扩展内置资源,日后 pnpm install 可规范化)
    const manifestFile = join(profileDir, "package.json");
    if (existsSync(manifestFile)) {
      try {
        const manifest = readJson(manifestFile) as { dependencies?: Record<string, string> };
        if (!manifest.dependencies?.[PLUGIN_NAME]) {
          manifest.dependencies = {
            ...(manifest.dependencies ?? {}),
            [PLUGIN_NAME]: `file:${bundledDir.replace(/\\/g, "/")}`,
          };
          writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
        }
      } catch {
        // profile package.json 损坏时跳过依赖写入,不影响核心安装
      }
    }
    return { installed: true, changed };
  } catch (error) {
    console.error("[dsh] rollback plugin install failed:", error);
    return { installed: false, changed: false, reason: String(error) };
  }
}
