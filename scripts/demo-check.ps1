# Tu dong kiem tra cac dich vu co ban tren may local
$ErrorActionPreference = 'Continue'
$checks = @(
  @{ Name = 'Nginx + Inventory web'; Uri = 'http://localhost:8080/login'; Expected=200 },
  @{ Name = 'phpMyAdmin'; Uri = 'http://localhost:8081/'; Expected=200 },
  @{ Name = 'Prometheus'; Uri = 'http://localhost:9090/-/ready'; Expected=200 },
  @{ Name = 'Grafana'; Uri = 'http://localhost:3001/login'; Expected=200 }
)
foreach($c in $checks){
  try {
    $r = Invoke-WebRequest -Uri $c.Uri -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 10
    if ($r.StatusCode -eq $c.Expected){ Write-Host "[OK] $($c.Name): HTTP $($r.StatusCode)" -ForegroundColor Green }
    else { Write-Host "[WARN] $($c.Name): HTTP $($r.StatusCode)" -ForegroundColor Yellow }
  } catch { Write-Host "[FAIL] $($c.Name): $_" -ForegroundColor Red }
}
Write-Host "`nDocker services:" -ForegroundColor Cyan
docker compose ps
Write-Host "`nTra Prometheus: http://localhost:9090/targets"
Write-Host "Tra Grafana dashboard: http://localhost:3001"
