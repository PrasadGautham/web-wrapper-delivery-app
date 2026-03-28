$envFile = Join-Path $PSScriptRoot '.env.local-postgres'
if (!(Test-Path $envFile)) {
  throw "Create backend/.env.local-postgres from backend/.env.local-postgres.example and set your real DATABASE_URL first."
}

Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith('#')) {
    return
  }
  $separatorIndex = $line.IndexOf('=')
  if ($separatorIndex -lt 1) {
    return
  }
  $key = $line.Substring(0, $separatorIndex).Trim()
  $value = $line.Substring($separatorIndex + 1).Trim().Trim('"').Trim("'")
  Set-Item -Path "Env:$key" -Value $value
}

Set-Location $PSScriptRoot
npm run seed:postgres
