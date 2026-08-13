import * as vscode from "vscode";
import enBundle from "../../l10n/bundle.l10n.json";
import zhBundle from "../../l10n/bundle.l10n.zh-cn.json";

/**
 * 运行时翻译:支持 dsh.language 设置(auto / zh-cn / en)覆盖 VS Code 显示语言。
 * 宿主侧所有面向用户的字符串经由此处翻译;聊天界面由宿主下发的 lang 决定。
 */

export type Translator = (key: string, args?: Record<string, string | number>) => string;

const EN = enBundle as Record<string, string>;
const ZH = zhBundle as Record<string, string>;

/** 当前生效语言:设置强制值优先,否则跟随 VS Code 显示语言。 */
export function effectiveLanguage(): string {
  const setting = vscode.workspace.getConfiguration("dsh").get<string>("language", "auto");
  if (setting === "zh-cn" || setting === "en") return setting;
  return vscode.env.language.toLowerCase().startsWith("zh") ? "zh-cn" : "en";
}

/** 创建翻译函数:每次调用都读取当前设置,配置变更即时生效。 */
export function createTranslator(): Translator {
  return (key, args) => {
    const lang = effectiveLanguage();
    let text = (lang === "zh-cn" ? ZH : EN)[key] ?? key;
    if (args) {
      for (const [k, v] of Object.entries(args)) {
        text = text.split(`{${k}}`).join(String(v));
      }
    }
    return text;
  };
}
