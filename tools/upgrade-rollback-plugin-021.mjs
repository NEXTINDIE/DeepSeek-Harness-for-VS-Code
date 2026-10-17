/**
 * 0.2.1 插件契约升级(dsh-git-rollback):
 * 1) engines.dsh —— 0.2.1 起宿主会按 semver(includerelease)检查插件与运行版本的兼容性,
 *    未声明时回退到 dsh peerDependencies,而旧的 ^0.1.0-rc.6 不覆盖 0.2.x → 会被判为不兼容;
 * 2) icon + locale/<lang>.json —— 插件管理页可显示图标与多语言标题/描述;
 * 3) 版本号递增 —— 扩展按 .dsh-version 标记做幂等增量安装,不递增则老用户拿不到新清单。
 * 两份副本(源代码树 plugins/ 与随包 resources/)保持完全一致。
 */
import fs from "node:fs";
import path from "node:path";

const root = "D:/Workspace/vscode";
const targets = [path.join(root, "plugins/dsh-git-rollback"), path.join(root, "resources/dsh-git-rollback")];

const NEXT_VERSION = "0.1.11";
const ENGINES = { dsh: ">=0.1.7-rc.2" };

const TITLE = {
  en: "Git rollback (turn checkpoints)",
  zh: "Git 回滚(回合级检查点)",
  "zh-cn": "Git 回滚(回合级检查点)",
  "zh-tw": "Git 復原(回合級檢查點)",
  ja: "Git ロールバック(ターン単位チェックポイント)",
  ko: "Git 롤백(턴 단위 체크포인트)",
  de: "Git-Rollback (Turn-Checkpoints)",
  fr: "Retour Git (points de contrôle par tour)",
  es: "Reversión de Git (puntos de control por turno)",
  pt: "Reversão do Git (pontos de verificação por turno)",
  th: "ย้อนกลับ Git (จุดตรวจระดับเทิร์น)",
  id: "Pembatalan Git (checkpoint per giliran)",
  tr: "Git geri alma (tur başına kontrol noktası)",
  ru: "Откат Git (контрольные точки по шагам)",
  ar: "تراجع Git (نقاط تحقق لكل دور)",
};

const DESCRIPTION = {
  en: "Per-turn Git checkpoints for DeepSeek Harness: /rollback /redo /checkpoints /undo, non-destructive restore, and turn-level restore dividers in the Web UI.",
  zh: "为 DeepSeek Harness 提供逐回合的 Git 检查点:/rollback /redo /checkpoints /undo、非破坏式还原,并在网页端显示回合级还原分隔线。",
  "zh-cn": "为 DeepSeek Harness 提供逐回合的 Git 检查点:/rollback /redo /checkpoints /undo、非破坏式还原,并在网页端显示回合级还原分隔线。",
  "zh-tw": "為 DeepSeek Harness 提供逐回合的 Git 檢查點:/rollback /redo /checkpoints /undo、非破壞式還原,並在網頁端顯示回合級還原分隔線。",
  ja: "DeepSeek Harness 向けのターン単位 Git チェックポイント:/rollback /redo /checkpoints /undo、非破壊リストア、Web UI のターン復元ディバイダー。",
  ko: "DeepSeek Harness용 턴 단위 Git 체크포인트: /rollback /redo /checkpoints /undo, 비파괴 복원, 웹 UI의 턴 복원 구분선.",
  de: "Git-Checkpoints pro Turn für DeepSeek Harness: /rollback /redo /checkpoints /undo, zerstörungsfreie Wiederherstellung und Turn-Wiederherstellungs-Trenner im Web-UI.",
  fr: "Points de contrôle Git par tour pour DeepSeek Harness : /rollback /redo /checkpoints /undo, restauration non destructive et séparateurs de restauration par tour dans l'interface Web.",
  es: "Puntos de control Git por turno para DeepSeek Harness: /rollback /redo /checkpoints /undo, restauración no destructiva y separadores de restauración por turno en la interfaz web.",
  pt: "Pontos de verificação Git por turno para o DeepSeek Harness: /rollback /redo /checkpoints /undo, restauração não destrutiva e divisores de restauração por turno na interface web.",
  th: "จุดตรวจ Git ต่อเทิร์นสำหรับ DeepSeek Harness: /rollback /redo /checkpoints /undo, การกู้คืนแบบไม่ทำลายข้อมูล และเส้นแบ่งการกู้คืนระดับเทิร์นในเว็บ UI",
  id: "Checkpoint Git per giliran untuk DeepSeek Harness: /rollback /redo /checkpoints /undo, pemulihan non-destruktif, dan pemisah pemulihan per giliran di Web UI.",
  tr: "DeepSeek Harness için tur başına Git kontrol noktaları: /rollback /redo /checkpoints /undo, yıkıcı olmayan geri yükleme ve Web arayüzünde tur geri yükleme ayırıcıları.",
  ru: "Контрольные точки Git по шагам для DeepSeek Harness: /rollback /redo /checkpoints /undo, неразрушающее восстановление и разделители восстановления по шагам в веб-интерфейсе.",
  ar: "نقاط تحقق Git لكل دور في DeepSeek Harness: /rollback /redo /checkpoints /undo، واستعادة غير مُدمِّرة، وفواصل استعادة على مستوى الدور في واجهة الويب.",
};

