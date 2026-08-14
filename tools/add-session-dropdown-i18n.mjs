// 一次性脚本:为各语言词典补齐会话下拉与计划审批按钮的新文案键。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const additions = {
  "zh-tw": {
    "会话": "工作階段",
    "暂无会话": "暫無工作階段",
    "去聊天里说": "去聊天裡說",
    "拒绝": "拒絕",
    "确认执行": "確認執行",
  },
  ja: {
    "会话": "セッション",
    "暂无会话": "セッションがありません",
    "去聊天里说": "チャットで話す",
    "拒绝": "拒否",
    "确认执行": "承認して実行",
  },
  ko: {
    "会话": "세션",
    "暂无会话": "세션 없음",
    "去聊天里说": "채팅에서 논의",
    "拒绝": "거부",
    "确认执行": "승인 및 실행",
  },
  de: {
    "会话": "Sitzungen",
    "暂无会话": "Keine Sitzungen",
    "去聊天里说": "Im Chat besprechen",
    "拒绝": "Ablehnen",
    "确认执行": "Bestätigen",
  },
  fr: {
    "会话": "Sessions",
    "暂无会话": "Aucune session",
    "去聊天里说": "En discuter dans le chat",
    "拒绝": "Refuser",
    "确认执行": "Approuver",
  },
  es: {
    "会话": "Sesiones",
    "暂无会话": "No hay sesiones",
    "去聊天里说": "Hablar en el chat",
    "拒绝": "Rechazar",
    "确认执行": "Aprobar",
  },
  pt: {
    "会话": "Sessões",
    "暂无会话": "Nenhuma sessão",
    "去聊天里说": "Discutir no chat",
    "拒绝": "Recusar",
    "确认执行": "Aprovar",
  },
  th: {
    "会话": "เซสชัน",
    "暂无会话": "ไม่มีเซสชัน",
    "去聊天里说": "คุยในแชท",
    "拒绝": "ปฏิเสธ",
    "确认执行": "อนุมัติ",
  },
  id: {
    "会话": "Sesi",
    "暂无会话": "Tidak ada sesi",
    "去聊天里说": "Bahas di chat",
    "拒绝": "Tolak",
    "确认执行": "Setujui",
  },
  tr: {
    "会话": "Oturumlar",
    "暂无会话": "Oturum yok",
    "去聊天里说": "Sohbette konuş",
    "拒绝": "Reddet",
    "确认执行": "Onayla",
  },
  ar: {
    "会话": "الجلسات",
    "暂无会话": "لا توجد جلسات",
    "去聊天里说": "ناقشه في الدردشة",
    "拒绝": "رفض",
    "确认执行": "موافقة",
  },
};

for (const [lang, dict] of Object.entries(additions)) {
  const file = `${root}src/webview/texts/${lang}.json`;
  const json = JSON.parse(readFileSync(file, "utf8"));
  let added = 0;
  for (const [k, v] of Object.entries(dict)) {
    if (json[k] === undefined) {
      json[k] = v;
      added += 1;
    }
  }
  writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  console.log(`${lang}.json: +${added} keys`);
}
