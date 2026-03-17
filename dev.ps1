# dev.ps1 - Assembles unpacked folders for live testing

$srcDir = "src"
$iconsDir = "icons"
$manifestsDir = "manifests"
$distDir = "dist"

function Create-DevFolder {
    param([string]$manifestName, [string]$folderName)
    
    $targetPath = "$distDir\$folderName"
    Write-Host "Setting up test folder: $targetPath..."
    
    # 1. Create a clean target folder
    if (Test-Path $targetPath) { Remove-Item -Path $targetPath -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $targetPath | Out-Null
    
    # 2. Copy the source code and icons
    if (Test-Path $srcDir) { Copy-Item -Path "$srcDir\*" -Destination $targetPath -Recurse }
    if (Test-Path $iconsDir) { Copy-Item -Path $iconsDir -Destination $targetPath -Recurse }
    
    # 3. Copy the specific manifest and rename it to manifest.json
    $manifestPath = "$manifestsDir\$manifestName"
    if (Test-Path $manifestPath) {
        Copy-Item -Path $manifestPath -Destination "$targetPath\manifest.json"
    }
}

# Generate the test folders
Create-DevFolder -manifestName "chrome_manifest.json" -folderName "chrome_test"
Create-DevFolder -manifestName "firefox_manifest.json" -folderName "firefox_test"

Write-Host "`nDone! You can now load 'dist\chrome_test' or 'dist\firefox_test' into your browser."