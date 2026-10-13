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

echo
echo "Setup complete. Now deploy from your laptop:"
echo "  ./deploy/deploy.sh -h <PUBLIC-IP> -i ~/keys/mykey.pem"
