# package.ps1 - creates a zip archive of the project folder
$dest = Join-Path (Get-Location) 'FluxRunner.zip'
if (Test-Path $dest) { Remove-Item $dest }
Compress-Archive -Path (Join-Path (Get-Location) '*') -DestinationPath $dest -Force
Write-Output "Created $dest"