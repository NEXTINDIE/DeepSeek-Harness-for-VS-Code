// 插件 git 逻辑单元测试:临时 git 仓库实测,不依赖 DSH。
// 覆盖:检查点创建 / 无改动跳过 / 身份兜底 / 暂存区未污染 / 链完整性 /
//       回退目标选择 / 保存点可恢复 / 未跟踪精确清理 / ignored 不触碰 / redo 恢复 /
//       回合结束快照 / undo 精确撤销(不碰用户提交)与冲突路径 / 参数解析。
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkpointTurn, checkpointTurnEnd } from "../lib/checkpoint.js";
import { performRollback, performRedo, performUndo, listCheckpoints, parseTurnArg } from "../lib/rollback.js";
import { readRecord, writeRecord } from "../lib/git.js";

const GIT = "git";

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "dsh-git-rollback-test-"));
  const run = (args) => execFileSync(GIT, args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  run(["init", "-q"]);
  run(["config", "user.email", "t@t"]);
  run(["config", "user.name", "t"]);
  return { dir, run };
}

const OPTS = { gitBin: GIT, refPrefix: "refs/dsh", commitPrefix: "dsh-checkpoint" };
const SID = "session-test-1";

function status(dir) {
  return execFileSync(GIT, ["status", "--porcelain"], { cwd: dir, encoding: "utf8" }).trim();
}

