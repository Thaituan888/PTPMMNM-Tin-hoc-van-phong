@echo off
chcp 65001 >nul
title KHOI DONG HE THONG TIN HOC VAN PHONG (PORT 8080)

echo ======================================================================
echo   DANG CHUYEN SERVER LOCALHOST SANG THU MUC HIEN TAI:
echo   %~dp0
echo   Cong: 8080
echo ======================================================================
echo.

powershell -ExecutionPolicy Bypass -NoProfile -Command ^
  "$conn = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue; if ($conn) { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500; }; & '.\start-local.ps1' -Port 8080"

pause
