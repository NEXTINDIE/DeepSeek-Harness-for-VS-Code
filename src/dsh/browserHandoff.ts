import * as vscode from "vscode";

/** 日志中隐藏启动 token(URL 其余部分照常输出,便于排查)。 */
export function redactToken(url: string): string {
  return url.replace(/([?&]token=)[^&]+/, "$1<redacted>");
}

/**
 * 把 DSH Web 的地址交给当前客户端打开(浏览器 / 桌面 VS Code)。
 *
 * 不能直接把回环地址交给 `vscode.env.openExternal`:客户端(尤其是浏览器客户端)到不了宿主机的
 * `127.0.0.1`。为了让这种地址可达,VS Code 会在宿主机上临时把该端口对外发布 —— 内置扩展
 * `vscode.tunnel-forwarding`(Local Tunnel Port Forwarding)为此执行
 * `code tunnel forward-internal --provider github`,而它与用户自己正在运行的 `code tunnel`
 * 共用同一个 CLI 数据目录(`~/.vscode/cli`)和单例:单例被接管时 CLI 会打印
 * "Shutting down: RPC client requested a tunnel restart",正在使用的隧道随即断开/重启
 * —— 外部表现就是"启用扩展后隧道会突然中断"。
 *
 * `vscode.env.asExternalUri` 让 VS Code 按当前客户端解析该地址(桌面/远程窗口交给客户端做本地
 * 端口转发,code-server 等宿主交给宿主自身的代理),不再隐式发布端口,也就不再触碰 CLI 单例。
 */
export async function resolveClientUrl(url: string, log?: (message: string) => void): Promise<string> {
  try {
    const resolved = await vscode.env.asExternalUri(vscode.Uri.parse(url));
    const text = resolved.toString(true);
    const unchanged = text === url;
    log?.(
      `[browser] client URL ${redactToken(text)}` +
        (unchanged
          ? " · 未被改写(若客户端无法访问回环地址,请改用宿主自身的端口代理,例如 code-server 的 /proxy/<port>/)"
          : ""),
    );
    return text;
  } catch (error) {
    log?.(`[browser] asExternalUri 失败: ${String(error)} · 回退 ${redactToken(url)}`);
    return url;
  }
}

/** 解析后再打开:命令面板与 webview 共用同一条交接路径。 */
export async function openExternalUrl(url: string, log?: (message: string) => void): Promise<void> {
  await vscode.env.openExternal(vscode.Uri.parse(await resolveClientUrl(url, log)));
}