test("检查点链:快照内容、用户暂存区不污染、无改动跳过", async () => {
  const { dir, run } = makeRepo();
  try {
    writeFileSync(join(dir, "a.txt"), "v1");
    run(["add", "a.txt"]);
    run(["commit", "-qm", "init"]);

    // 回合 1 前:修改已跟踪 + 新建未跟踪 + 用户暂存
    writeFileSync(join(dir, "a.txt"), "turn1-edit");
    writeFileSync(join(dir, "notes.txt"), "untracked-1");
    writeFileSync(join(dir, "staged.txt"), "user-staged");
    run(["add", "staged.txt"]);
    await checkpointTurn(GIT, dir, SID, 1, 1000, OPTS);
    const rec = readRecord(dir, SID);
    assert.equal(rec.checkpoints.length, 1);
    assert.equal(rec.checkpoints[0].turn, 1);
    assert.deepEqual(rec.checkpoints[0].untracked.sort(), ["notes.txt"]);
    // 暂存区未污染:staged.txt 仍在暂存区,notes.txt 未入库
    const st = status(dir);
    assert.match(st, /A\s+staged\.txt/);
    assert.match(st, /\?\?\s+notes\.txt/);
    // 快照树含全部三个文件
    const tree = run(["ls-tree", "-r", "--name-only", rec.checkpoints[0].commit]);
    assert.ok(tree.includes("a.txt") && tree.includes("notes.txt") && tree.includes("staged.txt"));

    // 回合 2 前:无任何改动 → 仍记录条目(复用父提交,不建新提交)
    await checkpointTurn(GIT, dir, SID, 2, 2000, OPTS);
    const rec2 = readRecord(dir, SID);
    assert.equal(rec2.checkpoints.length, 2);
    assert.equal(rec2.checkpoints[1].turn, 2);
    assert.equal(rec2.checkpoints[1].commit, rec2.checkpoints[0].commit); // 复用父提交

    // 回合 3 前:有改动 → 新检查点,链父 = 回合 1 检查点
    writeFileSync(join(dir, "a.txt"), "turn3-edit");
    await checkpointTurn(GIT, dir, SID, 3, 3000, OPTS);
    const rec3 = readRecord(dir, SID);
    assert.equal(rec3.checkpoints.length, 3);
    assert.equal(rec3.checkpoints[2].parent, rec3.checkpoints[1].commit);
    // tip ref 指向最新检查点
    const tip = run(["rev-parse", "refs/dsh/checkpoints/session-test-1"]);
    assert.equal(tip, rec3.checkpoints[2].commit);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("无改动回合也记录条目:回合内新建文件可被该回合的 /undo 撤销", async () => {
  const { dir, run } = makeRepo();
  try {
    writeFileSync(join(dir, "a.txt"), "v1");
    run(["add", "-A"]);
    run(["commit", "-qm", "init"]);
    // 回合 3 开始前:工作区与 HEAD 一致(无改动)→ 仍记录条目(复用 HEAD)
    await checkpointTurn(GIT, dir, SID, 3, 3000, OPTS);
    const rec1 = readRecord(dir, SID);
    assert.equal(rec1.checkpoints.length, 1);
    assert.equal(rec1.checkpoints[0].turn, 3);
    assert.equal(rec1.checkpoints[0].commit, run(["rev-parse", "HEAD"]));
    // 回合 3 内新建文件(此前会被"落进"下一个回合的开始快照)
    writeFileSync(join(dir, "new-file.txt"), "created-in-turn-3");
    await checkpointTurnEnd(GIT, dir, SID, 3, 4000, OPTS);
    const rec2 = readRecord(dir, SID);
    assert.ok(rec2.checkpoints[0].after, "无改动回合结束后也应记录 after 快照");
    // /undo 3 应撤销该回合的新建文件
    const res = await performUndo(GIT, dir, SID, "3", OPTS);
    assert.equal(res.kind, "success", JSON.stringify(res));
    assert.ok(!existsSync(join(dir, "new-file.txt")));
    // HEAD 与分支历史零污染
    assert.equal(run(["rev-parse", "HEAD"]), run(["rev-parse", "HEAD"]));
    assert.ok(!run(["log", "--oneline", "HEAD"]).includes("dsh-checkpoint"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("回退:目标选择、保存点、未跟踪精确清理、ignored 不触碰、HEAD 与分支历史零污染", async () => {
  const { dir, run } = makeRepo();
  try {
    writeFileSync(join(dir, "a.txt"), "v1");
    writeFileSync(join(dir, ".gitignore"), "ignored.txt\n");
    run(["add", "-A"]);
    run(["commit", "-qm", "init"]);
    await checkpointTurn(GIT, dir, SID, 1, 1000, OPTS);
    // 回合 1 改动
    writeFileSync(join(dir, "a.txt"), "turn1-edit");
    writeFileSync(join(dir, "keep.txt"), "user-untracked");
    writeFileSync(join(dir, "ignored.txt"), "ignored-file");
    run(["commit", "-qam", "user commit after checkpoint 1"]);
    await checkpointTurn(GIT, dir, SID, 2, 2000, OPTS);
    // 回合 2 改动
    writeFileSync(join(dir, "a.txt"), "turn2-edit");
    writeFileSync(join(dir, "junk.txt"), "created-in-turn2");
    writeFileSync(join(dir, "ignored.txt"), "ignored-updated");

    const headBefore = run(["rev-parse", "HEAD"]);
    const res = await performRollback(GIT, dir, SID, "2", OPTS);
    assert.equal(res.kind, "success", JSON.stringify(res));
    // 工作区回到回合 2 前
    assert.equal(readFileSync(join(dir, "a.txt"), "utf8"), "turn1-edit");
    assert.ok(existsSync(join(dir, "keep.txt"))); // 快照时已存在的用户未跟踪保留
    assert.ok(!existsSync(join(dir, "junk.txt"))); // 回合 2 新建的未跟踪被精确删除
    assert.equal(readFileSync(join(dir, "ignored.txt"), "utf8"), "ignored-updated"); // ignored 永不触碰
    const rec = readRecord(dir, SID);
    const roll = rec.rolls[rec.rolls.length - 1];
    assert.equal(roll.turn, 2);
    assert.equal(roll.removed, 1);
    assert.ok(roll.redo.startsWith(""));
    // 零污染:HEAD 分毫未动,分支历史里没有任何 dsh-checkpoint 提交,用户提交原封不动
    assert.equal(run(["rev-parse", "HEAD"]), headBefore);
    const log = run(["log", "--oneline", "HEAD"]);
    assert.ok(log.includes("user commit after checkpoint 1"));
    assert.ok(!log.includes("dsh-checkpoint"));
    assert.notEqual(run(["rev-parse", "--abbrev-ref", "HEAD"]), "HEAD"); // 未处于 detached
    // 保存点树含回退前全部内容
    const redoTree = run(["ls-tree", "-r", "--name-only", roll.redo]);
    assert.ok(redoTree.includes("junk.txt") && redoTree.includes("a.txt"));

    // /redo:恢复到回退前(同样零污染)
    writeFileSync(join(dir, "after-rollback.txt"), "post-rollback-untracked");
    const redo = await performRedo(GIT, dir, SID, OPTS);
    assert.equal(redo.kind, "success", JSON.stringify(redo));
    assert.equal(readFileSync(join(dir, "a.txt"), "utf8"), "turn2-edit");
    assert.ok(existsSync(join(dir, "junk.txt")));
    assert.ok(!existsSync(join(dir, "after-rollback.txt"))); // 回退后新建的未跟踪被清理
    assert.equal(run(["rev-parse", "HEAD"]), headBefore); // redo 同样不动 HEAD
    assert.ok(!run(["log", "--oneline", "HEAD"]).includes("dsh-checkpoint"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("回退失败路径:非 git、无检查点、无回合号、运行中由命令层拦截", async () => {
  // 真正的非 git 目录(未 init)
  const plainDir = mkdtempSync(join(tmpdir(), "dsh-git-rollback-plain-"));
  try {
    const notGit = await performRollback(GIT, plainDir, SID, "", OPTS);
    assert.equal(notGit.kind, "error");
    assert.match(notGit.text, /不是 git 仓库/);
    const cp = await listCheckpoints(GIT, plainDir, SID, OPTS);
    assert.equal(cp.kind, "error");
  } finally {
    rmSync(plainDir, { recursive: true, force: true });
  }

  const { dir } = makeRepo();
  try {
    // 无检查点
    const run = (args) => execFileSync(GIT, args, { cwd: dir, encoding: "utf8" }).trim();
    writeFileSync(join(dir, "a.txt"), "v1");
    run(["add", "-A"]);
    run(["commit", "-qm", "init"]);
    const noCp = await performRollback(GIT, dir, SID, "", OPTS);
    assert.equal(noCp.kind, "error");
    assert.match(noCp.text, /还没有检查点/);

    // 参数解析
    assert.equal(parseTurnArg(""), Number.NaN);
    assert.equal(parseTurnArg(" 3 "), 3);
    assert.deepEqual(parseTurnArg("abc"), { error: "无效的回合号:「abc」" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("gitignore 忽略 .dsh 时:add 不再非零退出、记录目录不入快照(回归)", async () => {
  const { dir, run } = makeRepo();
  try {
    // 复刻真实工作区:dsh-vscode 的 .gitignore 忽略 .dsh
    writeFileSync(join(dir, ".gitignore"), ".dsh\n");
    writeFileSync(join(dir, "a.txt"), "v1");
    run(["add", "-A"]);
    run(["commit", "-qm", "init"]);
    mkdirSync(join(dir, ".dsh/agent"), { recursive: true });
    writeFileSync(join(dir, ".dsh/agent/a.md"), "ignored-agent");
    // 第一次检查点:创建记录目录
    writeFileSync(join(dir, "a.txt"), "v1.5");
    await checkpointTurn(GIT, dir, SID, 1, 1000, OPTS);
    assert.equal(readRecord(dir, SID).checkpoints.length, 1);
    // 第二次检查点:记录目录已存在且 .dsh 被 gitignore → 旧实现 add 会非零退出
    writeFileSync(join(dir, "a.txt"), "v2");
    await checkpointTurn(GIT, dir, SID, 2, 2000, OPTS);
    const rec = readRecord(dir, SID);
    assert.equal(rec.checkpoints.length, 2);
    const tree = run(["ls-tree", "-r", "--name-only", rec.checkpoints[1].commit]);
    assert.ok(tree.includes("a.txt"));
    assert.ok(!tree.includes(".dsh/rollback")); // 记录目录不进快照
    assert.ok(!tree.includes(".dsh/agent/a.md")); // ignored 不进快照
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unborn 仓库:首检查点为根提交;身份兜底生效", async () => {
  const { dir, run } = makeRepo();
  try {
    run(["config", "--unset", "user.email"]);
    run(["config", "--unset", "user.name"]);
    writeFileSync(join(dir, "a.txt"), "unborn-content");
    // 无任何提交(unborn)时仍能检查点(根提交,身份兜底)
    await checkpointTurn(GIT, dir, SID, 1, 1000, OPTS);
    const rec = readRecord(dir, SID);
    assert.equal(rec.checkpoints.length, 1);
    const cat = run(["cat-file", "commit", rec.checkpoints[0].commit]);
    assert.match(cat, /^tree /m);
    assert.doesNotMatch(cat, /^parent /m); // 根提交无父
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("foldCheckpoints 从链重建(记录文件丢失兜底)", async () => {
  const { dir, run } = makeRepo();
  try {
    writeFileSync(join(dir, "a.txt"), "v1");
    run(["add", "-A"]);
    run(["commit", "-qm", "init"]);
    writeFileSync(join(dir, "a.txt"), "v1.5");
    await checkpointTurn(GIT, dir, SID, 1, 1000, OPTS);
    writeFileSync(join(dir, "a.txt"), "v2");
    await checkpointTurn(GIT, dir, SID, 2, 2000, OPTS);
    writeFileSync(join(dir, "a.txt"), "v3");
    await checkpointTurn(GIT, dir, SID, 3, 3000, OPTS);
    // 删除记录文件后仍可从链重建回合号顺序
    rmSync(join(dir, ".dsh/rollback"), { recursive: true, force: true });
    const { foldCheckpoints } = await import("../lib/checkpoint.js");
    const folded = await foldCheckpoints(GIT, dir, SID, OPTS);
    assert.deepEqual(folded.map((c) => c.turn), [1, 2, 3]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("记录 v1 → v2 迁移", () => {
  const { dir } = makeRepo();
  try {
    mkdirSync(join(dir, ".dsh/rollback"), { recursive: true });
    const legacy = {
      version: 1,
      sessionId: SID,
      cwd: dir,
      turns: [
        { turn: 1, seq: 10, time: 1000, commit: "a".repeat(40) },
        { turn: 2, seq: 20, time: 2000, commit: "b".repeat(40) },
      ],
    };
    const file = join(dir, ".dsh/rollback", `${SID}.json`);
    writeFileSync(file, JSON.stringify(legacy));
    const rec = readRecord(dir, SID);
    assert.equal(rec.checkpoints.length, 2);
    assert.equal(rec.checkpoints[1].turn, 2);
    assert.equal(rec.checkpoints[0].truncated, true); // 旧快照无清单 → 截断标记
    // 写回后是 v2
    writeRecord(dir, SID, rec);
    const reread = readRecord(dir, SID);
    assert.equal(reread.version, 2);
    assert.ok(reread.checkpoints.length === 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("回合结束快照 + /undo 精确撤销:只撤销回合自身改动,用户提交与 HEAD 不受影响", async () => {
  const { dir, run } = makeRepo();
  try {
    writeFileSync(join(dir, "a.txt"), "v1");
    writeFileSync(join(dir, "b.txt"), "b1");
    run(["add", "-A"]);
    run(["commit", "-qm", "init"]);
    writeFileSync(join(dir, "c.txt"), "c1"); // 回合前工作区状态
    // 回合 1 开始 → before 快照
    await checkpointTurn(GIT, dir, SID, 1, 1000, OPTS);
    // 回合内改动(会话产生的 A:改 a.txt + 新建 newfile.txt)
    writeFileSync(join(dir, "a.txt"), "turn1-edit-A");
    writeFileSync(join(dir, "newfile.txt"), "created-by-turn");
    // 回合结束 → after 快照
    await checkpointTurnEnd(GIT, dir, SID, 1, 2000, OPTS);
    const rec0 = readRecord(dir, SID);
    assert.ok(rec0.checkpoints[0].after, "应有回合结束快照(after)");
    // 用户自己提交 N 轮,最后提交 B(只改 b.txt,不碰回合动过的文件)
    writeFileSync(join(dir, "b.txt"), "user-b-commit");
    run(["add", "-A"]);
    run(["commit", "-qm", "user commit B"]);
    const headBefore = run(["rev-parse", "HEAD"]);

    const res = await performUndo(GIT, dir, SID, "1", OPTS);
    assert.equal(res.kind, "success", JSON.stringify(res));
    // 回合改动被撤销:a.txt 回到回合前内容,newfile.txt 被删除
    assert.equal(readFileSync(join(dir, "a.txt"), "utf8"), "v1");
    assert.ok(!existsSync(join(dir, "newfile.txt")));
    // 用户自己的提交内容不受影响:b.txt 保持 B 的内容,HEAD 未动,分支历史无 dsh 提交
    assert.equal(readFileSync(join(dir, "b.txt"), "utf8"), "user-b-commit");
    assert.equal(run(["rev-parse", "HEAD"]), headBefore);
    assert.ok(run(["log", "--oneline", "HEAD"]).includes("user commit B"));
    assert.ok(!run(["log", "--oneline", "HEAD"]).includes("dsh-checkpoint"));
    const rec = readRecord(dir, SID);
    assert.equal(rec.undos.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("/undo 冲突路径:用户之后手动改过同一文件 → 明确报错并保留补丁", async () => {
  const { dir, run } = makeRepo();
  try {
    writeFileSync(join(dir, "a.txt"), "v1");
    run(["add", "-A"]);
    run(["commit", "-qm", "init"]);
    writeFileSync(join(dir, "a.txt"), "v1.5");
    await checkpointTurn(GIT, dir, SID, 1, 1000, OPTS); // 回合 1 开始快照
    writeFileSync(join(dir, "a.txt"), "turn1-edit-A");
    await checkpointTurnEnd(GIT, dir, SID, 1, 2000, OPTS); // 回合 1 结束快照
    // 用户之后又手动改了同一文件(上下文不再匹配)
    writeFileSync(join(dir, "a.txt"), "user-manual-edit");
    const res = await performUndo(GIT, dir, SID, "1", OPTS);
    assert.equal(res.kind, "error");
    assert.match(res.text, /不一致/);
    assert.match(res.text, /\.patch/); // 补丁已保存供手动处理
    assert.equal(readFileSync(join(dir, "a.txt"), "utf8"), "user-manual-edit"); // 工作区未被破坏
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("/undo 缺结束快照与默认回合选择", async () => {
  const { dir, run } = makeRepo();
  try {
    writeFileSync(join(dir, "a.txt"), "v1");
    run(["add", "-A"]);
    run(["commit", "-qm", "init"]);
    // 只有开始检查点,没有回合结束快照(旧记录场景)
    await checkpointTurn(GIT, dir, SID, 1, 1000, OPTS);
    writeFileSync(join(dir, "a.txt"), "changed");
    await checkpointTurn(GIT, dir, SID, 2, 2000, OPTS); // 回合 2 开始
    // 无任何 after → /undo 报错并提示 /rollback
    const none = await performUndo(GIT, dir, SID, "", OPTS);
    assert.equal(none.kind, "error");
    assert.match(none.text, /结束快照/);
    // 回合 2 内产生改动后再结束:after 记录,默认选择最近的(回合 2)
    writeFileSync(join(dir, "a.txt"), "changed-in-turn2");
    await checkpointTurnEnd(GIT, dir, SID, 2, 3000, OPTS);
    const ok = await performUndo(GIT, dir, SID, "", OPTS);
    assert.equal(ok.kind, "success", JSON.stringify(ok));
    assert.equal(readFileSync(join(dir, "a.txt"), "utf8"), "changed"); // 撤销回回合 2 开始前的内容
    // 无效参数
    const bad = await performUndo(GIT, dir, SID, "abc", OPTS);
    assert.equal(bad.kind, "error");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("/rollback <sha>:直接恢复到指定检查点提交(分叉分隔线「还原检查点」兜底路径)", async () => {
  const { dir, run } = makeRepo();
  try {
    writeFileSync(join(dir, "a.txt"), "v1");
    run(["add", "-A"]);
    run(["commit", "-qm", "init"]);
    // 回合 1 前工作区已有状态(区别于 HEAD,否则开始快照会被判定无改动而跳过)
    writeFileSync(join(dir, "a.txt"), "v1.5");
    // 回合 1:开始快照 + 改动 + 结束快照(after = 分叉点状态)
    await checkpointTurn(GIT, dir, SID, 1, 1000, OPTS);
    writeFileSync(join(dir, "a.txt"), "turn1-edit");
    writeFileSync(join(dir, "keep.txt"), "untracked-at-fork");
    await checkpointTurnEnd(GIT, dir, SID, 1, 2000, OPTS);
    const after = readRecord(dir, SID).checkpoints[0].after.commit;
    // 回合 2 改动(类似对话 B 的工作)
    writeFileSync(join(dir, "a.txt"), "turn2-edit");
    writeFileSync(join(dir, "junk2.txt"), "created-in-b");
    const headBefore = run(["rev-parse", "HEAD"]);

    const res = await performRollback(GIT, dir, SID, after, OPTS);
    assert.equal(res.kind, "success", JSON.stringify(res));
    // 工作区回到 after 快照:回合 2 的改动消失,分叉时已有的未跟踪保留
    assert.equal(readFileSync(join(dir, "a.txt"), "utf8"), "turn1-edit");
    assert.ok(!existsSync(join(dir, "junk2.txt")));
    assert.ok(existsSync(join(dir, "keep.txt")));
    // 零污染:HEAD 未动、分支历史无 dsh 提交、保存点可 /redo
    assert.equal(run(["rev-parse", "HEAD"]), headBefore);
    assert.ok(!run(["log", "--oneline", "HEAD"]).includes("dsh-checkpoint"));
    const rec = readRecord(dir, SID);
    const roll = rec.rolls[rec.rolls.length - 1];
    assert.equal(roll.turn, -1);
    assert.equal(roll.to, after);
    const redo = await performRedo(GIT, dir, SID, OPTS);
    assert.equal(redo.kind, "success");
    assert.equal(readFileSync(join(dir, "a.txt"), "utf8"), "turn2-edit");
    // 无效 40 位十六进制(不可达提交)→ 明确报错,工作区不动
    const bad = await performRollback(GIT, dir, SID, "f".repeat(40), OPTS);
    assert.equal(bad.kind, "error");
    assert.match(bad.text, /不存在或不可达/);
    // 非十六进制 → 参数错误
    const bad2 = await performRollback(GIT, dir, SID, "abc", OPTS);
    assert.equal(bad2.kind, "error");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("中文文件名:/undo 不因 quotepath 转义/CRLF 而失败(回归)", async () => {
  const { dir, run } = makeRepo();
  try {
    writeFileSync(join(dir, "base.txt"), "v1\n");
    run(["add", "-A"]);
    run(["commit", "-qm", "init"]);
    writeFileSync(join(dir, "回合前.txt"), "pre-turn\n");
    await checkpointTurn(GIT, dir, SID, 1, 1000, OPTS);
    // 回合内新建中文名文件 + 修改中文名文件
    writeFileSync(join(dir, "测试文本A.txt"), "内容一\n内容二\n内容三\n");
    writeFileSync(join(dir, "回合前.txt"), "pre-turn-edited\n");
    await checkpointTurnEnd(GIT, dir, SID, 1, 2000, OPTS);
    const rec = readRecord(dir, SID);
    assert.ok(rec.checkpoints[0].after, "应有 after 快照");
    // /undo 应成功:中文路径不因 quotepath 转义、CRLF 行尾导致 apply 失败
    const res = await performUndo(GIT, dir, SID, "1", OPTS);
    assert.equal(res.kind, "success", JSON.stringify(res));
    assert.ok(!existsSync(join(dir, "测试文本A.txt")), "中文新建文件应被撤销删除");
    // Windows autocrlf 会把还原内容写成 CRLF,按去除行尾差异比较
    assert.equal(readFileSync(join(dir, "回合前.txt"), "utf8").replace(/\r\n/g, "\n"), "pre-turn\n");
    // HEAD 零污染
    assert.ok(!run(["log", "--oneline", "HEAD"]).includes("dsh-checkpoint"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
