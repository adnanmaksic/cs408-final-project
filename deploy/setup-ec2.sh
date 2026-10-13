#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu EC2 server. Run ON THE SERVER:
#   scp -i ~/keys/mykey.pem -r deploy ubuntu@<PUBLIC-IP>:~
#   ssh -i ~/keys/mykey.pem ubuntu@<PUBLIC-IP>
#   sudo bash deploy/setup-ec2.sh
set -euo pipefail

APP_NAME="cs408-app"
APP_DIR="/opt/${APP_NAME}"
NODE_MAJOR=22
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_USER="${SUDO_USER:-ubuntu}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this with sudo: sudo bash deploy/setup-ec2.sh" >&2
  exit 1
fi

echo "==> Installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg nginx rsync

echo "==> Installing Node.js ${NODE_MAJOR}"
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
echo "    node $(node -v), npm $(npm -v)"

echo "==> Creating app directory ${APP_DIR} (owned by ${APP_USER})"
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> Configuring nginx (port 80 -> 3000)"
cp "$SCRIPT_DIR/nginx-${APP_NAME}.conf" "/etc/nginx/sites-available/${APP_NAME}"
ln -sf "/etc/nginx/sites-available/${APP_NAME}" "/etc/nginx/sites-enabled/${APP_NAME}"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

echo "==> Installing systemd service"
sed "s/^User=.*/User=${APP_USER}/" "$SCRIPT_DIR/${APP_NAME}.service" > "/etc/systemd/system/${APP_NAME}.service"
systemctl daemon-reload
systemctl enable "${APP_NAME}"

# Let the deploy user restart the service without a password prompt.
echo "${APP_USER} ALL=(root) NOPASSWD: /usr/bin/systemctl restart ${APP_NAME}, /usr/bin/systemctl status ${APP_NAME}" \
  > "/etc/sudoers.d/${APP_NAME}"
chmod 440 "/etc/sudoers.d/${APP_NAME}"

# If this script was run from a full clone of the repo (not just the scp'd
# deploy/ folder), install the app from it and start it right away.
REPO_DIR="$(dirname "$SCRIPT_DIR")"
if [ -f "$REPO_DIR/package.json" ] && [ -f "$REPO_DIR/server.js" ]; then
  echo "==> Installing app from ${REPO_DIR}"
  rsync -a --delete --exclude node_modules --exclude .git --exclude .env --exclude '*.pem' \
    "$REPO_DIR/" "$APP_DIR/"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
  sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && npm ci --omit=dev --no-fund --no-audit"
  systemctl restart "${APP_NAME}"
  sleep 2
  if curl -fsS http://localhost/api/health >/dev/null; then
    echo
    echo "Setup complete. The app is running: http://$(curl -fsS http://checkip.amazonaws.com 2>/dev/null || echo '<PUBLIC-IP>')/"
  else
    echo "App did not respond. Check: sudo journalctl -u ${APP_NAME} -n 50" >&2
    exit 1
  fi
  exit 0
fi

echo
echo "Setup complete. Now deploy from your laptop:"
echo "  ./deploy/deploy.sh -h <PUBLIC-IP> -i ~/keys/mykey.pem"
