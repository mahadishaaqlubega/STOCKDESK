<#
.SYNOPSIS
  Run StockDesk locally against a private copy of the production data.

.DESCRIPTION
  1. Creates a local PostgreSQL cluster (first run only) in -DataDir.
  2. Starts it on -Port.
  3. Restores the newest backup from -BackupDir into database "stockdesk_local"
     (first run only, or when -Fresh is passed).
  4. Opens two windows: the backend (http://localhost:4000) and the frontend
     (http://localhost:5173).

  The backend is started with every database variable set explicitly, so the
  DATABASE_URL in backend/.env (production) is never used. dotenv does not
  override variables that are already set.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\dev-local.ps1
  powershell -ExecutionPolicy Bypass -File scripts\dev-local.ps1 -Fresh   # reload data from latest backup
  powershell -ExecutionPolicy Bypass -File scripts\dev-local.ps1 -Stop    # stop the local database
#>
param(
  [string]$PgBin = 'C:\Program Files\PostgreSQL\18\bin',
  [string]$DataDir = 'D:\STOCKDESK-devdb',
  [string]$BackupDir = 'D:\STOCKDESK-backups',
  [int]$Port = 55432,
  [string]$Database = 'stockdesk_local',
  [switch]$Fresh,
  [switch]$Stop,
  [switch]$NoApps
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$pgCtl = Join-Path $PgBin 'pg_ctl.exe'
$psql = Join-Path $PgBin 'psql.exe'

if (-not (Test-Path $pgCtl)) { throw "PostgreSQL tools not found in $PgBin. Pass -PgBin <path to bin>." }

if ($Stop) {
  & $pgCtl -D $DataDir stop -m fast
  return
}

# 1. Cluster
if (-not (Test-Path (Join-Path $DataDir 'PG_VERSION'))) {
  Write-Host "Creating local database cluster in $DataDir ..." -ForegroundColor Cyan
  & (Join-Path $PgBin 'initdb.exe') -D $DataDir -U postgres --auth=trust -E UTF8 | Out-Null
}

# 2. Start (if not already running)
& (Join-Path $PgBin 'pg_isready.exe') -h localhost -p $Port | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Starting PostgreSQL on port $Port ..." -ForegroundColor Cyan
  # Don't wait on pg_ctl: on Windows it stays attached to the server it spawns.
  Start-Process -FilePath $pgCtl -ArgumentList @('-D', "`"$DataDir`"", '-o', "`"-p $Port`"", '-l', "`"$DataDir\server.log`"", 'start') -WindowStyle Hidden
  for ($i = 0; $i -lt 60; $i++) {
    & (Join-Path $PgBin 'pg_isready.exe') -h localhost -p $Port | Out-Null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Milliseconds 500
  }
}

# 3. Data
$exists = & $psql -h localhost -p $Port -U postgres -At -c "select 1 from pg_database where datname='$Database'"
if ($Fresh -and $exists) {
  Write-Host "Dropping $Database (fresh restore requested) ..." -ForegroundColor Yellow
  & (Join-Path $PgBin 'dropdb.exe') -h localhost -p $Port -U postgres $Database
  $exists = $null
}
if (-not $exists) {
  $backup = Get-ChildItem $BackupDir -Filter '*.dump' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $backup) { throw "No .dump file found in $BackupDir" }
  Write-Host "Restoring $($backup.Name) into $Database ..." -ForegroundColor Cyan
  & (Join-Path $PgBin 'createdb.exe') -h localhost -p $Port -U postgres $Database
  & (Join-Path $PgBin 'pg_restore.exe') -h localhost -p $Port -U postgres -d $Database --no-owner --no-privileges $backup.FullName
}

if ($NoApps) {
  Write-Host "Database ready on localhost:$Port/$Database (apps not started)." -ForegroundColor Green
  return
}

# 4. Apps
$backendCmd = @"
`$env:DATABASE_URL=''; `$env:DATABASE_HOST='localhost'; `$env:DATABASE_PORT='$Port'; `$env:DATABASE_NAME='$Database';
`$env:DATABASE_USER='postgres'; `$env:DATABASE_PASSWORD=''; `$env:DATABASE_SSL='false';
`$env:PORT='4000'; `$env:JWT_SECRET='local-dev-secret'; `$env:NODE_ENV='development';
`$env:CORS_ORIGINS='http://localhost:5173'; `$env:FRONTEND_URL='http://localhost:5173';
`$env:EMAIL_PROVIDER=''; `$env:RESEND_API_KEY=''; `$env:SMTP_HOST='';
`$host.UI.RawUI.WindowTitle = 'StockDesk backend (LOCAL COPY)';
Set-Location '$repo\backend'; npm run dev
"@
$frontendCmd = @"
`$env:VITE_API_URL='http://localhost:4000/api'; `$env:VITE_PRINTER_API_URL='http://localhost:4000/api';
`$host.UI.RawUI.WindowTitle = 'StockDesk frontend';
Set-Location '$repo\frontend'; npm run dev
"@

Start-Process powershell -ArgumentList @('-NoExit', '-Command', $backendCmd)
Start-Process powershell -ArgumentList @('-NoExit', '-Command', $frontendCmd)

Write-Host ''
Write-Host 'StockDesk is starting on a LOCAL COPY of your data:' -ForegroundColor Green
Write-Host '  App:      http://localhost:5173'
Write-Host '  API:      http://localhost:4000/api'
Write-Host "  Database: localhost:$Port/$Database"
Write-Host 'Log in with any real shop account (same passwords as production).'
Write-Host 'Nothing you do here affects the live site.'
