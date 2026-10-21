# Run in PowerShell: powershell -ExecutionPolicy Bypass -File .\scripts\setup-env.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root '.env'
$source = Join-Path $root '.env.example'
if (Test-Path $target) {
  Write-Host 'Tep .env da ton tai. Khong ghi de mat khau hien co.' -ForegroundColor Yellow
  exit 0
}
function New-StrongSecret {
  $bytes = [byte[]]::new(24)
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return (-join ($bytes | ForEach-Object { $_.ToString('x2') }))
}
$content = [System.IO.File]::ReadAllText($source)
$names = @('ROOT','APP','EXPORTER','ADMIN','GRAFANA')
foreach ($name in $names) {
  $placeholder = 'REPLACE_WITH_RANDOM_' + $name + '_32CHAR'
  $content = $content.Replace($placeholder, (New-StrongSecret))
}
[System.IO.File]::WriteAllText($target, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host 'Da tao .env bang 5 mat khau ngau nhien (48 ky tu hex).' -ForegroundColor Green
Write-Host 'MO .env bang VS Code de doc ADMIN_USERNAME va ADMIN_PASSWORD.'
Write-Host 'KHONG commit hoac chup anh mat khau trong .env.' -ForegroundColor Yellow
