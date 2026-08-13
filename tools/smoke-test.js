// 冒烟测试:验证 esbuild 产物可加载、ws 已内联、无意外外部依赖
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

// 1. 用 vscode stub 加载 bundle
try {
  require(path.join(root, ".smoke", "extension.js"));
  console.log("BUNDLE LOAD OK");
} catch (error) {
  console.error("BUNDLE LOAD FAILED:", error);
  process.exit(1);
}

// 2. 检查产物
const src = fs.readFileSync(path.join(root, "dist", "extension.js"), "utf8");
console.log("ws bundled inline:", !/require\((["'])ws\1\)/.test(src));
console.log("marked not in extension bundle (webview only):", !src.includes("marked"));
const webview = fs.readFileSync(path.join(root, "dist", "webview", "ui.js"), "utf8");
console.log("webview bundle includes marked:", webview.includes("marked"));
console.log("webview bundle includes dompurify:", /DOMPurify|dompurify/i.test(webview));
