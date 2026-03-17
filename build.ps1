# build.ps1 - Run this in PowerShell to build your extension

$srcDir = "src"
$iconsDir = "icons"
$manifestsDir = "manifests"

function Create-ExtensionZip {
    param([string]$manifestName, [string]$zipName)
    
    Write-Host "Building $zipName..."
    
    # 1. Create a temporary staging folder
    $tempFolder = "temp_build"
    New-Item -ItemType Directory -Force -Path $tempFolder | Out-Null
    
    # 2. Copy all code files from the src folder into the temp folder
    if (Test-Path $srcDir) {
        Copy-Item -Path "$srcDir\*" -Destination $tempFolder -Recurse
    } else {
        Write-Warning "Source folder '$srcDir' not found!"
    }
    
    # 3. Copy the icons folder
    if (Test-Path $iconsDir) {
        Copy-Item -Path $iconsDir -Destination $tempFolder -Recurse
    }
    
    # 4. Copy the specific manifest and rename it to manifest.json at the root
    $manifestPath = "$manifestsDir\$manifestName"
    if (Test-Path $manifestPath) {
        Copy-Item -Path $manifestPath -Destination "$tempFolder\manifest.json"
    } else {
        Write-Warning "Manifest '$manifestPath' not found!"
    }
    
    # 5. Zip the contents of the temp folder
    if (Test-Path $zipName) { Remove-Item $zipName }
    Compress-Archive -Path "$tempFolder\*" -DestinationPath $zipName
    
    # 6. Clean up the temporary folder
    Remove-Item -Path $tempFolder -Recurse -Force
    
    Write-Host "Successfully created $zipName`n"
}

# Build both versions
Create-ExtensionZip -manifestName "chrome_manifest.json" -zipName "chrome.zip"
Create-ExtensionZip -manifestName "firefox_manifest.json" -zipName "firefox.zip"