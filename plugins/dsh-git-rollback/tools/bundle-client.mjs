// 网页端 client 半打包:把 src/client/index.ts 打成 DSH client bundle 格式。
//
// 输出 lib/client.js —— `window.__ModuleLoader__.load({ id, factory })` 结构,
// 与官方 @deepseek-ai/dsh-client-* 包一致;factory 内 require("react") 由
// 网页端 shell 的静态模块表解析(与官方 client bundle 相同的 external)。
//
// 用法:node tools/bundle-client.mjs
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const entry = join(root, "src", "client", "index.ts");
const outfile = join(root, "lib", "client.js");
const ID = "dsh-git-rollback/client";

// 1) esbuild 打成 CommonJS(require 保留,供 factory 的运行时 require 解析)
const result = await build({
  entryPoints: [entry],
  bundle: true,
  format: "cjs",
  platform: "browser",
  external: ["react", "react/jsx-runtime"],
  write: false,
  logLevel: "warning",
});

const code = result.outputFiles[0].text;

// 2) 包装成 __ModuleLoader__.load({ id, factory })
//    注意:esbuild CJS 输出里有 `require(...)`,factory 接收运行时 require,
//    直接可用;exports 是 factory 内局部变量,module.exports 由 require 返回。
const wrapped = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(ID)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${indent(code, 4)}
    return module.exports;
  }
});
`;

mkdirSync(dirname(outfile), { recursive: true });
writeFileSync(outfile, wrapped, "utf8");
console.log(`[bundle-client] ${ID} -> ${outfile} (${wrapped.length} bytes)`);

function indent(text, spaces) {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => pad + line)
    .join("\n");
}
