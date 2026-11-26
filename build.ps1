param([string] $Sdk, [string] $Destination = (Join-Path $PSScriptRoot 'dist'))
$ErrorActionPreference = 'Stop'
$stage = Join-Path $PSScriptRoot '.build'
$app = Join-Path $stage 'app'
New-Item -ItemType Directory -Force $app,$Destination | Out-Null
if (!$Sdk) {
    $Sdk = Join-Path $stage 'sdk'
    if (!(Test-Path "$Sdk/lib/net462")) {
        $url = 'https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.3650.58/microsoft.web.webview2.1.0.3650.58.nupkg'
        Invoke-WebRequest -UseBasicParsing $url -OutFile "$stage/sdk.zip"
        Expand-Archive "$stage/sdk.zip" $Sdk -Force
    }
}
$cs = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
Copy-Item "$PSScriptRoot/ui","$PSScriptRoot/notices" $app -Recurse -Force
Copy-Item "$Sdk/lib/net462/Microsoft.Web.WebView2.Core.dll","$Sdk/lib/net462/Microsoft.Web.WebView2.WinForms.dll","$Sdk/build/native/x64/WebView2Loader.dll" $app -Force
$flags = @('/nologo','/platform:x64','/optimize+','/target:winexe',"/win32icon:$PSScriptRoot\native\fader.ico","/win32manifest:$PSScriptRoot\native\app.manifest")
& $cs @flags '/r:System.Net.Http.dll' '/r:System.Web.Extensions.dll' '/r:System.Security.dll' "/out:$app\Fader.Player.exe" "/r:$app\Microsoft.Web.WebView2.Core.dll" "/r:$app\Microsoft.Web.WebView2.WinForms.dll" "$PSScriptRoot\native\Player.cs" "$PSScriptRoot\native\TrayMenu.cs" "$PSScriptRoot\native\Catalogs.cs"
if ($LASTEXITCODE) { throw 'Player build failed.' }
Copy-Item "$PSScriptRoot/native/yt-dlp.exe","$PSScriptRoot/native/read-catalog.cjs" $app -Force
$payload = 'yt-dlp.exe','read-catalog.cjs','Fader.Player.exe','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','ui','notices' | ForEach-Object { Join-Path $app $_ }
Compress-Archive -LiteralPath $payload -DestinationPath "$stage\content.zip" -Force
& $cs @flags "/out:$Destination\Fader.exe" "/resource:$stage\content.zip,Fader.zip" '/r:System.IO.Compression.dll' '/r:System.IO.Compression.FileSystem.dll' "$PSScriptRoot\native\Launcher.cs"
if ($LASTEXITCODE) { throw 'Launcher build failed.' }
