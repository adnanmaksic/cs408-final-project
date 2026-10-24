#!/usr/bin/env bash
# Creates the .env file, prepares the database, and registers the app with
# systemd (starts on boot, restarts on crash) and nginx (port 80 -> 3000).
# Run after scripts/setup.sh, as the ubuntu user:
#   bash /opt/grade-tracker/scripts/configure.sh
# Safe to run again; an existing .env (and its session secret) is kept.
set -euo pipefail

APP_NAME=grade-tracker
APP_DIR=/opt/grade-tracker
APP_USER="$(id -un)"

if [ "$APP_USER" = root ]; then
  echo "Run this as your normal user (ubuntu), not with sudo." >&2
  exit 1
fi
[ -f "$APP_DIR/package.json" ] || { echo "No app in ${APP_DIR}. Run scripts/setup.sh first." >&2; exit 1; }
cd "$APP_DIR"

# 1. Environment variables
echo "==> Environment (.env)"
if [ -f .env ]; then
  echo "    keeping existing .env"
else
  cat > .env <<EOF
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
DB_PATH=$APP_DIR/data/grade-tracker.db
SESSION_SECRET=$(openssl rand -hex 32)
EOF
  chmod 600 .env
  echo "    created .env"
fi

# 2. Database: create or update the tables and add the demo account
echo "==> Database"
mkdir -p data
npm run db:migrate
npm run db:seed

# Remove the Hello World service from assignment 07.02, if it is still installed.
if [ -f /etc/systemd/system/cs408-app.service ]; then
  echo "==> Removing old cs408-app service"
  sudo systemctl disable --now cs408-app || true
  sudo rm -f /etc/systemd/system/cs408-app.service /etc/sudoers.d/cs408-app \
    /etc/nginx/sites-enabled/cs408-app /etc/nginx/sites-available/cs408-app
fi

# 3. systemd service
echo "==> systemd service"
sed "s/^User=.*/User=${APP_USER}/" "deploy/${APP_NAME}.service" \
  | sudo tee "/etc/systemd/system/${APP_NAME}.service" >/dev/null

# 4. nginx: forward port 80 to the app
echo "==> nginx"
sudo cp "deploy/nginx-${APP_NAME}.conf" "/etc/nginx/sites-available/${APP_NAME}"
sudo ln -sf "/etc/nginx/sites-available/${APP_NAME}" "/etc/nginx/sites-enabled/${APP_NAME}"
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t

sudo systemctl daemon-reload
sudo systemctl enable "$APP_NAME" nginx
sudo systemctl restart "$APP_NAME" nginx

echo "==> Checking the app"
for _ in $(seq 1 15); do
  if curl -fsS http://localhost/api/health >/dev/null 2>&1; then
    PUBLIC_IP="$(curl -fsS --max-time 5 http://checkip.amazonaws.com 2>/dev/null || echo '<PUBLIC-IP>')"
    echo
    echo "Done. Open http://${PUBLIC_IP}/"
    exit 0
  fi
  sleep 1
done
echo "The app did not respond. Check: sudo journalctl -u ${APP_NAME} -n 50" >&2
exit 1
