# Assignment & Grade Tracker

A full-stack web app that helps college students plan their assignments and track their grades: what's due this week, a live weighted grade for every course, and a "what do I need?" calculator.

Built with Node.js, Express, Pug and Bootstrap 5 (SQLite arrives in Checkpoint 2), and deployed on AWS EC2 behind nginx.

## 1. Install first

- [Node.js](https://nodejs.org/) **18 or newer** (22 LTS recommended; includes npm)
- Git and a bash shell (Linux/macOS terminal, or Git Bash on Windows)

## 2. Run locally

```bash
git clone https://github.com/adnanmaksic/cs408-final-project.git
cd cs408-final-project
./start.sh
```

Then open <http://localhost:3000/>. Use `PORT=8080 ./start.sh` for a different port. Run the tests with `npm test`.

## 3. Deploy to EC2 (Ubuntu 24.04)

1. Launch an Ubuntu 24.04 LTS instance (t2.micro or t3.micro). In its security group allow SSH (22) from your IP and HTTP (80) from anywhere.
2. Connect: `ssh -i ~/keys/mykey.pem ubuntu@<PUBLIC-IP>`
3. Install packages and clone the app into `/opt/grade-tracker`:

   ```bash
   curl -O https://raw.githubusercontent.com/adnanmaksic/cs408-final-project/main/scripts/setup.sh
   bash setup.sh
   ```

4. Create `.env`, set up the database, and register the app with systemd and nginx:

   ```bash
   bash /opt/grade-tracker/scripts/configure.sh
   ```

5. Open `http://<PUBLIC-IP>/`. Check that it survives a reboot: `sudo reboot`, wait a minute, reload the page.
   Troubleshooting: `systemctl status grade-tracker` and `journalctl -u grade-tracker`.

### Updating the server

On the server:

```bash
cd /opt/grade-tracker && git pull && npm ci --omit=dev && sudo systemctl restart grade-tracker
```

Or from your laptop (runs the tests, copies the code, restarts and checks `/api/health`):

```bash
./deploy/deploy.sh -h <PUBLIC-IP> -i ~/keys/mykey.pem
```

`deploy/setup-ec2.sh` is an alternative to steps 3–4: run `sudo bash deploy/setup-ec2.sh` from a clone of the repo, or from just the `deploy/` folder copied up with `scp` (then use `deploy.sh` to send the code).

## Project layout

| Path | Purpose |
| --- | --- |
| `app.js`, `server.js` | Express app and the entry point that starts it |
| `routes/pages.js` | Landing, About, and placeholders for pages planned in later checkpoints |
| `views/layout.pug` | Shared layout: Bootstrap navbar and footer used by every page |
| `views/*.pug` | Page templates |
| `public/` | CSS and favicon |
| `tests/` | Jest + Supertest tests |
| `start.sh` | Checks tools, installs dependencies, starts the app |
| `scripts/setup.sh` | Installs packages on a fresh EC2 instance and clones the app |
| `scripts/configure.sh` | Creates `.env`, database, systemd service and nginx config |
| `deploy/setup-ec2.sh` | One-step server setup (alternative to the two scripts above) |
| `deploy/grade-tracker.service` | systemd unit: starts the app on boot, restarts it if it crashes |
| `deploy/nginx-grade-tracker.conf` | nginx site: forwards port 80 to the app on port 3000 |
| `deploy/deploy.sh` | Deploys from your laptop and checks `/api/health` |
