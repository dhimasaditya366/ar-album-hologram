@echo off
set PATH=D:\program files\Node;%PATH%
cd /d "%~dp0"
echo Starting AR dev server...
npm run dev
pause
