import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const extensionBuild = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: "dist/extension.js",
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info",
};

/** @type {import('esbuild').BuildOptions} */
const webviewBuild = {
  entryPoints: ["src/webview/ui.ts"],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  outfile: "dist/webview/ui.js",
  sourcemap: false,
  logLevel: "info",
};

/** @type {import('esbuild').BuildOptions} */
const cordisBuild = {
  entryPoints: ["src/webview/cordis.ts"],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  outfile: "dist/webview/cordis.js",
  sourcemap: false,
  logLevel: "info",
};

if (watch) {
  const ctxs = await Promise.all([esbuild.context(extensionBuild), esbuild.context(webviewBuild), esbuild.context(cordisBuild)]);
  await Promise.all(ctxs.map((ctx) => ctx.watch()));
  console.log("[esbuild] watching...");
} else {
  await Promise.all([esbuild.build(extensionBuild), esbuild.build(webviewBuild), esbuild.build(cordisBuild)]);
  console.log("[esbuild] build done");
}
