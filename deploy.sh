#!/bin/bash
# 667 公寓系統 — Bluehost 部署腳本（lftp 版）
#
# 前置需求：
#   - 安裝 lftp： brew install lftp
#   - 已依 deploy.local.sh.example 建立 deploy.local.sh（含 FTP 帳密與路徑）
#
# 用法：
#   ./deploy.sh           — 預覽 + 上傳有變動的檔案
#   ./deploy.sh --dry-run — 只列出會上傳哪些檔案，不實際執行
#
# 安全性說明：
#   - 此腳本只「上傳」（mirror --reverse），不會刪除遠端多出的檔案。
#   - 不會覆蓋 config.php（線上密碼設定）、uploads/（房客上傳的帳單附件）、
#     以及本機開發用文件（CLAUDE.md / DEPLOY-SOP.md / HANDOFF.md / error_log / files*）。
#   - 若要更新 config.php 或 schema.sql，請手動透過 cPanel File Manager / phpMyAdmin 處理，
#     避免誤蓋線上資料庫密碼或結構。

set -euo pipefail
cd "$(dirname "$0")"

LOCAL_CONF="deploy.local.sh"
if [ ! -f "$LOCAL_CONF" ]; then
    echo "找不到 $LOCAL_CONF。"
    echo "請先執行： cp deploy.local.sh.example deploy.local.sh"
    echo "然後填入 FTP 帳密與遠端路徑後再執行本腳本。"
    exit 1
fi

# shellcheck source=/dev/null
source "$LOCAL_CONF"

: "${FTP_HOST:?請在 deploy.local.sh 設定 FTP_HOST}"
: "${FTP_USER:?請在 deploy.local.sh 設定 FTP_USER}"
: "${FTP_PASS:?請在 deploy.local.sh 設定 FTP_PASS}"
: "${REMOTE_DIR:?請在 deploy.local.sh 設定 REMOTE_DIR}"

if ! command -v lftp >/dev/null 2>&1; then
    echo "找不到 lftp，請先執行： brew install lftp"
    exit 1
fi

DRYRUN=""
if [ "${1:-}" = "--dry-run" ]; then
    DRYRUN="--dry-run"
    echo "=== 預覽模式（不會實際上傳） ==="
fi

lftp -u "$FTP_USER","$FTP_PASS" "$FTP_HOST" <<EOF
set ftp:ssl-allow yes
set ssl:verify-certificate no
mirror --reverse --verbose $DRYRUN \
  --exclude-glob .git/ \
  --exclude-glob .git \
  --exclude-glob .claude/ \
  --exclude-glob .gitignore \
  --exclude-glob .DS_Store \
  --exclude-glob CLAUDE.md \
  --exclude-glob DEPLOY-SOP.md \
  --exclude-glob HANDOFF.md \
  --exclude-glob error_log \
  --exclude-glob files/ \
  --exclude-glob files.zip \
  --exclude-glob preview.html \
  --exclude-glob config.php \
  --exclude-glob schema.sql \
  --exclude-glob uploads/ \
  --exclude-glob deploy.sh \
  --exclude-glob "deploy.local.sh*" \
  . "$REMOTE_DIR"
bye
EOF

echo "完成。"
