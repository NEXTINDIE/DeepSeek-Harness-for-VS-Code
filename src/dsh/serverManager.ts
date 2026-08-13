import { spawn, type ChildProcess } from "node:child_process";

export interface ServerManagerConfig {
  url: string;
  command: string;
  autoStart: boolean;
  timeoutSec: number;
  /** 翻译函数;缺省时回退到英文。 */
  t?: (key: string, args?: Record<string, string | number>) => string;
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
    if (started) {
      this.setStatus({ up: true, starting: false, startedByUs: true });
      return { up: true };
    }
    const msg = this.cfg.t?.("hub.startFailed") ?? "Cannot start the DSH server: the dsh command was not found and the npx fallback failed.";
    this.setStatus({ up: false, starting: false, message: msg });
    return { up: false, message: msg };
  }

  /** 启动服务器并轮询等待就绪。 */
  private async start(): Promise<boolean> {
    const launcher = await this.resolveLauncher();
    if (!launcher) return false;
    this.starting = true;
    this.setStatus({ starting: true, up: false });
    try {
      this.child = spawn(launcher, ["web"], {
        shell: true,
        stdio: "ignore",
        windowsHide: true,
        detached: false,
      });
      this.startedByUs = true;
      this.child.once("exit", () => {
        this.child = undefined;
        this.startedByUs = false;
        this.setStatus({ up: false, startedByUs: false, starting: false });
      });
      this.child.once("error", () => {
        this.child = undefined;
        this.startedByUs = false;
        this.setStatus({ up: false, startedByUs: false, starting: false });
      });
    } catch {
      this.starting = false;
      this.setStatus({ starting: false });
      return false;
    }

    const deadline = Date.now() + this.cfg.timeoutSec * 1000;
    while (Date.now() < deadline) {
      if (await this.isUp(800)) return true;
      await sleep(500);
    }
    this.starting = false;
    this.setStatus({ starting: false, up: false, message: this.cfg.t?.("hub.serverNotReady", { secs: this.cfg.timeoutSec }) ?? `DSH server not ready within ${this.cfg.timeoutSec}s, it may have started on another port` });
    return false;
  }

  /** 找到可用的启动命令:dsh → npx 回退。 */
  private async resolveLauncher(): Promise<string | undefined> {
    if (await this.canRun(this.cfg.command)) return this.cfg.command;
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    if (await this.canRun(npx)) return `${npx} --yes @deepseek-ai/dsh@latest`;
    return undefined;
  }

  private canRun(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      const args = ["--version"];
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }, 15_000);
      try {
        const child = spawn(command, args, { shell: true, stdio: "ignore", windowsHide: true });
        child.once("error", () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(false);
          }
        });
        child.once("exit", (code) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(code === 0);
          }
        });
      } catch {
        settled = true;
        clearTimeout(timer);
        resolve(false);
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

function runDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: "ignore", windowsHide: true });
    child.once("error", reject);
    child.once("exit", () => resolve());
  });
}
