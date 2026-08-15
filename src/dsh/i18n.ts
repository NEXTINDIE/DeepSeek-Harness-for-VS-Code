import * as vscode from "vscode";
import enBundle from "../../l10n/bundle.l10n.json";
import zhBundle from "../../l10n/bundle.l10n.zh-cn.json";
import zhTwBundle from "../../l10n/bundle.l10n.zh-tw.json";
import jaBundle from "../../l10n/bundle.l10n.ja.json";
import koBundle from "../../l10n/bundle.l10n.ko.json";
import deBundle from "../../l10n/bundle.l10n.de.json";
import frBundle from "../../l10n/bundle.l10n.fr.json";
import esBundle from "../../l10n/bundle.l10n.es.json";
import ptBundle from "../../l10n/bundle.l10n.pt.json";
import thBundle from "../../l10n/bundle.l10n.th.json";
import idBundle from "../../l10n/bundle.l10n.id.json";
import trBundle from "../../l10n/bundle.l10n.tr.json";
import ruBundle from "../../l10n/bundle.l10n.ru.json";
import arBundle from "../../l10n/bundle.l10n.ar.json";

/**
 * 运行时翻译:支持 dsh.language 设置(auto / zh-cn / zh-tw / en / ja / ko / de / fr / es / pt / th / id / tr / ru / ar)覆盖 VS Code 显示语言。
 * 宿主侧所有面向用户的字符串经由此处翻译;聊天界面由宿主下发的 lang 决定。
 */

export type Translator = (key: string, args?: Record<string, string | number>) => string;

/** 支持的语言 ID(与 package.json 的 dsh.language 枚举保持一致)。 */
export const SUPPORTED_LANGUAGES = ["zh-cn", "zh-tw", "en", "ja", "ko", "de", "fr", "es", "pt", "th", "id", "tr", "ru", "ar"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const BUNDLES: Record<SupportedLanguage, Record<string, string>> = {
  "zh-cn": zhBundle as Record<string, string>,
  "zh-tw": zhTwBundle as Record<string, string>,
  en: enBundle as Record<string, string>,
  ja: jaBundle as Record<string, string>,
  ko: koBundle as Record<string, string>,
  de: deBundle as Record<string, string>,
  fr: frBundle as Record<string, string>,
  es: esBundle as Record<string, string>,
  pt: ptBundle as Record<string, string>,
  th: thBundle as Record<string, string>,
  id: idBundle as Record<string, string>,
  tr: trBundle as Record<string, string>,
  ru: ruBundle as Record<string, string>,
  ar: arBundle as Record<string, string>,
};

/** 把 VS Code 显示语言映射到扩展支持的语言;未支持时回退英文。 */
function mapVscodeLanguage(lang: string): SupportedLanguage {
  const l = lang.toLowerCase();
  if (l.startsWith("zh")) {
    // 繁体变体(台湾 / 香港 / 澳门 / Hant)归入 zh-tw,其余归入 zh-cn
    return l === "zh-tw" || l === "zh-hk" || l === "zh-mo" || l.includes("hant") ? "zh-tw" : "zh-cn";
  }
  if (l.startsWith("ja")) return "ja";
  if (l.startsWith("ko")) return "ko";
  if (l.startsWith("de")) return "de";
  if (l.startsWith("fr")) return "fr";
  if (l.startsWith("es")) return "es";
  if (l.startsWith("pt")) return "pt";
  if (l.startsWith("th")) return "th";
  if (l.startsWith("id")) return "id";
  if (l.startsWith("tr")) return "tr";
  if (l.startsWith("ru")) return "ru";
  if (l.startsWith("ar")) return "ar";
  return "en";
}

/** 当前生效语言:设置强制值优先,否则跟随 VS Code 显示语言。 */
export function effectiveLanguage(): SupportedLanguage {
  const setting = vscode.workspace.getConfiguration("dsh").get<string>("language", "auto");
  const hit = (SUPPORTED_LANGUAGES as readonly string[]).find((id) => id === setting);
  if (hit) return hit as SupportedLanguage;
  return mapVscodeLanguage(vscode.env.language);
}

/** 创建翻译函数:每次调用都读取当前设置,配置变更即时生效。 */
export function createTranslator(): Translator {
  return (key, args) => {
    const lang = effectiveLanguage();
    let text = BUNDLES[lang][key] ?? key;
    if (args) {
      for (const [k, v] of Object.entries(args)) {
        text = text.split(`{${k}}`).join(String(v));
      }
    }
    return text;
  };
}
