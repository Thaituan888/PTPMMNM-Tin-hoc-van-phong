param([Parameter(Mandatory=$true)][string]$Username)
$ErrorActionPreference = 'Stop'
$phpPath = Join-Path $env:LOCALAPPDATA 'THVP\php\php.exe'
$password = Read-Host 'New password (at least 12 characters)' -AsSecureString
$confirm = Read-Host 'Confirm password' -AsSecureString
$passwordPointer = [IntPtr]::Zero
$confirmPointer = [IntPtr]::Zero
try {
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
    $confirmPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirm)
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    if ($plainPassword -cne [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmPointer)) { throw 'Passwords do not match.' }
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    @{password=$plainPassword} | ConvertTo-Json -Compress | & $phpPath (Join-Path $PSScriptRoot 'lms-server\admin-accounts.php') set-password $Username
    if ($LASTEXITCODE -ne 0) {throw 'Password was not saved.'}
} finally {
    if ($passwordPointer -ne [IntPtr]::Zero) {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)}
    if ($confirmPointer -ne [IntPtr]::Zero) {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmPointer)}
    $plainPassword=$null
    $password.Dispose();$confirm.Dispose()
}
