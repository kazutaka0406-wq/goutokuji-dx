@echo off
title Goutokuji DX - Mobile Check Launcher

echo ===============================================
echo  Goutokuji DX App - Mobile Check Launcher
echo ===============================================
echo.

cd /d C:\goutokuji-dx

echo [1/3] Starting app (netlify dev)...
start "goutokuji-dx-dev" cmd /k "cd /d C:\goutokuji-dx && netlify dev"

echo [2/3] Waiting for app to start (15 sec)...
timeout /t 15 /nobreak > nul

echo [3/3] Starting ngrok tunnel...
start "ngrok" cmd /k ""%APPDATA%\npm\node_modules\ngrok\bin\ngrok.exe" http 8888"

timeout /t 3 /nobreak > nul
start http://127.0.0.1:4040
timeout /t 1 /nobreak > nul
start https://qr.io

echo.
echo -----------------------------------------------
echo  Open the "https://xxxx.ngrok-free.app" URL shown
echo  at http://127.0.0.1:4040 on your smartphone.
echo  (Paste it into qr.io if you want a QR code.)
echo.
echo  To stop, close both of the windows that opened.
echo -----------------------------------------------
echo.
pause
