// 0.13.52:把 dsh.stepCollapse 的 4 个 %键% 补进全部 14 个 package.nls.*.json(vsce 会逐语言校验)。
import fs from "node:fs";

const ROOT = "D:/Workspace/vscode";

const TEXT = {
  "%config.stepCollapse%": {
    en: "When to collapse a turn's thinking and tool-call steps automatically.",
    "zh-cn": "工作步骤(思考与工具调用)在什么时机自动收起。",
    "zh-tw": "工作步驟(思考與工具呼叫)在什麼時機自動收起。",
    ja: "作業ステップ(思考・ツール呼び出し)を自動で折りたたむタイミング。",
    ko: "작업 단계(사고·도구 호출)를 자동으로 접는 시점.",
    de: "Wann die Denk- und Werkzeugschritte eines Zugs automatisch eingeklappt werden.",
    fr: "Quand replier automatiquement les étapes de réflexion et d'appels d'outils d'un tour.",
    es: "Cuándo plegar automáticamente los pasos de razonamiento y llamadas de herramientas de un turno.",
    pt: "Quando recolher automaticamente as etapas de raciocínio e chamadas de ferramentas de um turno.",
    th: "เวลาที่จะย่อขั้นตอนการคิดและการเรียกเครื่องมือของรอบโดยอัตโนมัติ",
    id: "Kapan menciutkan langkah penalaran dan pemanggilan alat dalam satu giliran secara otomatis.",
    tr: "Bir turdaki akıl yürütme ve araç çağrısı adımlarının otomatik toplanma zamanı.",
    ru: "Когда автоматически сворачивать шаги рассуждений и вызовов инструментов в ходе.",
    ar: "متى تُطوى خطوات التفكير واستدعاء الأدوات في الدور تلقائيًا.",
  },
  "%config.stepCollapse.end%": {
    en: "Collapse after the answer finishes",
    "zh-cn": "回答结束后收起",
    "zh-tw": "回答結束後收起",
    ja: "回答の終了後に折りたたむ",
    ko: "답변이 끝나면 접기",
    de: "Nach dem Ende der Antwort einklappen",
    fr: "Replier à la fin de la réponse",
    es: "Plegar al terminar la respuesta",
    pt: "Recolher quando a resposta terminar",
    th: "ย่อเมื่อคำตอบเสร็จสิ้น",
    id: "Ciutkan setelah jawaban selesai",
    tr: "Yanıt bittiğinde topla",
    ru: "Сворачивать после завершения ответа",
    ar: "الطي بعد انتهاء الإجابة",
  },
  "%config.stepCollapse.next%": {
    en: "Collapse when the next message arrives",
    "zh-cn": "下一条消息到来时收起",
    "zh-tw": "下一則訊息到來時收起",
    ja: "次のメッセージが届いたら折りたたむ",
    ko: "다음 메시지가 오면 접기",
    de: "Einklappen, wenn die nächste Nachricht eintrifft",
    fr: "Replier à l'arrivée du message suivant",
    es: "Plegar cuando llegue el siguiente mensaje",
    pt: "Recolher quando a próxima mensagem chegar",
    th: "ย่อเมื่อมีข้อความถัดไป",
    id: "Ciutkan saat pesan berikutnya datang",
    tr: "Sonraki mesaj geldiğinde topla",
    ru: "Сворачивать при поступлении следующего сообщения",
    ar: "الطي عند وصول الرسالة التالية",
  },
  "%config.stepCollapse.never%": {
    en: "Never collapse automatically",
    "zh-cn": "从不自动收起",
    "zh-tw": "從不自動收起",
    ja: "自動では折りたたまない",
    ko: "자동으로 접지 않기",
    de: "Nie automatisch einklappen",
    fr: "Ne jamais replier automatiquement",
    es: "No plegar nunca automáticamente",
    pt: "Nunca recolher automaticamente",
    th: "ไม่ย่ออัตโนมัติ",
    id: "Jangan pernah menciutkan otomatis",
    tr: "Asla otomatik toplama",
    ru: "Никогда не сворачивать автоматически",
    ar: "عدم الطي تلقائيًا أبدًا",
  },
};

const LANG_BY_FILE = {
  "package.nls.json": "en",
  "package.nls.zh-cn.json": "zh-cn",
  "package.nls.zh-tw.json": "zh-tw",
  "package.nls.ja.json": "ja",
  "package.nls.ko.json": "ko",
  "package.nls.de.json": "de",
  "package.nls.fr.json": "fr",
  "package.nls.es.json": "es",
  "package.nls.pt.json": "pt",
  "package.nls.th.json": "th",
  "package.nls.id.json": "id",
  "package.nls.tr.json": "tr",
  "package.nls.ru.json": "ru",
  "package.nls.ar.json": "ar",
};

let total = 0;
for (const [file, lang] of Object.entries(LANG_BY_FILE)) {
  const full = `${ROOT}/${file}`;
  const dict = JSON.parse(fs.readFileSync(full, "utf8"));
  let added = 0;
  for (const [key, byLang] of Object.entries(TEXT)) {
    if (dict[key] === undefined) {
      dict[key] = byLang[lang] ?? byLang.en;
      added += 1;
    }
  }
  if (added > 0) {
    fs.writeFileSync(full, `${JSON.stringify(dict, null, 2)}\n`, "utf8");
    total += added;
    console.log(`${file}: +${added}`);
  }
}
console.log(`total keys added: ${total}`);
