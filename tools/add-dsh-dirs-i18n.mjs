// 一次性脚本:为各语言词典补齐 .dsh 项目目录(agent/skills/memory)菜单键。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const additions = {
  "zh-tw": {
    "插入 .dsh 技能说明(SKILL.md)": "插入 .dsh 技能說明(SKILL.md)",
    "插入 .dsh 智能体定义": "插入 .dsh 智慧體定義",
    "记忆 {name}": "記憶 {name}",
    "插入 .dsh 记忆内容": "插入 .dsh 記憶內容",
  },
  ja: {
    "插入 .dsh 技能说明(SKILL.md)": ".dsh スキル説明(SKILL.md)を挿入",
    "插入 .dsh 智能体定义": ".dsh エージェント定義を挿入",
    "记忆 {name}": "記憶 {name}",
    "插入 .dsh 记忆内容": ".dsh 記憶内容を挿入",
  },
  ko: {
    "插入 .dsh 技能说明(SKILL.md)": ".dsh 스킬 설명(SKILL.md) 삽입",
    "插入 .dsh 智能体定义": ".dsh 에이전트 정의 삽입",
    "记忆 {name}": "메모리 {name}",
    "插入 .dsh 记忆内容": ".dsh 메모리 내용 삽입",
  },
  de: {
    "插入 .dsh 技能说明(SKILL.md)": ".dsh-Skillbeschreibung einfügen (SKILL.md)",
    "插入 .dsh 智能体定义": ".dsh-Agentdefinition einfügen",
    "记忆 {name}": "Gedächtnis {name}",
    "插入 .dsh 记忆内容": ".dsh-Speicherinhalt einfügen",
  },
  fr: {
    "插入 .dsh 技能说明(SKILL.md)": "Insérer la description de compétence .dsh (SKILL.md)",
    "插入 .dsh 智能体定义": "Insérer la définition d'agent .dsh",
    "记忆 {name}": "Mémoire {name}",
    "插入 .dsh 记忆内容": "Insérer le contenu mémoire .dsh",
  },
  es: {
    "插入 .dsh 技能说明(SKILL.md)": "Insertar descripción de habilidad .dsh (SKILL.md)",
    "插入 .dsh 智能体定义": "Insertar definición de agente .dsh",
    "记忆 {name}": "Memoria {name}",
    "插入 .dsh 记忆内容": "Insertar contenido de memoria .dsh",
  },
  pt: {
    "插入 .dsh 技能说明(SKILL.md)": "Inserir descrição de habilidade .dsh (SKILL.md)",
    "插入 .dsh 智能体定义": "Inserir definição de agente .dsh",
    "记忆 {name}": "Memória {name}",
    "插入 .dsh 记忆内容": "Inserir conteúdo de memória .dsh",
  },
  th: {
    "插入 .dsh 技能说明(SKILL.md)": "แทรกคำอธิบายสกิล .dsh (SKILL.md)",
    "插入 .dsh 智能体定义": "แทรกคำจำกัดความเอเจนต์ .dsh",
    "记忆 {name}": "หน่วยความจำ {name}",
    "插入 .dsh 记忆内容": "แทรกเนื้อหาหน่วยความจำ .dsh",
  },
  id: {
    "插入 .dsh 技能说明(SKILL.md)": "Sisipkan deskripsi skill .dsh (SKILL.md)",
    "插入 .dsh 智能体定义": "Sisipkan definisi agen .dsh",
    "记忆 {name}": "Memori {name}",
    "插入 .dsh 记忆内容": "Sisipkan konten memori .dsh",
  },
  tr: {
    "插入 .dsh 技能说明(SKILL.md)": ".dsh beceri açıklamasını ekle (SKILL.md)",
    "插入 .dsh 智能体定义": ".dsh ajan tanımını ekle",
    "记忆 {name}": "Bellek {name}",
    "插入 .dsh 记忆内容": ".dsh bellek içeriğini ekle",
  },
  ar: {
    "插入 .dsh 技能说明(SKILL.md)": "إدراج وصف مهارة .dsh (SKILL.md)",
    "插入 .dsh 智能体定义": "إدراج تعريف وكيل .dsh",
    "记忆 {name}": "الذاكرة {name}",
    "插入 .dsh 记忆内容": "إدراج محتوى ذاكرة .dsh",
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
