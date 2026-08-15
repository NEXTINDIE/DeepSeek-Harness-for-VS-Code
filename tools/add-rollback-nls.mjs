// 一次性脚本:为所有 package.nls.*.json 补齐 dsh.installRollbackPlugin 配置说明键。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const KEY = "config.installRollbackPlugin";
const values = {
  "package.nls.json": "Install the DSH Git rollback plugin (turn-level file rollback)",
  "package.nls.zh-cn.json": "安装 DSH Git 回退插件(回合级文件回退)",
  "package.nls.zh-tw.json": "安裝 DSH Git 回退外掛(回合級檔案回退)",
  "package.nls.ja.json": "DSH Git ロールバックプラグインをインストール(ターン単位のファイル復元)",
  "package.nls.ko.json": "DSH Git 롤백 플러그인 설치(턴 단위 파일 롤백)",
  "package.nls.de.json": "DSH-Git-Rollback-Plugin installieren (Rollback auf Turn-Ebene)",
  "package.nls.fr.json": "Installer le plugin Git rollback DSH (restauration au tour)",
  "package.nls.es.json": "Instalar el complemento Git rollback de DSH (reversión por turno)",
  "package.nls.pt.json": "Instalar o plugin de rollback Git do DSH (reversão por turno)",
  "package.nls.th.json": "ติดตั้งปลั๊กอิน Git rollback ของ DSH (ย้อนกลับรายเทิร์น)",
  "package.nls.id.json": "Pasang plugin rollback Git DSH (rollback per turn)",
  "package.nls.tr.json": "DSH Git rollback eklentisini kur (tur bazlı geri alma)",
  "package.nls.ar.json": "تثبيت إضافة Git rollback الخاصة بـ DSH (التراجع لكل دورة)",
};

for (const [file, value] of Object.entries(values)) {
  const p = `${root}${file}`;
  const json = JSON.parse(readFileSync(p, "utf8"));
  if (json[KEY] === undefined) {
    json[KEY] = value;
    writeFileSync(p, JSON.stringify(json, null, 2) + "\n");
    console.log(`${file}: +${KEY}`);
  } else {
    console.log(`${file}: already present`);
  }
}
