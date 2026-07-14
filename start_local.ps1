Set-Location -Path "C:\goutokuji-dx"

Write-Host "=== 豪徳寺DXアプリ ローカル起動 ===" -ForegroundColor Cyan

Write-Host "[1/2] git pull..."
git pull origin main

Write-Host "[2/2] netlify dev を起動します..."
Write-Host "    ブラウザは http://localhost:8888 を使ってください" -ForegroundColor Cyan
Write-Host "    （/.netlify/functions/config を呼び出すため netlify dev で起動しています）" -ForegroundColor DarkGray
Write-Host "    （netlify dev が自動でブラウザを開きます）" -ForegroundColor DarkGray

netlify dev

Write-Host "サーバーを終了しました。"
Read-Host "Enterで閉じる"

