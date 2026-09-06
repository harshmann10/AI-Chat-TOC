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

    # 2b. PROD ONLY: drop the dev test harness (kept in repo for dev.ps1 runs)
    if (Test-Path "$tempFolder\test") {
        Remove-Item -Path "$tempFolder\test" -Recurse -Force
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

    # 4b. PROD ONLY: remove dev test-harness entries from the staged manifest
    # (repo manifests keep them so dev.ps1 folders still load the harness)
    $stagedManifest = "$tempFolder\manifest.json"
    if (Test-Path $stagedManifest) {
        $manifestJson = Get-Content $stagedManifest -Raw | ConvertFrom-Json
        foreach ($cs in $manifestJson.content_scripts) {
            $cs.js = @($cs.js | Where-Object { $_ -notlike 'test/*' })
        }
        $manifestJson | ConvertTo-Json -Depth 10 | Set-Content $stagedManifest -Encoding UTF8
    }

    # 4c. PROD ONLY: strip verbose console.log / console.debug lines from staged JS.
    # Keeps console.warn / console.error for real failure reports.
    # Only full-line statements are removed; a few inline debugs in catch
    # blocks (store.js, virtual.js, main.js) intentionally survive.
    Get-ChildItem -Path $tempFolder -Filter *.js -Recurse | ForEach-Object {
        $text = [System.IO.File]::ReadAllText($_.FullName)
        $lines = $text -split "`r?`n"
        $kept = $lines | Where-Object { $_ -notmatch '^\s*console\.(log|debug)\s*\(' }
        if ($kept.Count -ne $lines.Count) {
            [System.IO.File]::WriteAllText($_.FullName, ($kept -join "`n"))
        }
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