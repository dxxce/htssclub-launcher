$ErrorActionPreference = 'Stop'
$candidates = @(
  'http://localhost:3366/api/docs-json',
  'http://localhost:3366/api-json',
  'http://localhost:3366/api/docs-json/',
  'http://localhost:3366/docs-json'
)
foreach ($u in $candidates) {
  try {
    $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 8
    $r.Content | Out-File -FilePath scratch\swagger.json -Encoding utf8
    Write-Output ("OK " + $u + " len=" + $r.Content.Length)
    exit 0
  } catch {
    Write-Output ("FAIL " + $u + " :: " + $_.Exception.Message)
  }
}
