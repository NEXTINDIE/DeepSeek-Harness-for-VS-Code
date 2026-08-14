# 复现扩展宿主的启动失败:从 VS Code 安装目录运行 npx(先 --version,再 web 带 10s 强杀)
$ErrorActionPreference = "Continue"
$log = Join-Path $env:TEMP "dsh-repro.log"
Push-Location "C:\Users\my\AppData\Local\Programs\Microsoft VS Code"
try {
  "== cwd: $(Get-Location) ==" | Out-File $log -Encoding utf8
  "== PATH: $env:PATH" | Out-File $log -Append -Encoding utf8
  cmd /c "npx.cmd --yes @deepseek-ai/dsh@latest --version > `"$env:TEMP\dsh-repro-ver.log`" 2>&1"
  "== --version exit=$LASTEXITCODE ==" | Out-File $log -Append -Encoding utf8
  Get-Content "$env:TEMP\dsh-repro-ver.log" | Out-File $log -Append -Encoding utf8

  $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npx.cmd --yes @deepseek-ai/dsh@latest web > `"$env:TEMP\dsh-repro-web.log`" 2>&1" -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 12
  if (-not $p.HasExited) {
    "== web: still running after 12s (npx chain OK) -> killing ==" | Out-File $log -Append -Encoding utf8
    Stop-Process -Id $p.Id -Force
  } else {
    "== web: exited early code=$($p.ExitCode) ==" | Out-File $log -Append -Encoding utf8
  }
  Get-Content "$env:TEMP\dsh-repro-web.log" -ErrorAction SilentlyContinue | Out-File $log -Append -Encoding utf8
} finally {
  Pop-Location
}
Get-Content $log
