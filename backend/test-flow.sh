#!/bin/bash
# Self-verification test — run against a local server
# Requires: DATABASE_URL set, PostgreSQL running, server started

API="http://localhost:4000"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local expected="$2"
  local actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    echo "  PASS: $desc"
    ((PASS++))
  else
    echo "  FAIL: $desc (expected '$expected' in '$actual')"
    ((FAIL++))
  fi
}

echo "=== InstaGrowth Self-Verification ==="

# 1. Health
echo "[Health]"
R=$(curl -sf "$API/health" 2>/dev/null)
check "health endpoint" "ok" "$R"

# 2. Auth
echo "[Auth]"
R=$(curl -sf -X POST "$API/auth/instagram" -H 'Content-Type: application/json' -d '{"code":"bad"}' 2>/dev/null)
check "auth rejects bad code" "Token exchange failed" "$R"

# 3. Auth without code
R=$(curl -sf -X POST "$API/auth/instagram" -H 'Content-Type: application/json' -d '{}' 2>/dev/null)
check "auth requires code" "Authorization code required" "$R"

# 4. Protected routes require auth
R=$(curl -sf "$API/users/me" 2>/dev/null)
check "me requires auth" "Authorization header required" "$R"

R=$(curl -sf "$API/tasks" 2>/dev/null)
check "tasks requires auth" "Authorization header required" "$R"

R=$(curl -sf "$API/transactions" 2>/dev/null)
check "transactions requires auth" "Authorization header required" "$R"

R=$(curl -sf "$API/admin/status" 2>/dev/null)
check "admin requires auth" "Authorization header required" "$R"

# 5. 404
R=$(curl -sf "$API/nonexistent" 2>/dev/null)
check "unknown route returns 404" "Route not found" "$R"

# 6. Config values
echo "[Config]"
node -e "const c=require('./src/config'); console.log('follow reward:', c.INSTA_REWARDS.follow); console.log('like cost:', c.INSTA_SLOT_COSTS.like); console.log('tiers:', Object.keys(c.TIER).length);" 2>/dev/null

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
