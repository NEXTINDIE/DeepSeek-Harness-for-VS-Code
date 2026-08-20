import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** 直接 node 启动器:完全绕开 npm 的 cmd shim(规避部分机器上 PATH/shims 损坏导致的 npx 执行包失败)。 */
interface DirectLauncher {
  kind: "direct";
  node: string;
  npmCli: string;
  installDir: string;
  label: string;
}

interface ShellLauncher {
  kind: "shell";
  command: string;
  label: string;
}

type ResolvedLauncher = DirectLauncher | ShellLauncher;

export interface ServerManagerConfig {
  url: string;
  command: string;
  autoStart: boolean;
  timeoutSec: number;
  /** 翻译函数;缺省时回退到英文。 */
  t?: (key: string, args?: Record<string, string | number>) => string;
  /** 诊断日志回调(启动器解析 / 进程退出码等),用于输出到日志通道。 */
  onLog?: (message: string) => void;
}

export interface ServerStatus {
  up: boolean;
  startedByUs: boolean;
  starting: boolean;
  url: string;
  message?: string;
}

/**
 * DSH Web 服务器生命周期管理:探测、按需自动启动(`dsh web`,回退 npx)、停止(仅限由本扩展启动的进程)。
 */
export class ServerManager {
  private child: ChildProcess | undefined;
  private startedByUs = false;
  private starting = false;
  private lastStatus: ServerStatus;

  constructor(
    private readonly cfg: ServerManagerConfig,
    private readonly onStatus: (status: ServerStatus) => void,
  ) {
    this.lastStatus = { up: false, startedByUs: false, starting: false, url: cfg.url };
  }

  get status(): ServerStatus {
    return this.lastStatus;
  }

  private setStatus(patch: Partial<ServerStatus>) {
    this.lastStatus = { ...this.lastStatus, ...patch };
    this.onStatus(this.lastStatus);
  }

