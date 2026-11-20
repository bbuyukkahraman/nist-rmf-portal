#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-https://nist-rmf-portal.axoss.workers.dev}"

echo "Health check..."
curl -sf "$BASE/api/health" | grep -q '"status":"ok"' && echo "  health OK" || { echo "  health FAIL"; exit 1; }

echo "Register + login flow..."
EMAIL="smoke-$(date +%s)@test.com"
REG=$(curl -sf -X POST "$BASE/api/auth/register-tenant" -H 'Content-Type: application/json' -H 'User-Agent: curl/8.0' \
  -d "{\"tenantName\":\"SmokeTenant\",\"adminEmail\":\"$EMAIL\",\"adminName\":\"Smoke\",\"adminPassword\":\"Smoke123!\"}")
TOKEN=$(echo "$REG" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
echo "  registered + token ok"

echo "Create system + baseline..."
SYS=$(curl -sf -X POST "$BASE/api/systems" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"Smoke System"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -sf -X POST "$BASE/api/systems/$SYS/baseline" -H "Authorization: Bearer $TOKEN" >/dev/null
CTRLS=$(curl -sf "$BASE/api/systems/$SYS/controls" -H "Authorization: Bearer $TOKEN" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["items"]))')
[ "$CTRLS" -gt 0 ] && echo "  baseline OK ($CTRLS controls)" || { echo "  baseline FAIL"; exit 1; }

echo "Dashboard..."
curl -sf "$BASE/api/dashboard" -H "Authorization: Bearer $TOKEN" | grep -q '"systems"' && echo "  dashboard OK" || { echo "  dashboard FAIL"; exit 1; }

echo "All smoke tests passed."
