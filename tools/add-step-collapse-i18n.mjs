// 0.13.52:工作步骤收起时机(设置页新行)与按会话草稿的文案。
import fs from "node:fs";
import path from "node:path";

const ROOT = "D:/Workspace/vscode";

const KEYS = {
  "工作步骤:思考与工具调用段的自动收起时机": {
    en: "Work steps: when to auto-collapse reasoning and tool-call groups",
    "zh-tw": "工作步驟:思考與工具呼叫段的自動收起時機",
    ja: "作業ステップ:思考・ツール呼び出しの自動折りたたみのタイミング",
    ko: "작업 단계: 사고·도구 호출 묶음을 자동으로 접는 시점",
    de: "Arbeitsschritte: wann Denk- und Werkzeugblöcke automatisch einklappen",
    fr: "Étapes de travail : quand replier automatiquement les blocs de réflexion et d'outils",
    es: "Pasos de trabajo: cuándo plegar automáticamente los bloques de razonamiento y herramientas",
    pt: "Etapas de trabalho: quando recolher automaticamente os blocos de raciocínio e ferramentas",
    th: "ขั้นตอนการทำงาน: เวลาที่จะย่อกลุ่มการคิดและการเรียกเครื่องมืออัตโนมัติ",
    id: "Langkah kerja: kapan menciutkan grup penalaran dan pemanggilan alat secara otomatis",
    tr: "Çalışma adımları: akıl yürütme ve araç çağrısı gruplarını otomatik toplama zamanı",
    ru: "Шаги работы: когда автоматически сворачивать блоки рассуждений и вызовов инструментов",
    ar: "خطوات العمل: وقت طي مجموعات التفكير واستدعاء الأدوات تلقائيًا",
  },
  "设置在 dsh.stepCollapse;手动展开过的段不会因为重绘又被收起。": {
    en: "Stored in dsh.stepCollapse; a group you expand by hand is not collapsed again by a re-render.",
    "zh-tw": "設定在 dsh.stepCollapse;手動展開過的段不會因為重繪又被收起。",
    ja: "設定は dsh.stepCollapse。手動で展開した段は再描画でも折りたたまれません。",
    ko: "설정은 dsh.stepCollapse에 저장됩니다. 직접 펼친 묶음은 다시 그려져도 접히지 않습니다.",
    de: "Gespeichert in dsh.stepCollapse; ein von Hand aufgeklappter Block wird beim Neuzeichnen nicht wieder eingeklappt.",
    fr: "Stocké dans dsh.stepCollapse ; un bloc que vous avez ouvert à la main n'est pas replié lors d'un nouveau rendu.",
    es: "Se guarda en dsh.stepCollapse; un bloque que abriste a mano no se vuelve a plegar al redibujar.",
    pt: "Guardado em dsh.stepCollapse; um bloco que você abriu à mão não é recolhido novamente ao redesenhar.",
    th: "เก็บใน dsh.stepCollapse กลุ่มที่คุณกางเองจะไม่ถูกย่ออีกเมื่อวาดใหม่",
    id: "Disimpan di dsh.stepCollapse; grup yang Anda buka sendiri tidak akan diciutkan lagi saat digambar ulang.",
    tr: "dsh.stepCollapse içinde saklanır; elle açtığınız grup yeniden çizimde tekrar toplanmaz.",
    ru: "Хранится в dsh.stepCollapse; вручную развёрнутый блок не сворачивается повторно при перерисовке.",
    ar: "يُحفظ في dsh.stepCollapse؛ المجموعة التي توسّعها يدويًا لا تُطوى مرة أخرى عند إعادة الرسم.",
  },
};

// 1) EN_TEXT in ui.ts
const uiPath = path.join(ROOT, "src/webview/ui.ts");
let ui = fs.readFileSync(uiPath, "utf8");
const anchor = '  "点击查看大图": "Click to enlarge",';
if (!ui.includes(anchor)) {
  console.error("EN_TEXT anchor missing");
  process.exit(1);
}
const lines = Object.entries(KEYS)
  .filter(([k]) => !ui.includes(`${JSON.stringify(k)}:`))
  .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v.en)},`)
  .join("\n");
if (lines) {
  ui = ui.replace(anchor, `${anchor}\n  // ---- 工作步骤收起时机(设置页) ----\n${lines}`);
  fs.writeFileSync(uiPath, ui, "utf8");
  console.log("ui.ts EN_TEXT: added", lines.split("\n").length);
} else {
  console.log("ui.ts EN_TEXT: nothing to add");
}

// 2) 12 语言词典
let updated = 0;
const dir = path.join(ROOT, "src/webview/texts");
for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith(".json")) continue;
  const lang = file.replace(/\.json$/, "");
  const full = path.join(dir, file);
  const dict = JSON.parse(fs.readFileSync(full, "utf8"));
  let touched = false;
  for (const [key, byLang] of Object.entries(KEYS)) {
    if (dict[key] === undefined && byLang[lang] !== undefined) {
      dict[key] = byLang[lang];
      touched = true;
    }
  }
  if (touched) {
    fs.writeFileSync(full, `${JSON.stringify(dict, null, 2)}\n`, "utf8");
    updated += 1;
  }
}
console.log(`texts/*.json updated: ${updated}`);
