// Cordis 插件面板的词典:12 语言 texts 词典 + 面板专用英文回退(CORDIS_EN)。
// 中文源串为键;缺失条目按 当前语言 → 英文(CORDIS_EN)→ 中文 回退。
import zhTwTexts from "./texts/zh-tw.json";
import jaTexts from "./texts/ja.json";
import koTexts from "./texts/ko.json";
import deTexts from "./texts/de.json";
import frTexts from "./texts/fr.json";
import esTexts from "./texts/es.json";
import ptTexts from "./texts/pt.json";
import thTexts from "./texts/th.json";
import idTexts from "./texts/id.json";
import trTexts from "./texts/tr.json";
import ruTexts from "./texts/ru.json";
import arTexts from "./texts/ar.json";

/** 面板专用英文回退(聊天视图的英文在 ui.ts EN_TEXT,此处仅覆盖面板用到的键)。 */
const CORDIS_EN: Record<string, string> = {
  "Cordis 插件": "Cordis plugins",
  "刷新": "Refresh",
  "运行中 ({n})": "{n} running",
  "当前会话": "This session",
  "其他会话": "Other sessions",
  "版本": "Version",
  "当前:{packageId}": "Current: {packageId}",
  "待切换:{packageId}": "Next: {packageId}",
  "待审批": "Awaiting approval",
  "运行中": "Running",
  "等待": "Waiting",
  "启动中": "Starting",
  "Client 待激活": "Client ready to activate",
  "已停止": "Stopped",
  "已拒绝": "Rejected",
  "已取消": "Cancelled",
  "运行失败": "Run failed",
  "待激活": "Ready",
  "已移除": "Removed",
  "停止": "Stop",
  "移除": "Remove",
  "运行": "Run",
  "运行此版本": "Run this version",
  "仅允许此版本": "Allow this version only",
  "允许后续版本": "Allow future versions of this plugin",
  "拒绝": "Decline",
  "还没有定义任何插件": "No plugins defined yet",
  "读取插件清单失败:{message}": "Reading the plugin inventory failed: {message}",
  "Client 半段仅在网页端生效": "The Client half only takes effect in the web GUI",
  "再次点击确认移除": "Click again to confirm removal",
  "Host": "Host",
  "Client": "Client",
  "未填写用途": "(no purpose given)",
};

const UI_TEXTS: Record<string, Record<string, string>> = {
  "zh-tw": zhTwTexts as Record<string, string>,
  en: {},
  ja: jaTexts as Record<string, string>,
  ko: koTexts as Record<string, string>,
  de: deTexts as Record<string, string>,
  fr: frTexts as Record<string, string>,
  es: esTexts as Record<string, string>,
  pt: ptTexts as Record<string, string>,
  th: thTexts as Record<string, string>,
  id: idTexts as Record<string, string>,
  tr: trTexts as Record<string, string>,
  ru: ruTexts as Record<string, string>,
  ar: arTexts as Record<string, string>,
};

/** 构造翻译函数;lang 变更后需用返回的 setLang 更新。 */
export function createT(initialLang: string) {
  let lang = initialLang.toLowerCase();
  const t = (zh: string, params?: Record<string, string | number>): string => {
    const dict = UI_TEXTS[lang];
    let text = dict?.[zh] ?? CORDIS_EN[zh] ?? zh;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.split(`{${k}}`).join(String(v));
      }
    }
    return text;
  };
  return {
    t,
    setLang(next: string) {
      lang = next.toLowerCase();
    },
  };
}
