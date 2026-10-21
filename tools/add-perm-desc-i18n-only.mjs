// 0.13.61:计划模式边框改紫色 + 权限说明文案补齐(之前显示 perm.desc.* 原始键)。
import fs from "node:fs";
import path from "node:path";

const ROOT = "D:/Workspace/vscode";

// ---------- 2) 权限说明文案(webview 词典缺失,导致显示 perm.desc.*) ----------
const KEYS = {
  "perm.desc.readOnly": {
    en: "The agent can read files and the workspace but cannot change anything.",
    zh: "只允许读取文件与工作区,不能做任何修改。",
    "zh-tw": "只允許讀取檔案與工作區,不能做任何修改。",
    ja: "ファイルとワークスペースの読み取りのみ許可され、変更はできません。",
    ko: "파일과 워크스페이스를 읽을 수만 있고 변경은 할 수 없습니다.",
    de: "Der Agent darf Dateien und den Arbeitsbereich lesen, aber nichts ändern.",
    fr: "L'agent peut lire les fichiers et l'espace de travail, mais ne peut rien modifier.",
    es: "El agente puede leer archivos y el espacio de trabajo, pero no cambiar nada.",
    pt: "O agente pode ler arquivos e o espaço de trabalho, mas não alterar nada.",
    th: "เอเจนต์อ่านไฟล์และเวิร์กสเปซได้ แต่แก้ไขอะไรไม่ได้",
    id: "Agen dapat membaca berkas dan ruang kerja, tetapi tidak dapat mengubah apa pun.",
    tr: "Ajan dosyaları ve çalışma alanını okuyabilir ancak hiçbir şeyi değiştiremez.",
  },
  "perm.desc.workspaceWrite": {
    en: "The agent may create and edit files inside the workspace; anything outside it needs approval.",
    zh: "可以在工作区内创建与修改文件;工作区之外的操作需要审批。",
    "zh-tw": "可以在工作區內建立與修改檔案;工作區之外的操作需要核准。",
    ja: "ワークスペース内のファイル作成・編集ができ、外側は承認が必要です。",
    ko: "워크스페이스 안에서는 파일을 만들고 수정할 수 있으며, 밖은 승인이 필요합니다.",
    de: "Der Agent darf im Arbeitsbereich Dateien erstellen und ändern; außerhalb ist eine Freigabe nötig.",
    fr: "L'agent peut créer et modifier des fichiers dans l'espace de travail ; au-delà, une approbation est requise.",
    es: "El agente puede crear y editar archivos dentro del espacio de trabajo; fuera de él requiere aprobación.",
    pt: "O agente pode criar e editar arquivos dentro do espaço de trabalho; fora dele exige aprovação.",
    th: "เอเจนต์สร้างและแก้ไขไฟล์ในเวิร์กสเปซได้ นอกนั้นต้องอนุมัติ",
    id: "Agen dapat membuat dan mengedit berkas di dalam ruang kerja; di luarnya perlu persetujuan.",
    tr: "Ajan çalışma alanı içinde dosya oluşturup düzenleyebilir; dışında onay gerekir.",
  },
  "perm.desc.dangerFullAccess": {
    en: "No sandbox and no approvals: the agent can read and modify any file on this machine.",
    zh: "不设沙箱、不做审批:agent 可以读写本机任意文件。",
    "zh-tw": "不設沙箱、不做核准:agent 可以讀寫本機任意檔案。",
    ja: "サンドボックスも承認もなし:エージェントはこのマシンの任意のファイルを読み書きできます。",
    ko: "샌드박스와 승인 없음: 에이전트가 이 컴퓨터의 모든 파일을 읽고 수정할 수 있습니다.",
    de: "Keine Sandbox, keine Freigaben: Der Agent kann jede Datei dieses Rechners lesen und ändern.",
    fr: "Aucun bac à sable ni approbation : l'agent peut lire et modifier n'importe quel fichier de cette machine.",
    es: "Sin sandbox ni aprobaciones: el agente puede leer y modificar cualquier archivo de esta máquina.",
    pt: "Sem sandbox nem aprovações: o agente pode ler e modificar qualquer arquivo desta máquina.",
    th: "ไม่มีแซนด์บ็อกซ์และไม่มีการอนุมัติ เอเจนต์อ่าน/แก้ไฟล์ใดก็ได้บนเครื่องนี้",
    id: "Tanpa sandbox dan persetujuan: agen dapat membaca dan mengubah berkas apa pun di mesin ini.",
    tr: "Sandbox ve onay yok: ajan bu makinedeki her dosyayı okuyup değiştirebilir.",
  },
  "perm.desc.custom": {
    en: "Custom sandbox and approval policy configured by the host.",
    zh: "由宿主配置的自定义沙箱与审批策略。",
    "zh-tw": "由主機自訂的沙箱與核准策略。",
    ja: "ホストが設定したカスタムのサンドボックスと承認ポリシー。",
    ko: "호스트가 설정한 사용자 지정 샌드박스 및 승인 정책.",
    de: "Vom Host konfigurierte eigene Sandbox- und Freigaberichtlinie.",
    fr: "Politique de bac à sable et d'approbation personnalisée par l'hôte.",
    es: "Política personalizada de sandbox y aprobaciones configurada por el host.",
    pt: "Política personalizada de sandbox e aprovações configurada pelo host.",
    th: "นโยบายแซนด์บ็อกซ์และการอนุมัติที่โฮสต์กำหนดเอง",
    id: "Kebijakan sandbox dan persetujuan khusus yang dikonfigurasi host.",
    tr: "Ana bilgisayarın yapılandırdığı özel sandbox ve onay ilkesi.",
  },
};

const uiPath = path.join(ROOT, "src/webview/ui.ts");
let ui = fs.readFileSync(uiPath, "utf8");
const anchor = '  "点击查看大图": "Click to enlarge",';
const lines = Object.entries(KEYS)
  .filter(([k]) => !ui.includes(`${JSON.stringify(k)}:`))
  .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v.en)},`)
  .join("\n");
if (lines) {
  ui = ui.replace(anchor, `${anchor}\n  // ---- 权限预设说明(此前缺失 → 界面显示 perm.desc.* 原始键) ----\n${lines}`);
  fs.writeFileSync(uiPath, ui, "utf8");
  console.log("ui.ts EN_TEXT: +", lines.split("\n").length);
}

let updated = 0;
const dir = path.join(ROOT, "src/webview/texts");
for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith(".json")) continue;
  const lang = file.replace(/\.json$/, "");
  const full = path.join(dir, file);
  const dict = JSON.parse(fs.readFileSync(full, "utf8"));
  let touched = false;
  for (const [key, byLang] of Object.entries(KEYS)) {
    if (dict[key] === undefined) {
      dict[key] = byLang[lang] ?? byLang.zh ?? byLang.en;
      touched = true;
    }
  }
  if (touched) {
    fs.writeFileSync(full, `${JSON.stringify(dict, null, 2)}\n`, "utf8");
    updated += 1;
  }
}
console.log(`texts/*.json updated: ${updated}`);
