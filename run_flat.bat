@echo off
title CinemaPro - Flat Deployment Tester (Zero Subfolders)
cd /d "%~dp0"
echo =======================================================================
echo   CinemaPro - Testing Flat Deployment (Zero Subfolders)
echo   Customer Portal : http://127.0.0.1:5000/customer/dashboard
echo   Admin Dashboard : http://127.0.0.1:5000/
echo =======================================================================
where python >nul 2>nul
if %errorlevel% equ 0 (
    python app.py
) else (
    py app.py
)
pause
