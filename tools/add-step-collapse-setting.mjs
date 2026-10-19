// 新增 dsh.stepCollapse(工作步骤收起时机):package.json 设置项 + package.nls.*.json 文案。
import fs from "node:fs";

const ROOT = "D:/Workspace/vscode";
const pkgPath = `${ROOT}/package.json`;
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const props = pkg.contributes.configuration.properties;

if (!props["dsh.stepCollapse"]) {
  const rebuilt = {};
  for (const [key, value] of Object.entries(props)) {
    rebuilt[key] = value;
    if (key === "dsh.historyKey") {
      rebuilt["dsh.stepCollapse"] = {
        type: "string",
        enum: ["end", "next", "never"],
        default: "end",
        enumDescriptions: [
          "%config.stepCollapse.end%",
          "%config.stepCollapse.next%",
          "%config.stepCollapse.never%",
        ],
        description: "%config.stepCollapse%",
      };
    }
  }
  pkg.contributes.configuration.properties = rebuilt;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log("package.json: dsh.stepCollapse added");
} else {
  console.log("package.json: already present");
}

// 三种语言文案(其余语言缺省时 VS Code 回退英文)
const TEXT = {
  "%config.stepCollapse%": {
    en: "When to collapse the collapsed step summary of a turn's thinking and tool calls.",
    zh: "工作步骤(思考与工具调用)在什么时机自动收起。",
    "zh-tw": "工作步驟(思考與工具呼叫)在什麼時機自動收起。",
  },
  "%config.stepCollapse.end%": {
    en: "Collapse after the answer finishes",
    zh: "回答结束后收起",
    "zh-tw": "回答結束後收起",
  },
  "%config.stepCollapse.next%": {
    en: "Collapse when the next message arrives",
    zh: "下一条消息到来时收起",
    "zh-tw": "下一則訊息到來時收起",
  },
  "%config.stepCollapse.never%": {
    en: "Never collapse automatically",
    zh: "从不自动收起",
    "zh-tw": "從不自動收起",
  },
};

const files = { "package.nls.json": "en", "package.nls.zh-cn.json": "zh", "package.nls.zh-tw.json": "zh-tw" };
for (const [file, lang] of Object.entries(files)) {
  const full = `${ROOT}/${file}`;
  const dict = JSON.parse(fs.readFileSync(full, "utf8"));
  let added = 0;
  for (const [key, byLang] of Object.entries(TEXT)) {
    if (dict[key] === undefined && byLang[lang]) {
      dict[key] = byLang[lang];
      added += 1;
    }
  }
  if (added > 0) {
    fs.writeFileSync(full, JSON.stringify(dict, null, 2) + "\n", "utf8");
    console.log(`${file}: +${added}`);
  }
}
