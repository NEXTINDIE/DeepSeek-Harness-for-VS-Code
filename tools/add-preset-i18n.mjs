// 一次性脚本:为各语言词典补齐内置 Agent 预设(名称 + 描述)的翻译键。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const additions = {
  "zh-tw": {
    "标准模式": "標準模式",
    "功能完整的编码 Agent,支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。": "功能完整的編碼 Agent,支援檔案編輯、Shell、檔案與網頁檢索、Skills、計畫、目標、子代理與工作流程。",
    "PTC 模式": "Code 模式",
    "具备标准模式的全部能力,并通过 Code Mode SDK 呈现工具,让模型用一个 TypeScript 程序组合多步操作。": "具備標準模式的全部能力,並透過 Code Mode SDK 呈現工具,讓模型用一個 TypeScript 程式組合多步驟操作。",
    "极简模式": "極簡模式",
    "仅提供持久 bash 与 str_replace_editor 的双工具编码 Agent。": "僅提供持久 bash 與 str_replace_editor 的雙工具編碼 Agent。",
    "创造模式": "創造模式",
    "用于创建自定义 Agent preset:具备标准模式的全部能力,并提供运行时检查、插件实验和 preset 创作指导。": "用於建立自訂 Agent preset:具備標準模式的全部能力,並提供執行階段檢查、外掛實驗與 preset 創作指導。",
  },
  ja: {
    "标准模式": "標準モード",
    "功能完整的编码 Agent,支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。": "ファイル編集、シェル、ファイル・Web 検索、スキル、プランニング、目標、サブエージェント、ワークフローを備えたフル機能のコーディングエージェント。",
    "PTC 模式": "コードモード",
    "具备标准模式的全部能力,并通过 Code Mode SDK 呈现工具,让模型用一个 TypeScript 程序组合多步操作。": "標準モードの全機能に加え、Code Mode SDK でツールを公開し、モデルが 1 つの TypeScript プログラムで複数ステップの操作を組み合わせられるようにします。",
    "极简模式": "最小モード",
    "仅提供持久 bash 与 str_replace_editor 的双工具编码 Agent。": "永続 bash と str_replace_editor のみを備えた 2 ツールのコーディングエージェント。",
    "创造模式": "クリエイターモード",
    "用于创建自定义 Agent preset:具备标准模式的全部能力,并提供运行时检查、插件实验和 preset 创作指导。": "カスタム Agent preset の作成向け:標準モードの全機能に加え、ランタイム検査、プラグイン実験、preset 作成ガイダンスを提供します。",
  },
  ko: {
    "标准模式": "표준 모드",
    "功能完整的编码 Agent,支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。": "파일 편집, 셸, 파일·웹 검색, 스킬, 계획, 목표, 하위 에이전트, 워크플로를 갖춘 완전한 코딩 에이전트.",
    "PTC 模式": "코드 모드",
    "具备标准模式的全部能力,并通过 Code Mode SDK 呈现工具,让模型用一个 TypeScript 程序组合多步操作。": "표준 모드의 모든 기능에 더해 Code Mode SDK로 도구를 노출하여 모델이 하나의 TypeScript 프로그램으로 여러 단계 작업을 결합할 수 있습니다.",
    "极简模式": "최소 모드",
    "仅提供持久 bash 与 str_replace_editor 的双工具编码 Agent。": "영구 bash와 str_replace_editor 두 도구만 갖춘 코딩 에이전트.",
    "创造模式": "크리에이터 모드",
    "用于创建自定义 Agent preset:具备标准模式的全部能力,并提供运行时检查、插件实验和 preset 创作指导。": "커스텀 Agent preset 제작용: 표준 모드의 모든 기능에 더해 런타임 검사, 플러그인 실험, preset 작성 지침을 제공합니다.",
  },
  de: {
    "标准模式": "Standardmodus",
    "功能完整的编码 Agent,支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。": "Vollständiger Coding-Agent mit Dateibearbeitung, Shell, Datei- und Websuche, Skills, Planung, Zielen, Subagenten und Workflows.",
    "PTC 模式": "Code-Modus",
    "具备标准模式的全部能力,并通过 Code Mode SDK 呈现工具,让模型用一个 TypeScript 程序组合多步操作。": "Alle Fähigkeiten des Standardmodus, mit Tools über das Code Mode SDK, sodass das Modell mehrstufige Operationen in einem TypeScript-Programm kombinieren kann.",
    "极简模式": "Minimalmodus",
    "仅提供持久 bash 与 str_replace_editor 的双工具编码 Agent。": "Coding-Agent mit nur zwei Tools: persistentem bash und str_replace_editor.",
    "创造模式": "Creator-Modus",
    "用于创建自定义 Agent preset:具备标准模式的全部能力,并提供运行时检查、插件实验和 preset 创作指导。": "Zum Erstellen benutzerdefinierter Agent-Presets: alle Fähigkeiten des Standardmodus plus Laufzeitprüfung, Plugin-Experimente und Anleitung zum Preset-Authoring.",
  },
  fr: {
    "标准模式": "Mode standard",
    "功能完整的编码 Agent,支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。": "Agent de codage complet avec édition de fichiers, shell, recherche de fichiers et sur le Web, compétences, planification, objectifs, sous-agents et workflows.",
    "PTC 模式": "Mode code",
    "具备标准模式的全部能力,并通过 Code Mode SDK 呈现工具,让模型用一个 TypeScript 程序组合多步操作。": "Toutes les capacités du mode standard, avec des outils exposés via le SDK Code Mode pour que le modèle combine des opérations multi-étapes dans un seul programme TypeScript.",
    "极简模式": "Mode minimal",
    "仅提供持久 bash 与 str_replace_editor 的双工具编码 Agent。": "Agent de codage à deux outils avec bash persistant et str_replace_editor.",
    "创造模式": "Mode créateur",
    "用于创建自定义 Agent preset:具备标准模式的全部能力,并提供运行时检查、插件实验和 preset 创作指导。": "Conçu pour créer des presets d'agent personnalisés, avec toutes les capacités du mode standard, plus l'inspection d'exécution, les expériences de plugins et un guidage de création de presets.",
  },
  es: {
    "标准模式": "Modo estándar",
    "功能完整的编码 Agent,支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。": "Agente de programación completo con edición de archivos, shell, búsqueda de archivos y web, habilidades, planificación, objetivos, subagentes y flujos de trabajo.",
    "PTC 模式": "Modo código",
    "具备标准模式的全部能力,并通过 Code Mode SDK 呈现工具,让模型用一个 TypeScript 程序组合多步操作。": "Todas las capacidades del modo estándar, con herramientas expuestas mediante el SDK de Code Mode para que el modelo combine operaciones de varios pasos en un solo programa TypeScript.",
    "极简模式": "Modo mínimo",
    "仅提供持久 bash 与 str_replace_editor 的双工具编码 Agent。": "Agente de programación con dos herramientas: bash persistente y str_replace_editor.",
    "创造模式": "Modo creador",
    "用于创建自定义 Agent preset:具备标准模式的全部能力,并提供运行时检查、插件实验和 preset 创作指导。": "Diseñado para crear presets de agente personalizados, con todas las capacidades del modo estándar, más inspección en tiempo de ejecución, experimentos de complementos y guía de creación de presets.",
  },
  pt: {
    "标准模式": "Modo padrão",
    "功能完整的编码 Agent,支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。": "Agente de codificação completo com edição de arquivos, shell, busca de arquivos e na web, habilidades, planejamento, metas, subagentes e fluxos de trabalho.",
    "PTC 模式": "Modo código",
    "具备标准模式的全部能力,并通过 Code Mode SDK 呈现工具,让模型用一个 TypeScript 程序组合多步操作。": "Todas as capacidades do modo padrão, com ferramentas expostas pelo SDK do Code Mode para o modelo combinar operações de várias etapas em um único programa TypeScript.",
    "极简模式": "Modo mínimo",
    "仅提供持久 bash 与 str_replace_editor 的双工具编码 Agent。": "Agente de codificação com duas ferramentas: bash persistente e str_replace_editor.",
    "创造模式": "Modo criador",
    "用于创建自定义 Agent preset:具备标准模式的全部能力,并提供运行时检查、插件实验和 preset 创作指导。": "Feito para criar presets de agente personalizados, com todas as capacidades do modo padrão, além de inspeção em tempo de execução, experimentos de plugins e orientação para criação de presets.",
  },
  th: {
    "标准模式": "โหมดมาตรฐาน",
    "功能完整的编码 Agent,支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。": "เอเจนต์เขียนโค้ดเต็มรูปแบบพร้อมการแก้ไขไฟล์, เชลล์, ค้นหาไฟล์และเว็บ, สกิล, การวางแผน, เป้าหมาย, ซับเอเจนต์ และเวิร์กโฟลว์",
    "PTC 模式": "โหมดโค้ด",
    "具备标准模式的全部能力,并通过 Code Mode SDK 呈现工具,让模型用一个 TypeScript 程序组合多步操作。": "ความสามารถทั้งหมดของโหมดมาตรฐาน พร้อมเครื่องมือที่เปิดเผยผ่าน Code Mode SDK เพื่อให้โมเดลรวมการทำงานหลายขั้นตอนในโปรแกรม TypeScript เดียว",
    "极简模式": "โหมดขั้นต่ำ",
    "仅提供持久 bash 与 str_replace_editor 的双工具编码 Agent。": "เอเจนต์เขียนโค้ดสองเครื่องมือพร้อม bash แบบถาวรและ str_replace_editor",
    "创造模式": "โหมดครีเอเตอร์",
    "用于创建自定义 Agent preset:具备标准模式的全部能力,并提供运行时检查、插件实验和 preset 创作指导。": "สร้างมาเพื่อสร้าง agent preset แบบกำหนดเอง พร้อมความสามารถทั้งหมดของโหมดมาตรฐาน รวมถึงการตรวจสอบรันไทม์ การทดลองปลั๊กอิน และคำแนะนำการเขียน preset",
  },
  id: {
    "标准模式": "Mode standar",
    "功能完整的编码 Agent,支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。": "Agen pengodean lengkap dengan penyuntingan file, shell, pencarian file dan web, skill, perencanaan, tujuan, subagen, dan alur kerja.",
    "PTC 模式": "Mode kode",
    "具备标准模式的全部能力,并通过 Code Mode SDK 呈现工具,让模型用一个 TypeScript 程序组合多步操作。": "Semua kemampuan mode standar, dengan alat yang diekspos melalui Code Mode SDK sehingga model dapat menggabungkan operasi multi-langkah dalam satu program TypeScript.",
    "极简模式": "Mode minimal",
    "仅提供持久 bash 与 str_replace_editor 的双工具编码 Agent。": "Agen pengodean dua alat dengan bash persisten dan str_replace_editor.",
    "创造模式": "Mode kreator",
    "用于创建自定义 Agent preset:具备标准模式的全部能力,并提供运行时检查、插件实验和 preset 创作指导。": "Dibuat untuk membuat preset agen kustom, dengan semua kemampuan mode standar plus inspeksi runtime, eksperimen plugin, dan panduan penulisan preset.",
  },
  tr: {
    "标准模式": "Standart mod",
    "功能完整的编码 Agent,支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。": "Dosya düzenleme, kabuk, dosya ve web araması, beceriler, planlama, hedefler, alt ajanlar ve iş akışlarıyla eksiksiz kodlama ajanı.",
    "PTC 模式": "Kod modu",
    "具备标准模式的全部能力,并通过 Code Mode SDK 呈现工具,让模型用一个 TypeScript 程序组合多步操作。": "Standart modun tüm yetenekleri; araçlar Code Mode SDK üzerinden sunulur, böylece model çok adımlı işlemleri tek bir TypeScript programında birleştirebilir.",
    "极简模式": "Minimal mod",
    "仅提供持久 bash 与 str_replace_editor 的双工具编码 Agent。": "Kalıcı bash ve str_replace_editor içeren iki araçlı kodlama ajanı.",
    "创造模式": "Yaratıcı modu",
    "用于创建自定义 Agent preset:具备标准模式的全部能力,并提供运行时检查、插件实验和 preset 创作指导。": "Özel ajan preset'leri oluşturmak için tasarlandı; standart modun tüm yeteneklerine ek olarak çalışma zamanı incelemesi, eklenti denemeleri ve preset yazım rehberi sunar.",
  },
  ar: {
    "标准模式": "الوضع القياسي",
    "功能完整的编码 Agent,支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。": "وكيل برمجة كامل مع تحرير الملفات، والطرفية، والبحث في الملفات والويب، والمهارات، والتخطيط، والأهداف، والوكلاء الفرعيين، وسير العمل.",
    "PTC 模式": "وضع الكود",
    "具备标准模式的全部能力,并通过 Code Mode SDK 呈现工具,让模型用一个 TypeScript 程序组合多步操作。": "جميع قدرات الوضع القياسي، مع أدوات معروضة عبر Code Mode SDK حتى يتمكن النموذج من دمج عمليات متعددة الخطوات في برنامج TypeScript واحد.",
    "极简模式": "الوضع الأدنى",
    "仅提供持久 bash 与 str_replace_editor 的双工具编码 Agent。": "وكيل برمجة بأداتين مع bash دائم و str_replace_editor.",
    "创造模式": "وضع المُنشئ",
    "用于创建自定义 Agent preset:具备标准模式的全部能力,并提供运行时检查、插件实验和 preset 创作指导。": "مصمم لإنشاء إعدادات وكيل مخصصة، مع جميع قدرات الوضع القياسي بالإضافة إلى فحص وقت التشغيل وتجارب الإضافات وإرشادات تأليف الإعدادات.",
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
