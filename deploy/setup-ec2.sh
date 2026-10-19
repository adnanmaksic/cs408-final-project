#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu EC2 server, run ON THE SERVER with sudo.
# Either copy just this folder up:
#   scp -i ~/keys/mykey.pem -r deploy ubuntu@<PUBLIC-IP>:~
#   ssh -i ~/keys/mykey.pem ubuntu@<PUBLIC-IP>
#   sudo bash deploy/setup-ec2.sh          (then run deploy/deploy.sh from your laptop)
# or run it from a clone of the repo, which also installs and starts the app:
#   sudo bash deploy/setup-ec2.sh
set -euo pipefail

APP_NAME=grade-tracker
APP_DIR="/opt/${APP_NAME}"
NODE_MAJOR=22
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
APP_USER="${SUDO_USER:-ubuntu}"
APT=(env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get -y)

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this with sudo: sudo bash deploy/setup-ec2.sh" >&2
  exit 1
fi

echo "==> Installing base packages"
"${APT[@]}" update
"${APT[@]}" install ca-certificates curl gnupg git sqlite3 build-essential nginx rsync openssl

echo "==> Installing Node.js ${NODE_MAJOR}"
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  "${APT[@]}" install nodejs
fi
echo "    node $(node -v), npm $(npm -v)"

echo "==> Creating app directory ${APP_DIR} (owned by ${APP_USER})"
mkdir -p "$APP_DIR"
chown "$APP_USER:$APP_USER" "$APP_DIR"

# Run from a clone of the repo: install the code and let configure.sh finish
# the job (.env, database, systemd, nginx), then stop here.
if [ -f "$REPO_DIR/package.json" ] && [ -f "$REPO_DIR/scripts/configure.sh" ]; then
  if [ "$REPO_DIR" != "$APP_DIR" ]; then
    echo "==> Copying app from ${REPO_DIR}"
    rsync -a --delete --exclude node_modules --exclude .git --exclude .env \
      --exclude data --exclude '*.pem' "$REPO_DIR/" "$APP_DIR/"
    chown -R "$APP_USER:$APP_USER" "$APP_DIR"
  fi
  sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && npm ci --omit=dev --no-fund --no-audit"
  exec sudo -u "$APP_USER" -H bash "$APP_DIR/scripts/configure.sh"
fi

# Only the deploy/ folder was copied up: install nginx and systemd now, and
# deploy/deploy.sh will send the code later.
if [ -f /etc/systemd/system/cs408-app.service ]; then
  echo "==> Removing old cs408-app service"
  systemctl disable --now cs408-app || true
  rm -f /etc/systemd/system/cs408-app.service /etc/sudoers.d/cs408-app \
    /etc/nginx/sites-enabled/cs408-app /etc/nginx/sites-available/cs408-app
fi

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
systemctl enable "$APP_NAME"

echo
echo "Setup complete. Now deploy from your laptop:"
echo "  ./deploy/deploy.sh -h <PUBLIC-IP> -i ~/keys/mykey.pem"
