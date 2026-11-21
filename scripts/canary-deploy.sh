#!/usr/bin/env bash
set -euo pipefail
# Canary deploy: upload new version, route 5% traffic, observe, then promote.
cd apps/api
source ~/.config/taslak/secrets.env
echo "Uploading new version..."
VERSION_ID=$(npx wrangler versions upload 2>&1 | grep -oE '[0-9a-f-]{36}' | head -1)
echo "Uploaded version: $VERSION_ID"
echo "Routing 5% traffic to new version for 5 minutes..."
npx wrangler versions deploy "$VERSION_ID@5%" --yes
echo "Sleeping 300s to observe..."
sleep 300
echo "Promoting to 100%..."
npx wrangler versions deploy "$VERSION_ID@100%" --yes
echo "Canary complete. Previous version can be rolled back with: wrangler rollback"
