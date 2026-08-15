// 一次性脚本:补齐 DSH 用户技能开关的词典键(webview texts + package.nls)。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const webviewKeys = {
  "zh-tw": {
    "DSH 用户技能": "DSH 使用者技能",
    "显示 / 隐藏 DSH 用户全局技能(~/.dsh/skills、~/.agents/skills)": "顯示 / 隱藏 DSH 使用者全域技能(~/.dsh/skills、~/.agents/skills)",
    "全局": "全域",
  },
  ja: {
    "DSH 用户技能": "DSH ユーザースキル",
    "显示 / 隐藏 DSH 用户全局技能(~/.dsh/skills、~/.agents/skills)": "DSH ユーザー全体スキルを表示/非表示(~/.dsh/skills、~/.agents/skills)",
    "全局": "全体",
  },
  ko: {
    "DSH 用户技能": "DSH 사용자 스킬",
    "显示 / 隐藏 DSH 用户全局技能(~/.dsh/skills、~/.agents/skills)": "DSH 사용자 전역 스킬 표시/숨기기(~/.dsh/skills、~/.agents/skills)",
    "全局": "전역",
  },
  de: {
    "DSH 用户技能": "DSH-Benutzerskills",
    "显示 / 隐藏 DSH 用户全局技能(~/.dsh/skills、~/.agents/skills)": "DSH-Benutzerskills global anzeigen/ausblenden (~/.dsh/skills, ~/.agents/skills)",
    "全局": "global",
  },
  fr: {
    "DSH 用户技能": "Compétences utilisateur DSH",
    "显示 / 隐藏 DSH 用户全局技能(~/.dsh/skills、~/.agents/skills)": "Afficher / masquer les compétences globales utilisateur DSH (~/.dsh/skills, ~/.agents/skills)",
    "全局": "global",
  },
  es: {
    "DSH 用户技能": "Habilidades de usuario DSH",
    "显示 / 隐藏 DSH 用户全局技能(~/.dsh/skills、~/.agents/skills)": "Mostrar / ocultar habilidades globales de usuario DSH (~/.dsh/skills, ~/.agents/skills)",
    "全局": "global",
  },
  pt: {
    "DSH 用户技能": "Habilidades de usuário DSH",
    "显示 / 隐藏 DSH 用户全局技能(~/.dsh/skills、~/.agents/skills)": "Mostrar / ocultar habilidades globais de usuário DSH (~/.dsh/skills, ~/.agents/skills)",
    "全局": "global",
  },
  th: {
    "DSH 用户技能": "สกิลผู้ใช้ DSH",
    "显示 / 隐藏 DSH 用户全局技能(~/.dsh/skills、~/.agents/skills)": "แสดง / ซ่อนสกิลผู้ใช้ส่วนกลางของ DSH (~/.dsh/skills, ~/.agents/skills)",
    "全局": "ทั่วโลก",
  },
  id: {
    "DSH 用户技能": "Skill pengguna DSH",
    "显示 / 隐藏 DSH 用户全局技能(~/.dsh/skills、~/.agents/skills)": "Tampilkan / sembunyikan skill global pengguna DSH (~/.dsh/skills, ~/.agents/skills)",
    "全局": "global",
  },
  tr: {
    "DSH 用户技能": "DSH kullanıcı becerileri",
    "显示 / 隐藏 DSH 用户全局技能(~/.dsh/skills、~/.agents/skills)": "DSH kullanıcı genel becerilerini göster / gizle (~/.dsh/skills, ~/.agents/skills)",
    "全局": "genel",
  },
  ar: {
    "DSH 用户技能": "مهارات مستخدم DSH",
    "显示 / 隐藏 DSH 用户全局技能(~/.dsh/skills、~/.agents/skills)": "إظهار / إخفاء مهارات المستخدم العامة لـ DSH (~/.dsh/skills, ~/.agents/skills)",
    "全局": "عام",
  },
};

for (const [lang, dict] of Object.entries(webviewKeys)) {
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
  console.log(`${lang}.json: +${added}`);
}

// package.nls.*.json:config.agentDirs.dshUserSkills
const nlsValues = {
  "package.nls.json": "Show / hide DSH user-global skills (~/.dsh/skills, ~/.agents/skills) in the available-skills list",
  "package.nls.zh-cn.json": "在可用技能列表中显示 / 隐藏 DSH 用户全局技能(~/.dsh/skills、~/.agents/skills)",
  "package.nls.zh-tw.json": "在可用技能清單中顯示 / 隱藏 DSH 使用者全域技能(~/.dsh/skills、~/.agents/skills)",
  "package.nls.ja.json": "利用可能なスキル一覧で DSH ユーザー全体スキルを表示/非表示(~/.dsh/skills、~/.agents/skills)",
  "package.nls.ko.json": "사용 가능한 스킬 목록에서 DSH 사용자 전역 스킬 표시/숨기기(~/.dsh/skills, ~/.agents/skills)",
  "package.nls.de.json": "DSH-Benutzerskills global in der Skillliste anzeigen/ausblenden (~/.dsh/skills, ~/.agents/skills)",
  "package.nls.fr.json": "Afficher / masquer les compétences globales utilisateur DSH dans la liste (~/.dsh/skills, ~/.agents/skills)",
  "package.nls.es.json": "Mostrar / ocultar habilidades globales de usuario DSH en la lista (~/.dsh/skills, ~/.agents/skills)",
  "package.nls.pt.json": "Mostrar / ocultar habilidades globais de usuário DSH na lista (~/.dsh/skills, ~/.agents/skills)",
  "package.nls.th.json": "แสดง / ซ่อนสกิลผู้ใช้ส่วนกลางของ DSH ในรายการสกิล (~/.dsh/skills, ~/.agents/skills)",
  "package.nls.id.json": "Tampilkan / sembunyikan skill global pengguna DSH di daftar skill (~/.dsh/skills, ~/.agents/skills)",
  "package.nls.tr.json": "Beceri listesinde DSH kullanıcı genel becerilerini göster / gizle (~/.dsh/skills, ~/.agents/skills)",
  "package.nls.ar.json": "إظهار / إخفاء مهارات المستخدم العامة لـ DSH في قائمة المهارات (~/.dsh/skills, ~/.agents/skills)",
};

for (const [file, value] of Object.entries(nlsValues)) {
  const p = `${root}${file}`;
  const json = JSON.parse(readFileSync(p, "utf8"));
  if (json["config.agentDirs.dshUserSkills"] === undefined) {
    json["config.agentDirs.dshUserSkills"] = value;
    writeFileSync(p, JSON.stringify(json, null, 2) + "\n");
    console.log(`${file}: +config.agentDirs.dshUserSkills`);
  }
}