  /** 探测服务器是否在运行(2 秒超时)。 */
  async isUp(timeoutMs = 2500): Promise<boolean> {
    try {
      const res = await fetch(this.cfg.url + "/", {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "text/html" },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** 确保服务器在运行;必要时按配置自动启动。返回是否可用。 */
  async ensure(): Promise<{ up: boolean; message?: string }> {
    if (await this.isUp()) {
      this.setStatus({ up: true, starting: false });
      return { up: true };
    }
    if (!this.cfg.autoStart) {
      const msg = this.cfg.t?.("hub.serverDown", { url: this.cfg.url }) ?? `DSH server is not running (${this.cfg.url}). Run "dsh web" or execute "DSH: Start Server".`;
      this.setStatus({ up: false, starting: false, message: msg });
      return { up: false, message: msg };
    }
    if (this.starting) {
      // 已有启动流程在进行,等它完成
      const deadline = Date.now() + this.cfg.timeoutSec * 1000;
      while (Date.now() < deadline) {
        if (await this.isUp(800)) {
          this.setStatus({ up: true, starting: false });
          return { up: true };
        }
        await sleep(400);
      }
      return { up: false, message: this.cfg.t?.("hub.serverTimeout", { url: this.cfg.url }) ?? `Waiting for the DSH server timed out (${this.cfg.url})` };
    }
    const started = await this.start();
    if (started.ok) {
      this.setStatus({ up: true, starting: false, startedByUs: true });
      return { up: true };
    }
    const detail = started.detail ?? "unknown";
    let msg = this.cfg.t?.("hub.startFailed", { detail }) ?? `Cannot start the DSH server: ${detail}`;
    // 0xC0000142 / spawn EPERM 是环境级进程创建拦截(如从 DSH 会话/受限终端启动 VS Code),给出针对性提示。
    // 判定基于启动器解析与 spawn 层失败信息,不包含进程日志尾部,避免把 npm 的 EACCES(缓存权限)误判为沙箱拦截。
    if (started.restricted) {
      const hint = this.cfg.t?.("hub.startRestrictedHint") ?? "Process creation appears to be blocked by the environment.";
      msg = `${msg} ${hint}`;
    }
    this.setStatus({ up: false, starting: false, message: msg });
    return { up: false, message: msg };
  }

  /** 启动服务器并轮询等待就绪。 */
  private async start(): Promise<{ ok: boolean; detail?: string; restricted?: boolean }> {
    const resolved = await this.resolveLauncher();
    if (!resolved.launcher) {
      const detail = resolved.detail ?? "no launcher found (dsh/npx/npm)";
      const restricted = /3221225794|EPERM|EACCES/.test(detail);
      this.log(`启动器解析失败: ${detail}`);
      return { ok: false, detail, restricted };
    }
    const launcher = resolved.launcher;
    this.log(`使用启动器: ${launcher.label}`);
    this.starting = true;
    this.setStatus({ starting: true, up: false });
    let childExited = false;
    let exitInfo = "";
    // 把子进程输出重定向到日志文件(不丢失 npx/dsh 的报错;也避免沙箱下的管道限制)
    const logFile = join(tmpdir(), "dsh-vscode-server.log");
    try {
      unlinkSync(logFile);
    } catch {
      // 首次运行没有旧日志,忽略
    }
    this.log(`启动日志: ${logFile}`);
    const fd = openSync(logFile, "a");
    try {
      if (launcher.kind === "direct") {
        // 首次安装(如已安装则秒过),随后 node 直接运行包入口,全程无 cmd shim
        if (!(await this.ensureDirectInstall(launcher, fd))) {
          closeSync(fd);
          this.starting = false;
          this.setStatus({ starting: false });
          return { ok: false, detail: `直接安装 @deepseek-ai/dsh 失败,详见日志 ${logFile}` };
        }
        const binJs = this.resolveDshBin(launcher);
        if (!binJs) {
          closeSync(fd);
          this.starting = false;
          this.setStatus({ starting: false });
          return { ok: false, detail: "无法解析 @deepseek-ai/dsh 的 bin 入口(包结构变化?)" };
        }
        this.child = spawn(launcher.node, [binJs, "web"], {
          shell: false,
          stdio: ["ignore", fd, fd],
          windowsHide: true,
          detached: process.platform !== "win32",
        });
        this.log(`直接启动: node ${binJs} web (pid=${this.child.pid ?? "?"})`);
      } else {
        this.child = spawn(`${shellCommand(launcher.command, ["web"])} > "${logFile}" 2>&1`, {
          shell: true,
          stdio: "ignore",
          windowsHide: true,
          // POSIX 下分离进程组,使服务器在扩展宿主重载后仍存活;Windows 子进程本就独立存活
          detached: process.platform !== "win32",
        });
        this.log(`已启动子进程 pid=${this.child.pid ?? "?"}(首次 npx 下载包可能较慢)`);
      }
      closeSync(fd);
      this.startedByUs = true;
      this.child.once("exit", (code, signal) => {
        exitInfo = `exit code=${code ?? "null"} signal=${signal ?? "none"}`;
        childExited = true;
        this.log(`子进程退出: ${exitInfo}`);
        this.child = undefined;
        this.startedByUs = false;
        this.setStatus({ up: false, startedByUs: false, starting: false });
      });
      this.child.once("error", (error) => {
        exitInfo = `spawn error: ${error.message}`;
        childExited = true;
        this.log(`子进程启动失败: ${exitInfo}`);
        this.child = undefined;
        this.startedByUs = false;
        this.setStatus({ up: false, startedByUs: false, starting: false });
      });
    } catch (error) {
      try {
        closeSync(fd);
      } catch {
        // fd 已关闭
      }
      this.starting = false;
      this.setStatus({ starting: false });
      const detail = `spawn 抛出异常: ${error instanceof Error ? error.message : String(error)}`;
      this.log(detail);
      return { ok: false, detail, restricted: /3221225794|EPERM|EACCES/.test(detail) };
    }

    const deadline = Date.now() + this.cfg.timeoutSec * 1000;
    while (Date.now() < deadline) {
      if (await this.isUp(800)) {
        this.log("服务器已就绪");
        return { ok: true };
      }
      // 子进程提前退出:不再傻等,立即失败并带上进程输出日志(如 npx 注册表报错 / 缺少凭证配置)
      if (childExited) {
        this.log(`子进程在就绪前退出(${exitInfo}),停止等待`);
        break;
      }
      await sleep(500);
    }
    this.starting = false;
    const logTail = this.readLogTail(logFile);
    const diagnostics =
      `cwd=${process.cwd()} | ComSpec=${process.env.ComSpec ?? process.env.comspec ?? "-"} | ` +
      `npm_config_cache=${process.env.npm_config_cache ?? "-"} | npm_config_prefix=${process.env.npm_config_prefix ?? "-"}`;
    const detail =
      this.cfg.t?.("hub.serverExited", { code: exitInfo || "no exit info", log: logTail, file: logFile, diag: diagnostics }) ??
      `The server process exited before becoming ready (${exitInfo}). Output log tail: ${logTail} (full log: ${logFile})`;
    this.setStatus({ starting: false, up: false, message: detail });
    return { ok: false, detail, restricted: /3221225794|EPERM|EACCES/.test(exitInfo) };
  }

  /** 读取启动日志尾部(报错通常出现在末尾);中文 Windows 下 cmd 输出为 GBK,自动识别解码。 */
  private readLogTail(file: string, maxChars = 1500): string {
    try {
      const buf = readFileSync(file);
      let text = buf.toString("utf8");
      if (text.includes("\uFFFD")) {
        // UTF-8 解码出现替换字符 → 大概率是 GBK(ANSI 代码页)输出
        try {
          text = new TextDecoder("gbk").decode(buf);
        } catch {
          text = buf.toString("latin1");
        }
      }
      const tail = text.length > maxChars ? `…${text.slice(text.length - maxChars)}` : text;
      const trimmed = tail.trim();
      return trimmed || "(日志为空)";
    } catch {
      return "(日志不可读)";
    }
  }

  /**
   * 找到可用的启动器,按可靠性排序:
   * 1. 用户配置的 dsh.command;
   * 2. 直接 node 方案(node.exe + npm-cli.js 安装包 + node 直跑包入口)—— 完全绕开 cmd shim,规避 npx/PATH 损坏环境;
   * 3. npx shim 回退;4. npm exec 回退(均含常见绝对路径)。
   */
  private async resolveLauncher(): Promise<{ launcher?: ResolvedLauncher; detail?: string }> {
    const failures: string[] = [];
    const configured = await this.canRun(this.cfg.command);
    if (configured.ok) {
      this.log(`启动器命中配置 dsh.command = ${this.cfg.command}`);
      return { launcher: { kind: "shell", command: this.cfg.command, label: `dsh.command=${this.cfg.command}` } };
    }
    failures.push(`${this.cfg.command}:${configured.detail}`);
    this.log(`dsh.command = ${this.cfg.command} 不可用(${configured.detail})`);

    const direct = await this.findDirectLauncher();
    if (direct) {
      this.log(`直接 node 启动器可用: ${direct.node}`);
      return { launcher: direct };
    }
    failures.push("direct-node: node.exe 或 npm-cli.js 不可用");

    this.log("尝试 npx 回退");
    for (const npx of this.npxCandidates()) {
      const r = await this.canRun(npx);
      if (r.ok) {
        this.log(`npx 可用: ${npx}`);
        return { launcher: { kind: "shell", command: `${npx} --yes @deepseek-ai/dsh@latest`, label: `npx ${npx}` } };
      }
      failures.push(`${npx}:${r.detail}`);
    }
    for (const npm of this.npmCandidates()) {
      const r = await this.canRun(npm);
      if (r.ok) {
        this.log(`npm 可用: ${npm}`);
        return { launcher: { kind: "shell", command: `${npm} exec --yes @deepseek-ai/dsh@latest`, label: `npm exec ${npm}` } };
      }
      failures.push(`${npm}:${r.detail}`);
    }
    return { detail: failures.join("; ") };
  }

  /** 直接 node 方案:定位 node.exe + 同目录的 npm-cli.js,安装目标为扩展自有目录。 */
  private async findDirectLauncher(): Promise<DirectLauncher | undefined> {
    for (const node of await this.nodeCandidates()) {
      const npmCli = join(dirname(node), "node_modules", "npm", "bin", "npm-cli.js");
      if (!existsSync(npmCli)) continue;
      return {
        kind: "direct",
        node,
        npmCli,
        installDir: join(process.env.USERPROFILE ?? homedir(), ".dsh-vscode", "server"),
        label: `node ${node}`,
      };
    }
    return undefined;
  }

  /** node.exe 候选:常见安装位置 + PATH(where)查询,过滤存在的。 */
  private async nodeCandidates(): Promise<string[]> {
    const seen = new Set<string>();
    const list: string[] = [];
    const push = (p: string) => {
      if (p && !seen.has(p)) {
        seen.add(p);
        list.push(p);
      }
    };
    const bases = [
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
      process.env.LOCALAPPDATA,
      process.env.APPDATA,
      process.env.USERPROFILE,
    ];
    for (const base of bases) {
      if (!base) continue;
      push(join(base, "nodejs", "node.exe"));
      push(join(base, "nvm4w", "nodejs", "node.exe"));
      push(join(base, "nvm", "current", "node.exe"));
      push(join(base, "scoop", "apps", "nodejs", "current", "node.exe"));
    }
    push("C:\\Program Files\\nodejs\\node.exe");
    push("C:\\Program Files (x86)\\nodejs\\node.exe");
    for (const line of await this.where("node")) push(line);
    return list.filter((p) => existsSync(p));
  }

  /** 用 where/which 在 PATH 中定位可执行文件(失败/受限环境返回空数组)。 */
  private where(command: string): Promise<string[]> {
    return new Promise((resolve) => {
      try {
        const child = spawn(process.platform === "win32" ? "where.exe" : "which", [command], {
          shell: false,
          stdio: ["ignore", "pipe", "ignore"],
          windowsHide: true,
        });
        let out = "";
        child.stdout?.on("data", (d: Buffer) => {
          out += d.toString("utf8");
        });
        child.once("error", () => resolve([]));
        child.once("exit", () => resolve(out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)));
      } catch {
        resolve([]);
      }
    });
  }

  /** 首次安装 @deepseek-ai/dsh 到扩展自有目录(用 npm-cli.js,不走任何 shim);已安装则秒过。force=true 时强制重装(升级)。 */
  private ensureDirectInstall(l: DirectLauncher, fd: number, force = false): Promise<boolean> {
    const pkgJson = join(l.installDir, "node_modules", "@deepseek-ai", "dsh", "package.json");
    if (!force && existsSync(pkgJson)) {
      this.log(`直接安装已存在: ${l.installDir}(跳过安装)`);
      return Promise.resolve(true);
    }
    mkdirSync(l.installDir, { recursive: true });
    this.log(`首次直接安装 @deepseek-ai/dsh@latest → ${l.installDir}(下载依赖,可能较慢)`);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (!settled) {
          settled = true;
          resolve(ok);
        }
      };
      let child: ChildProcess | undefined;
      const installTimeout = Math.max(this.cfg.timeoutSec, 180) * 1000;
      const timer = setTimeout(() => {
        this.log("直接安装超时,终止安装进程");
        try {
          child?.kill();
        } catch {
          // 进程已退出
        }
        finish(false);
      }, installTimeout);
      try {
        child = spawn(
          l.node,
          [l.npmCli, "install", "--prefix", l.installDir, "--no-fund", "--no-audit", "--no-update-notifier", "@deepseek-ai/dsh@latest"],
          { shell: false, stdio: ["ignore", fd, fd], windowsHide: true },
        );
        child.once("error", (error) => {
          this.log(`直接安装 spawn 错误: ${error.message}`);
          clearTimeout(timer);
          finish(false);
        });
        child.once("exit", (code) => {
          clearTimeout(timer);
          const ok = code === 0 && existsSync(pkgJson);
          this.log(`直接安装退出: code=${code ?? "null"} ok=${ok}`);
          finish(ok);
        });
      } catch (error) {
        clearTimeout(timer);
        this.log(`直接安装异常: ${error instanceof Error ? error.message : String(error)}`);
        finish(false);
      }
    });
  }

  /**
   * 升级扩展自有目录的直接安装(@deepseek-ai/dsh@latest 强制重装)。
   * 用于服务器版本落后(如旧 rc 缺少新功能:low 推理强度 / 新线协议)时手动升级;
   * 返回是否成功。调用方负责停服/重启编排。
   */
  async updateDirectInstall(): Promise<boolean> {
    const l = await this.findDirectLauncher();
    if (!l) return false;
    const logFile = join(tmpdir(), "dsh-vscode-server-install.log");
    try {
      unlinkSync(logFile);
    } catch {
      // 无旧日志,忽略
    }
    this.log(`升级直接安装 @deepseek-ai/dsh@latest → ${l.installDir}(日志 ${logFile})`);
    const fd = openSync(logFile, "a");
    try {
      return await this.ensureDirectInstall(l, fd, true);
    } finally {
      closeSync(fd);
    }
  }

  /** 从安装好的包解析 bin 入口(当前为 lib/bin.js;按 package.json 的 bin 字段动态解析)。 */
  private resolveDshBin(l: DirectLauncher): string | undefined {
    const pkgJsonPath = join(l.installDir, "node_modules", "@deepseek-ai", "dsh", "package.json");
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as { bin?: string | Record<string, string> };
      const bin = pkg?.bin;
      const rel = typeof bin === "string" ? bin : bin?.dsh;
      if (typeof rel !== "string") return undefined;
      const abs = join(dirname(pkgJsonPath), rel);
      return existsSync(abs) ? abs : undefined;
    } catch {
      return undefined;
    }
  }

  /** npx 候选命令:PATH 中的 npx + Windows 常见 node 安装位置(去重)。 */
  private npxCandidates(): string[] {
    const seen = new Set<string>();
    const candidates: string[] = [];
    const push = (c: string) => {
      if (c && !seen.has(c)) {
        seen.add(c);
        candidates.push(c);
      }
    };
    if (process.platform === "win32") {
      push("npx.cmd");
      push("npx");
      const bases = [
        process.env.ProgramFiles,
        process.env["ProgramFiles(x86)"],
        process.env.APPDATA ? join(process.env.APPDATA, "npm") : undefined,
        process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "npm") : undefined,
      ];
      for (const base of bases) {
        if (!base) continue;
        push(join(base, "nodejs", "npx.cmd"));
        push(join(base, "npx.cmd"));
      }
      push(join("C:\\Program Files", "nodejs", "npx.cmd"));
      push(join("C:\\Program Files (x86)", "nodejs", "npx.cmd"));
    } else {
      push("npx");
      push("/usr/local/bin/npx");
      push("/opt/homebrew/bin/npx");
    }
    return candidates;
  }

  /** npm 候选命令(与 npx 同位置;npm exec 可作为 npx 的替代)。 */
  private npmCandidates(): string[] {
    const seen = new Set<string>();
    const candidates: string[] = [];
    const push = (c: string) => {
      if (c && !seen.has(c)) {
        seen.add(c);
        candidates.push(c);
      }
    };
    if (process.platform === "win32") {
      push("npm.cmd");
      push("npm");
      const bases = [
        process.env.ProgramFiles,
        process.env["ProgramFiles(x86)"],
        process.env.APPDATA ? join(process.env.APPDATA, "npm") : undefined,
        process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "npm") : undefined,
      ];
      for (const base of bases) {
        if (!base) continue;
        push(join(base, "nodejs", "npm.cmd"));
        push(join(base, "npm.cmd"));
      }
      push(join("C:\\Program Files", "nodejs", "npm.cmd"));
      push(join("C:\\Program Files (x86)", "nodejs", "npm.cmd"));
    } else {
      push("npm");
      push("/usr/local/bin/npm");
      push("/opt/homebrew/bin/npm");
    }
    return candidates;
  }

  private log(message: string) {
    this.cfg.onLog?.(`[server] ${message}`);
  }

  private canRun(command: string): Promise<{ ok: boolean; detail: string }> {
    return new Promise((resolve) => {
      const args = ["--version"];
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve({ ok: false, detail: "timeout(15s)" });
        }
      }, 15_000);
      try {
        const child = spawn(shellCommand(command, args), { shell: true, stdio: "ignore", windowsHide: true });
        child.once("error", (error) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve({ ok: false, detail: `error ${error.message}` });
          }
        });
        child.once("exit", (code) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve({ ok: code === 0, detail: `exit ${code}` });
          }
        });
      } catch (error) {
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, detail: `throw ${error instanceof Error ? error.message : String(error)}` });
      }
    });
  }

  /** 停止由本扩展启动的服务器(杀进程树)。 */
  async stop(): Promise<{ ok: boolean; message?: string }> {
    if (!this.startedByUs || !this.child?.pid) {
      return { ok: false, message: this.cfg.t?.("hub.notStartedByUs") ?? "The current server was not started by this extension; stop it in the terminal that launched it." };
    }
    const pid = this.child.pid;
    try {
      if (process.platform === "win32") {
        await runDetached("taskkill", ["/pid", String(pid), "/T", "/F"]);
      } else {
        await runDetached("kill", ["-TERM", "-" + pid]);
        await sleep(500);
        await runDetached("kill", ["-KILL", "-" + pid]).catch(() => undefined);
      }
    } catch (error) {
      return { ok: false, message: this.cfg.t?.("hub.stopFailed", { error: error instanceof Error ? error.message : String(error) }) ?? `Stop failed: ${error instanceof Error ? error.message : String(error)}` };
    }
    this.startedByUs = false;
    this.child = undefined;
    this.setStatus({ up: false, startedByUs: false, starting: false });
    return { ok: true };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 拼接 shell 命令(Windows 下为带空格的可执行路径加引号,避免 cmd 截断)。 */
function shellCommand(file: string, args: string[]): string {
  const quote = (s: string) => (process.platform === "win32" && /\s/.test(s) && !/^".*"$/.test(s) ? `"${s}"` : s);
  return [file, ...args].map(quote).join(" ");
}

function runDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: "ignore", windowsHide: true });
    child.once("error", reject);
    child.once("exit", () => resolve());
  });
}
