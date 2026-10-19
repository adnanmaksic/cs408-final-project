#!/usr/bin/env bash
# Copies the code to the server and restarts it. Run FROM YOUR LAPTOP:
#   ./deploy/deploy.sh -h <PUBLIC-IP> -i ~/keys/mykey.pem [-u ubuntu]
set -euo pipefail

APP_NAME="grade-tracker"
APP_DIR="/opt/${APP_NAME}"
HOST=""
KEY=""
SSH_USER="ubuntu"

usage() { echo "Usage: $0 -h <PUBLIC-IP> -i <path/to/key.pem> [-u <user>]" >&2; exit 1; }

while getopts "h:i:u:" opt; do
  case "$opt" in
    h) HOST="$OPTARG" ;;
    i) KEY="$OPTARG" ;;
    u) SSH_USER="$OPTARG" ;;
    *) usage ;;
  esac
done
[ -n "$HOST" ] && [ -n "$KEY" ] || usage
[ -f "$KEY" ] || { echo "Key file not found: $KEY" >&2; exit 1; }

cd "$(dirname "$0")/.."
SSH_OPTS=(-i "$KEY" -o StrictHostKeyChecking=accept-new)
REMOTE="${SSH_USER}@${HOST}"

echo "==> Running tests"
npm test

echo "==> Copying code to ${REMOTE}:${APP_DIR}"
if command -v rsync >/dev/null 2>&1; then
  rsync -az --delete \
    --exclude node_modules --exclude .git --exclude .env --exclude data --exclude '*.pem' \
    -e "ssh -i \"$KEY\" -o StrictHostKeyChecking=accept-new" \
    ./ "${REMOTE}:${APP_DIR}/"
else
  # rsync isn't available (e.g. Git Bash on Windows): stream a tarball instead.
  echo "    (rsync not found, using tar over ssh)"
  tar -czf - \
    --exclude=./node_modules --exclude=./.git --exclude=./.env --exclude=./data --exclude='*.pem' . \
    | ssh "${SSH_OPTS[@]}" "$REMOTE" \
      "find ${APP_DIR} -mindepth 1 -maxdepth 1 ! -name node_modules ! -name .git ! -name .env ! -name data -exec rm -rf {} + && tar -xzf - -C ${APP_DIR}"
fi

echo "==> Installing dependencies and restarting ${APP_NAME}"
ssh "${SSH_OPTS[@]}" "$REMOTE" \
  "cd ${APP_DIR} && npm ci --omit=dev --no-fund --no-audit && sudo systemctl restart ${APP_NAME}"

echo "==> Checking http://${HOST}/api/health"
for _ in $(seq 1 10); do
  if curl -fsS "http://${HOST}/api/health" >/dev/null 2>&1; then
    echo "Deploy succeeded: http://${HOST}/"
    exit 0
  fi
  sleep 2
done
echo "Health check failed: http://${HOST}/api/health did not return 200." >&2
echo "Check the logs with: ssh -i $KEY $REMOTE 'sudo journalctl -u ${APP_NAME} -n 50'" >&2
exit 1
