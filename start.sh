#!/usr/bin/env bash
# Installs every dependency and starts the app. Safe to run again.
# Usage: ./start.sh            (PORT=8080 ./start.sh to use another port)
set -euo pipefail

cd "$(dirname "$0")"

REQUIRED_NODE_MAJOR=18
PORT="${PORT:-3000}"

fail() { echo "ERROR: $*" >&2; exit 1; }

# 1. Check required tools ------------------------------------------------------
echo "==> Checking required tools"
command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Install Node.js ${REQUIRED_NODE_MAJOR}+ from https://nodejs.org/ and run ./start.sh again."
command -v npm  >/dev/null 2>&1 || fail "npm is not installed. It ships with Node.js: https://nodejs.org/"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt "$REQUIRED_NODE_MAJOR" ]; then
  fail "Node.js ${REQUIRED_NODE_MAJOR}+ is required, but found $(node -v). Please upgrade: https://nodejs.org/"
fi
echo "    node $(node -v), npm $(npm -v)"

# 2. Install project dependencies ----------------------------------------------
echo "==> Installing dependencies"
if [ -f package-lock.json ]; then
  npm ci --no-fund --no-audit
else
  npm install --no-fund --no-audit
fi

# 3. First-run setup -----------------------------------------------------------
# Database migrations and seed data are added in Checkpoint 2; until then
# these are skipped because the npm scripts don't exist yet.
echo "==> Preparing app"
[ -f views/layout.pug ] || fail "views/layout.pug is missing - is this a complete clone of the repository?"
mkdir -p data
npm run --silent --if-present db:migrate
npm run --silent --if-present db:seed

# 4. Start the app -------------------------------------------------------------
echo "==> Starting app"
echo
echo "    Open http://localhost:${PORT}/ in your browser (Ctrl+C to stop)"
echo
export PORT
exec node server.js
