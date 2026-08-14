// 一次性脚本:为各语言词典补齐新版提问卡片的分页/自定义回答文案键。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const additions = {
  "zh-tw": {
    "提问": "提問",
    "放弃整组问题": "放棄整組問題",
    "第 {i} 题 / 共 {n} 题": "第 {i} 題 / 共 {n} 題",
    "下一题": "下一題",
    "上一题": "上一題",
    "输入你的答案(填写即视为自定义回答)": "輸入你的答案(填寫即視為自訂回答)",
    "⚠️ 请选择一个选项或填写自定义回答": "⚠️ 請選擇一個選項或填寫自訂回答",
  },
  ja: {
    "提问": "質問",
    "放弃整组问题": "すべての質問を破棄",
    "第 {i} 题 / 共 {n} 题": "質問 {i} / 全 {n} 件",
    "下一题": "次の質問",
    "上一题": "前の質問",
    "输入你的答案(填写即视为自定义回答)": "回答を入力(入力するとカスタム回答として扱われます)",
    "⚠️ 请选择一个选项或填写自定义回答": "⚠️ オプションを選択するか、カスタム回答を入力してください",
  },
  ko: {
    "提问": "질문",
    "放弃整组问题": "전체 질문 포기",
    "第 {i} 题 / 共 {n} 题": "질문 {i} / 총 {n}개",
    "下一题": "다음 질문",
    "上一题": "이전 질문",
    "输入你的答案(填写即视为自定义回答)": "답을 입력하세요(입력하면 사용자 지정 답변으로 처리됩니다)",
    "⚠️ 请选择一个选项或填写自定义回答": "⚠️ 옵션을 선택하거나 사용자 지정 답변을 입력하세요",
  },
  de: {
    "提问": "Frage",
    "放弃整组问题": "Alle Fragen verwerfen",
    "第 {i} 题 / 共 {n} 题": "Frage {i} von {n}",
    "下一题": "Weiter",
    "上一题": "Zurück",
    "输入你的答案(填写即视为自定义回答)": "Antwort eingeben (die Eingabe zählt als eigene Antwort)",
    "⚠️ 请选择一个选项或填写自定义回答": "⚠️ Wählen Sie eine Option oder geben Sie eine eigene Antwort ein",
  },
  fr: {
    "提问": "Question",
    "放弃整组问题": "Abandonner toutes les questions",
    "第 {i} 题 / 共 {n} 题": "Question {i} sur {n}",
    "下一题": "Suivant",
    "上一题": "Précédent",
    "输入你的答案(填写即视为自定义回答)": "Saisissez votre réponse (la saisie compte comme réponse personnalisée)",
    "⚠️ 请选择一个选项或填写自定义回答": "⚠️ Choisissez une option ou saisissez une réponse personnalisée",
  },
  es: {
    "提问": "Pregunta",
    "放弃整组问题": "Descartar todas las preguntas",
    "第 {i} 题 / 共 {n} 题": "Pregunta {i} de {n}",
    "下一题": "Siguiente",
    "上一题": "Anterior",
    "输入你的答案(填写即视为自定义回答)": "Escribe tu respuesta (escribir cuenta como respuesta personalizada)",
    "⚠️ 请选择一个选项或填写自定义回答": "⚠️ Selecciona una opción o escribe una respuesta personalizada",
  },
  pt: {
    "提问": "Pergunta",
    "放弃整组问题": "Descartar todas as perguntas",
    "第 {i} 题 / 共 {n} 题": "Pergunta {i} de {n}",
    "下一题": "Próxima",
    "上一题": "Anterior",
    "输入你的答案(填写即视为自定义回答)": "Digite sua resposta (digitar conta como resposta personalizada)",
    "⚠️ 请选择一个选项或填写自定义回答": "⚠️ Selecione uma opção ou digite uma resposta personalizada",
  },
  th: {
    "提问": "คำถาม",
    "放弃整组问题": "ยกเลิกคำถามทั้งหมด",
    "第 {i} 题 / 共 {n} 题": "คำถาม {i} จาก {n}",
    "下一题": "ถัดไป",
    "上一题": "ก่อนหน้า",
    "输入你的答案(填写即视为自定义回答)": "พิมพ์คำตอบของคุณ(การพิมพ์ถือเป็นคำตอบแบบกำหนดเอง)",
    "⚠️ 请选择一个选项或填写自定义回答": "⚠️ เลือกตัวเลือกหรือพิมพ์คำตอบแบบกำหนดเอง",
  },
  id: {
    "提问": "Pertanyaan",
    "放弃整组问题": "Batalkan semua pertanyaan",
    "第 {i} 题 / 共 {n} 题": "Pertanyaan {i} dari {n}",
    "下一题": "Berikutnya",
    "上一题": "Sebelumnya",
    "输入你的答案(填写即视为自定义回答)": "Ketik jawaban Anda (mengetik dianggap sebagai jawaban kustom)",
    "⚠️ 请选择一个选项或填写自定义回答": "⚠️ Pilih opsi atau ketik jawaban kustom",
  },
  tr: {
    "提问": "Soru",
    "放弃整组问题": "Tüm soruları bırak",
    "第 {i} 题 / 共 {n} 题": "Soru {i} / {n}",
    "下一题": "Sonraki",
    "上一题": "Önceki",
    "输入你的答案(填写即视为自定义回答)": "Yanıtınızı yazın (yazmak özel yanıt sayılır)",
    "⚠️ 请选择一个选项或填写自定义回答": "⚠️ Bir seçenek belirleyin veya özel yanıt yazın",
  },
  ar: {
    "提问": "سؤال",
    "放弃整组问题": "تجاهل جميع الأسئلة",
    "第 {i} 题 / 共 {n} 题": "السؤال {i} من {n}",
    "下一题": "التالي",
    "上一题": "السابق",
    "输入你的答案(填写即视为自定义回答)": "اكتب إجابتك(تُحتسب الكتابة إجابة مخصصة)",
    "⚠️ 请选择一个选项或填写自定义回答": "⚠️ اختر خيارًا أو اكتب إجابة مخصصة",
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
