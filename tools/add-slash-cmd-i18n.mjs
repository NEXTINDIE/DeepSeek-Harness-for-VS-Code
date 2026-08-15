// 一次性脚本:为各语言词典补齐斜杠补全新增命令标签键。
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const additions = {
  "zh-tw": {
    "切换权限": "切換權限",
    "回退回合改动": "復原此回合改動",
    "重做回退": "重做復原",
  },
  ja: {
    "切换权限": "権限を切り替え",
    "回退回合改动": "このターンの変更を元に戻す",
    "重做回退": "ロールバックをやり直す",
  },
  ko: {
    "切换权限": "권한 전환",
    "回退回合改动": "이번 턴의 변경 되돌리기",
    "重做回退": "롤백 다시 실행",
  },
  de: {
    "切换权限": "Berechtigung wechseln",
    "回退回合改动": "Änderungen dieses Turns rückgängig machen",
    "重做回退": "Rollback wiederholen",
  },
  fr: {
    "切换权限": "Changer de permission",
    "回退回合改动": "Annuler les modifications de ce tour",
    "重做回退": "Refaire le rollback",
  },
  es: {
    "切换权限": "Cambiar permiso",
    "回退回合改动": "Deshacer cambios de este turno",
    "重做回退": "Rehacer el rollback",
  },
  pt: {
    "切换权限": "Alternar permissão",
    "回退回合改动": "Desfazer alterações deste turno",
    "重做回退": "Refazer rollback",
  },
  th: {
    "切换权限": "สลับสิทธิ์",
    "回退回合改动": "เลิกทำการเปลี่ยนแปลงเทิร์นนี้",
    "重做回退": "ทำ rollback อีกครั้ง",
  },
  id: {
    "切换权限": "Ganti izin",
    "回退回合改动": "Batalkan perubahan turn ini",
    "重做回退": "Ulangi rollback",
  },
  tr: {
    "切换权限": "İzni değiştir",
    "回退回合改动": "Bu turdaki değişiklikleri geri al",
    "重做回退": "Rollback'i yinele",
  },
  ar: {
    "切换权限": "تبديل الصلاحية",
    "回退回合改动": "تراجع عن تغييرات هذه الدورة",
    "重做回退": "إعادة الاسترجاع",
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
  console.log(`${lang}.json: +${added}`);
}
