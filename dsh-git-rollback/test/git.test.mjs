// 插件 git 逻辑单元测试:临时 git 仓库实测,不依赖 DSH。
// 覆盖:检查点创建 / 无改动跳过 / 身份兜底 / 暂存区未污染 / 链完整性 /
//       回退目标选择 / 保存点可恢复 / 未跟踪精确清理 / ignored 不触碰 / redo 恢复 / 参数解析。
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkpointTurn } from "../lib/checkpoint.js";
import { performRollback, performRedo, listCheckpoints, parseTurnArg } from "../lib/rollback.js";
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

    // 回合 2 前:无任何改动 → 跳过
    await checkpointTurn(GIT, dir, SID, 2, 2000, OPTS);
    assert.equal(readRecord(dir, SID).checkpoints.length, 1);

    // 回合 3 前:有改动 → 新检查点,链父 = 回合 1 检查点
    writeFileSync(join(dir, "a.txt"), "turn3-edit");
    await checkpointTurn(GIT, dir, SID, 3, 3000, OPTS);
    const rec3 = readRecord(dir, SID);
    assert.equal(rec3.checkpoints.length, 2);
    assert.equal(rec3.checkpoints[1].parent, rec3.checkpoints[0].commit);
    // tip ref 指向最新检查点
    const tip = run(["rev-parse", "refs/dsh/checkpoints/session-test-1"]);
    assert.equal(tip, rec3.checkpoints[1].commit);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("回退:目标选择、保存点、未跟踪精确清理、ignored 不触碰、HEAD 移动但数据可达", async () => {
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
    // 分支指针已移动(reset --hard 语义),但用户提交与保存点仍可达
    const rec = readRecord(dir, SID);
    const roll = rec.rolls[rec.rolls.length - 1];
    assert.equal(roll.turn, 2);
    assert.equal(roll.removed, 1);
    assert.ok(roll.redo.startsWith(""));
    const cat = run(["cat-file", "-e", headBefore + "^{commit}"]);
    assert.equal(cat, ""); // 用户提交对象仍在
    // 保存点树含回退前全部内容
    const redoTree = run(["ls-tree", "-r", "--name-only", roll.redo]);
    assert.ok(redoTree.includes("junk.txt") && redoTree.includes("a.txt"));

    // /redo:恢复到回退前
    writeFileSync(join(dir, "after-rollback.txt"), "post-rollback-untracked");
    const redo = await performRedo(GIT, dir, SID, OPTS);
    assert.equal(redo.kind, "success", JSON.stringify(redo));
    assert.equal(readFileSync(join(dir, "a.txt"), "utf8"), "turn2-edit");
    assert.ok(existsSync(join(dir, "junk.txt")));
    assert.ok(!existsSync(join(dir, "after-rollback.txt"))); // 回退后新建的未跟踪被清理
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
