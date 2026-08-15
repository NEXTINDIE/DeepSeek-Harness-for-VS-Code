# dsh-git-rollback

DSH(DeepSeek Harness)回合级 Git 回退服务端插件:每个回合开始(turn/start)自动快照工作区,
提供 `/rollback [N]`、`/redo`、`/checkpoints` 命令,回退**非破坏性**、用户分支历史**零污染**。

## 安装

```bash
# 安装进默认 web profile(web GUI / VS Code 扩展共用)
dsh plugin --profile web add dsh-git-rollback

# 其他 profile 同理;安装后重启 dsh web 生效
```

配置(默认即可):插件行位于 `~/.dsh/profiles/web/cordis.patch.yml` 的 `insert` 列表:

```yaml
- insert:
    - id: git-rollback
      name: dsh-git-rollback
      config:
        enabled: true
        gitBin: git
        commitPrefix: "dsh-checkpoint"
        refPrefix: "refs/dsh"
```

## 用法

| 命令 | 说明 |
| --- | --- |
| `/rollback` | 把工作区恢复到**最近一回合开始前**的状态(先弹审核预览的是 VS Code 扩展端能力) |
| `/rollback N` | 恢复到**回合 N 开始前**的状态 |
| `/redo` | 恢复最近一次 `/rollback` 前的完整状态(含未跟踪文件) |
| `/checkpoints` | 列出本会话全部检查点与清理指引 |

## 工作原理

- **检查点**:顶层会话(有 cwd、非子代理)的 `turn/start` 时快照工作区:
  `write-tree` 保存用户索引 → `add -A` 收录未跟踪文件 → `commit-tree`(父 = 上一个检查点,
  首检查点父 = 当时 HEAD,unborn 仓库为根提交;GPG 关闭;缺 git 身份用插件身份兜底)
  → `update-ref refs/dsh/checkpoints/<sessionId>` → `read-tree` 精确还原索引(**不污染用户暂存区**)。
  无改动回合跳过。
- **回退**:保存点(`refs/dsh/saves/<sessionId>`,当前完整状态含未跟踪)→ **内容级恢复**:
  `read-tree --reset -u` 目标检查点(工作区+索引 = 检查点树)→ `clean -fd` 删除检查点之后新建的
  未跟踪文件(ignored 永不触碰;检查点树里"当时未跟踪"的文件受索引保护)→ `reset --quiet` 还原索引到
  HEAD。**HEAD 与分支历史完全不动**:`git log` / `git branch` 永远看不到任何 dsh 提交,
  你自己的提交原封不动留在分支上;回退前的完整状态(含未跟踪)在保存点提交树内,`/redo` 原样恢复。
- **持久化**:记录文件 `<cwd>/.dsh/rollback/<sessionId>.json`(重启后仍在;v1 自动迁移)+
  隐藏引用 `refs/dsh/*`(git gc 不可回收;提交信息嵌入回合号,记录文件丢失时可按链重建)。
- **零污染**:快照与回退都只触碰隐藏引用 `refs/dsh/*` 与工作区内容;
  `git branch` / `git log` 看不到任何 dsh 提交;`git show-ref` 可见
  `refs/dsh/checkpoints/<sid>` 与 `refs/dsh/saves/<sid>`。

> 说明:计划中的会话日志自定义事件(ignorable)在 rc.6 构建没有注册面(见 dsh-session 的
> known-event-types 说明),故持久化采用「记录文件 + 隐藏 ref」方案,重启后检查点完整可用。

## 清理

```bash
git update-ref -d refs/dsh/checkpoints/<sessionId>
git update-ref -d refs/dsh/saves/<sessionId>
# 连同 .dsh/rollback 记录文件一起删除
```

## 开发

```bash
npm install        # 仅类型检查需要 peer 依赖;运行时零第三方依赖
npm run typecheck
npm run build      # tsc → lib/
npm test           # node --test(临时 git 仓库实测,不依赖 DSH)
```

## License

MIT
