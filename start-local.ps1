param([int]$Port = 8080, [string]$HostAddress = '127.0.0.1', [string]$MailConfigPath = '')
$ErrorActionPreference = 'Stop'
$phpPath = Join-Path $env:LOCALAPPDATA 'THVP\php\php.exe'
if (-not (Test-Path -LiteralPath $phpPath)) { throw 'Không tìm thấy PHP tại %LOCALAPPDATA%\THVP\php\php.exe.' }
$phpIniPath = Join-Path (Split-Path -Parent $phpPath) 'php.ini'
if (-not (Test-Path -LiteralPath $phpIniPath -PathType Leaf)) { throw 'Không tìm thấy php.ini cạnh PHP cục bộ.' }
if ($MailConfigPath) { $env:THVP_LMS_MAIL_CONFIG = $MailConfigPath }
$phpOptions = @('-c', $phpIniPath, '-d', 'display_errors=0')
if ((& $phpPath @phpOptions -r "echo extension_loaded('gd') ? 'yes' : 'no';") -ne 'yes') {
    $phpOptions += @('-d', 'extension=gd')
}
Write-Host "Mở http://${HostAddress}:$Port/khoa-hoc-lms.html"
Write-Host "Thư mục web: $PSScriptRoot"
Write-Host "PHP: $phpPath"
Write-Host "php.ini: $phpIniPath"
& $phpPath @phpOptions (Join-Path $PSScriptRoot 'lms-server\check-payment-config.php')
& $phpPath @phpOptions (Join-Path $PSScriptRoot 'lms-server\check-evidence.php')
& $phpPath @phpOptions (Join-Path $PSScriptRoot 'lms-server\check-mail-config.php')
Write-Host 'SQLite LMS nằm ngoài thư mục web; API MySQL hosting không được kết nối.'
& $phpPath @phpOptions -S "${HostAddress}:$Port" -t $PSScriptRoot (Join-Path $PSScriptRoot 'router.php')
