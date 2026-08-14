// 一次性脚本:为各语言词典补齐 .dsh 菜单新交互(技能 token / 打开文件)文案键。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const additions = {
  "zh-tw": {
    "插入 /名称 调用技能(宿主自动展开技能正文)": "插入 /名稱 呼叫技能(宿主自動展開技能正文)",
    "在 VS Code 中打开智能体定义文件": "在 VS Code 中開啟智慧體定義檔案",
    "在 VS Code 中打开记忆文件": "在 VS Code 中開啟記憶檔案",
  },
  ja: {
    "插入 /名称 调用技能(宿主自动展开技能正文)": "/名前 を挿入してスキルを呼び出す(ホストが本文を自動展開)",
    "在 VS Code 中打开智能体定义文件": "VS Code でエージェント定義ファイルを開く",
    "在 VS Code 中打开记忆文件": "VS Code で記憶ファイルを開く",
  },
  ko: {
    "插入 /名称 调用技能(宿主自动展开技能正文)": "/이름 을 삽입해 스킬 호출(호스트가 본문 자동 확장)",
    "在 VS Code 中打开智能体定义文件": "VS Code에서 에이전트 정의 파일 열기",
    "在 VS Code 中打开记忆文件": "VS Code에서 메모리 파일 열기",
  },
  de: {
    "插入 /名称 调用技能(宿主自动展开技能正文)": "/Name einfügen, um die Fähigkeit aufzurufen (Host entfaltet den Inhalt)",
    "在 VS Code 中打开智能体定义文件": "Agentdefinitionsdatei in VS Code öffnen",
    "在 VS Code 中打开记忆文件": "Speicherdatei in VS Code öffnen",
  },
  fr: {
    "插入 /名称 调用技能(宿主自动展开技能正文)": "Insérer /nom pour invoquer (l'hôte déploie le corps de la compétence)",
    "在 VS Code 中打开智能体定义文件": "Ouvrir le fichier de définition d'agent dans VS Code",
    "在 VS Code 中打开记忆文件": "Ouvrir le fichier mémoire dans VS Code",
  },
  es: {
    "插入 /名称 调用技能(宿主自动展开技能正文)": "Insertar /nombre para invocar (el host expande el cuerpo de la habilidad)",
    "在 VS Code 中打开智能体定义文件": "Abrir el archivo de definición del agente en VS Code",
    "在 VS Code 中打开记忆文件": "Abrir el archivo de memoria en VS Code",
  },
  pt: {
    "插入 /名称 调用技能(宿主自动展开技能正文)": "Inserir /nome para invocar (o host expande o corpo da habilidade)",
    "在 VS Code 中打开智能体定义文件": "Abrir o arquivo de definição do agente no VS Code",
    "在 VS Code 中打开记忆文件": "Abrir o arquivo de memória no VS Code",
  },
  th: {
    "插入 /名称 调用技能(宿主自动展开技能正文)": "แทรก /ชื่อ เพื่อเรียกใช้ (โฮสต์ขยายเนื้อหาสกิลอัตโนมัติ)",
    "在 VS Code 中打开智能体定义文件": "เปิดไฟล์คำจำกัดความเอเจนต์ใน VS Code",
    "在 VS Code 中打开记忆文件": "เปิดไฟล์หน่วยความจำใน VS Code",
  },
  id: {
    "插入 /名称 调用技能(宿主自动展开技能正文)": "Sisipkan /nama untuk memanggil (host memperluas isi skill)",
    "在 VS Code 中打开智能体定义文件": "Buka file definisi agen di VS Code",
    "在 VS Code 中打开记忆文件": "Buka file memori di VS Code",
  },
  tr: {
    "插入 /名称 调用技能(宿主自动展开技能正文)": "/ad ekleyerek çağır (host içeriği otomatik genişletir)",
    "在 VS Code 中打开智能体定义文件": "Ajan tanım dosyasını VS Code'da aç",
    "在 VS Code 中打开记忆文件": "Bellek dosyasını VS Code'da aç",
  },
  ar: {
    "插入 /名称 调用技能(宿主自动展开技能正文)": "أدخل /الاسم للاستدعاء (يوسّع المضيف نص المهارة تلقائيًا)",
    "在 VS Code 中打开智能体定义文件": "فتح ملف تعريف الوكيل في VS Code",
    "在 VS Code 中打开记忆文件": "فتح ملف الذاكرة في VS Code",
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
