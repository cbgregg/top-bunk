<#
.SYNOPSIS
  Uploads the Top Bunk depots to Steam with steamcmd (Windows).
.DESCRIPTION
  Needs steamcmd.exe on PATH (or $env:STEAMCMD), one interactive `steamcmd +login <account>` done on this
  machine so the Steam Guard code is cached (or $env:STEAM_PASSWORD for a non-interactive run), the YOUR_*
  placeholders in *.vdf replaced (see ..\STEAM.md), and the electron-builder "dir" outputs in ..\dist
  (npm run dist:win / dist:mac / dist:linux). The per-run fields are written into app_build.generated.vdf
  (git-ignored) next to app_build.vdf so relative paths keep working.
  macOS and Linux content uploaded from Windows loses its executable bits: upload those depots from
  macOS/Linux (upload.sh) or let the GitHub Actions "steam" job do it.
.PARAMETER Preview
  Dry run: steamcmd builds the depots locally into build\ and uploads nothing.
.PARAMETER SetLive
  Branch to set live afterwards (e.g. beta). "default" can only be set live on the Steamworks site.
.PARAMETER Desc
  Build description shown in Steamworks (default: "Top Bunk <version> (<git sha>)").
.EXAMPLE
  $env:STEAM_USERNAME = 'account'; .\upload.ps1 -Preview
.EXAMPLE
  .\upload.ps1 -SetLive beta -Desc 'Top Bunk 1.0.1 hotfix'
#>
param(
  [switch]$Preview,
  [string]$SetLive = '',
  [string]$Desc = ''
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$steamcmd = if ($env:STEAMCMD) { $env:STEAMCMD } else { 'steamcmd' }
if (-not (Get-Command $steamcmd -ErrorAction SilentlyContinue)) {
  throw 'steamcmd not found: install it (https://developer.valvesoftware.com/wiki/SteamCMD) or set $env:STEAMCMD to steamcmd.exe'
}
if (-not $env:STEAM_USERNAME) { throw 'set $env:STEAM_USERNAME to the Steamworks account that owns the app' }

$depots = @(Get-ChildItem 'depot_build_*.vdf')
$vdfs = @('app_build.vdf') + ($depots | ForEach-Object { $_.Name })
if (Select-String -Path $vdfs -Pattern '"YOUR_[A-Z_]+"' -Quiet) {   # quoted values only: comments may mention the placeholders
  throw 'app_build.vdf / depot_build_*.vdf still contain YOUR_* placeholders: fill in the App ID and depot IDs first (see ..\STEAM.md).'
}

$missing = $false
foreach ($f in $depots) {
  $m = Select-String -Path $f.FullName -Pattern '^\s*"ContentRoot"\s*"([^"]*)"' | Select-Object -First 1
  if ($m) {
    $root = $m.Matches[0].Groups[1].Value
    if (-not (Test-Path -PathType Container $root)) { Write-Host "missing $root (ContentRoot of $($f.Name)): run npm run dist:<os> first"; $missing = $true }
  }
}
if ($missing) { exit 1 }

if (-not $Desc) {
  $version = try { (Get-Content ..\package.json -Raw | ConvertFrom-Json).version } catch { 'unknown' }
  $sha = try { (& git -C .. rev-parse --short HEAD 2>$null) } catch { $null }
  if (-not $sha) { $sha = 'nogit' }
  $Desc = "Top Bunk $version ($sha)"
}
$previewFlag = if ($Preview) { '1' } else { '0' }

New-Item -ItemType Directory -Force -Path build | Out-Null
$script = Join-Path $PSScriptRoot 'app_build.generated.vdf'
$text = Get-Content app_build.vdf -Raw
$text = $text -replace '(?m)^(\s*"Desc"\s*)"[^"]*"', ('$1"' + $Desc.Replace('$', '$$') + '"')
$text = $text -replace '(?m)^(\s*"SetLive"\s*)"[^"]*"', ('$1"' + $SetLive.Replace('$', '$$') + '"')
$text = $text -replace '(?m)^(\s*"Preview"\s*)"[^"]*"', ('$1"' + $previewFlag + '"')
[System.IO.File]::WriteAllText($script, $text, (New-Object System.Text.UTF8Encoding $false))

$liveText = if ($SetLive) { $SetLive } else { 'no' }
Write-Host "uploading with $script (desc: $Desc; set live: $liveText; preview: $previewFlag)"
$login = @('+login', $env:STEAM_USERNAME)
if ($env:STEAM_PASSWORD) { $login += $env:STEAM_PASSWORD }
& $steamcmd @login +run_app_build $script +quit
exit $LASTEXITCODE
