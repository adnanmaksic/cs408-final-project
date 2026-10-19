#!/usr/bin/env bash
# Installs everything the app needs on a fresh Ubuntu 24.04 EC2 instance and
# clones the app into /opt/grade-tracker. Run as the ubuntu user (not with sudo):
#   curl -O https://raw.githubusercontent.com/adnanmaksic/cs408-final-project/main/scripts/setup.sh
#   bash setup.sh
# Then run: bash /opt/grade-tracker/scripts/configure.sh
# Safe to run again; it updates the existing clone instead of re-cloning.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/adnanmaksic/cs408-final-project.git}"
BRANCH="${BRANCH:-main}"
APP_DIR=/opt/grade-tracker
NODE_MAJOR=22
APT=(sudo env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get -y
     -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)

if [ "$(id -u)" -eq 0 ]; then
  echo "Run this as your normal user (ubuntu), not with sudo: bash setup.sh" >&2
  exit 1
fi

echo "==> Updating system packages"
"${APT[@]}" update
"${APT[@]}" upgrade
"${APT[@]}" install ca-certificates curl gnupg

echo "==> Installing Node.js ${NODE_MAJOR}"
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
fi
"${APT[@]}" install nodejs git sqlite3 build-essential nginx rsync openssl
echo "    node $(node -v), npm $(npm -v)"

echo "==> Getting the app into ${APP_DIR}"
sudo mkdir -p "$APP_DIR"
sudo chown "$(id -un):$(id -gn)" "$APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" init -q
  git -C "$APP_DIR" remote add origin "$REPO_URL"
fi
git -C "$APP_DIR" fetch -q --tags origin "$BRANCH"
git -C "$APP_DIR" checkout -q -f -B "$BRANCH" "origin/$BRANCH"
echo "    at commit $(git -C "$APP_DIR" log --oneline -1)"

echo "==> Installing npm packages"
cd "$APP_DIR"
npm ci --omit=dev --no-fund --no-audit

echo
echo "Setup complete. Next run: bash ${APP_DIR}/scripts/configure.sh"