/** 插件图标:回退箭头 + 检查点圆点,单色以适应亮/暗主题。 */
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#4aa3ff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M4 7h9a5 5 0 0 1 0 10H8"/>
  <path d="M7 4 4 7l3 3"/>
  <circle cx="19" cy="7" r="2.1" fill="#4aa3ff" stroke="none"/>
  <circle cx="19" cy="17" r="1.4" fill="#4aa3ff" stroke="none" opacity="0.6"/>
</svg>
`;

for (const dir of targets) {
  if (!fs.existsSync(dir)) {
    console.log(`skip (missing): ${dir}`);
    continue;
  }
  const pkgPath = path.join(dir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

  pkg.version = NEXT_VERSION;
  pkg.icon = "./icon.svg";
  pkg.engines = { ...(pkg.engines ?? {}), ...ENGINES };
  // 放宽 dsh peer 范围:0.2.x 的包版本已升到 0.2.1-rc.1,旧的 ^0.1.0-rc.6 会与 engines 冲突
  pkg.peerDependencies = {
    ...(pkg.peerDependencies ?? {}),
    "@deepseek-ai/cordis": pkg.peerDependencies?.["@deepseek-ai/cordis"] ?? ">=0.1.0-rc.6",
    "@deepseek-ai/dsh-session": ">=0.1.0-rc.6",
    "@deepseek-ai/dsh-commands": ">=0.1.0-rc.6",
  };
  pkg.exports = {
    ...(pkg.exports ?? {}),
    "./package.json": "./package.json",
    "./locale/*.json": "./locale/*.json",
  };
  pkg.files = [...new Set([...(pkg.files ?? []), "icon.svg", "locale/*.json"])];
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

  fs.writeFileSync(path.join(dir, "icon.svg"), ICON_SVG, "utf8");
  const localeDir = path.join(dir, "locale");
  fs.mkdirSync(localeDir, { recursive: true });
  for (const [lang, title] of Object.entries(TITLE)) {
    const description = DESCRIPTION[lang] ?? DESCRIPTION.en;
    fs.writeFileSync(
      path.join(localeDir, `${lang}.json`),
      `${JSON.stringify({ meta: { title, description } }, null, 2)}\n`,
      "utf8",
    );
  }
  console.log(`updated ${dir} → v${NEXT_VERSION}, icon.svg, locale/${Object.keys(TITLE).length} langs, engines.dsh=${ENGINES.dsh}`);
}
