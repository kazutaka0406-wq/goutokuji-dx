Set-Location -Path "C:\goutokuji-dx"

Write-Host "=== 豪徳寺DXアプリ 本番リリース ===" -ForegroundColor Cyan
Write-Host "このスクリプトは main の変更を commit/push し、production ブランチへマージして本番Netlifyに反映します。" -ForegroundColor DarkGray
Write-Host ""

$currentBranch = git rev-parse --abbrev-ref HEAD
if ($currentBranch -ne "main") {
    Write-Host "現在のブランチが main ではありません（現在: $currentBranch）。" -ForegroundColor Red
    Write-Host "git checkout main を実行してから再度お試しください。" -ForegroundColor Red
    Read-Host "Enterで閉じる"
    exit 1
}

Write-Host "[1/5] main の変更を確認中..."
$changes = git status --porcelain
if ($changes) {
    Write-Host "変更点:"
    git status --short
    Write-Host ""
    $message = Read-Host "コミットメッセージを入力してください（空欄でEnterなら「更新」）"
    if (-not $message) { $message = "更新" }

    Write-Host "[2/5] コミット中..."
    git add -A
    git commit -m "$message"

    Write-Host "[3/5] GitHub（main）へ push（デバッグ用Netlifyが自動ビルドされます）..."
    git push origin main
} else {
    Write-Host "コミットする変更はありません。既存の main の内容で本番反映を行います。" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "[4/5] production ブランチへの反映を行います。" -ForegroundColor Yellow
Write-Host "これを実行すると商用サイト（本番Netlify）に反映されます。" -ForegroundColor Yellow
$confirm = Read-Host "本当に本番へ反映してよろしいですか？ (y/N)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "本番反映を中止しました。main への push のみ完了しています。" -ForegroundColor Yellow
    Read-Host "Enterで閉じる"
    exit 0
}

Write-Host "[5/5] production へマージして push します..."
git checkout production
if ($LASTEXITCODE -ne 0) {
    Write-Host "production ブランチへの切り替えに失敗しました。" -ForegroundColor Red
    Read-Host "Enterで閉じる"
    exit 1
}

git merge main
if ($LASTEXITCODE -ne 0) {
    Write-Host "マージに失敗しました（コンフリクトの可能性）。内容を確認し、解消後に手動で push してください。" -ForegroundColor Red
    Read-Host "Enterで閉じる"
    exit 1
}

git push origin production
git checkout main

Write-Host ""
Write-Host "本番反映のための push が完了しました。数分後に商用サイトへ反映されます。" -ForegroundColor Green
Write-Host "ビルド状況は Netlify ダッシュボード（app.netlify.com）の [Deploys] タブで確認してください。" -ForegroundColor Cyan
Read-Host "Enterで閉じる"

