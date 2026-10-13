# CS 408 Final Project

A Node.js/Express app that serves a "Hello World" landing page, with scripts to run it locally and deploy it to an AWS EC2 server.

## 1. Install first

- [Node.js](https://nodejs.org/) **18 or newer** (includes npm)
- Git and a bash shell (Linux/macOS terminal, or Git Bash on Windows)

## 2. Run locally

```bash
git clone https://github.com/adnanmaksic/cs408-final-project.git
cd cs408-final-project
./start.sh
```

Then open <http://localhost:3000/>. Use `PORT=8080 ./start.sh` for a different port. Run tests with `npm test`.

## 3. Deploy to EC2

One-time server setup (fresh Ubuntu EC2 instance, port 80 open in its security group):

```bash
scp -i ~/keys/mykey.pem -r deploy ubuntu@<PUBLIC-IP>:~
ssh -i ~/keys/mykey.pem ubuntu@<PUBLIC-IP>
sudo bash deploy/setup-ec2.sh
```

Or clone the repo on the server and run setup from the clone. It sets up the server and also installs and starts the app:

```bash
git clone https://github.com/adnanmaksic/cs408-final-project.git
cd cs408-final-project
sudo bash deploy/setup-ec2.sh
```

To update later from the server: `git pull && sudo bash deploy/setup-ec2.sh`.

Every deploy, from your laptop:

```bash
./deploy/deploy.sh -h <PUBLIC-IP> -i ~/keys/mykey.pem
```

## Files

| File | Purpose |
| --- | --- |
| `start.sh` | Checks tools, installs dependencies, starts the app |
| `deploy/setup-ec2.sh` | One-time server setup: Node.js, nginx, app directory, systemd service |
| `deploy/cs408-app.service` | systemd unit: starts the app on boot, restarts it on crash |
| `deploy/nginx-cs408-app.conf` | nginx site: forwards port 80 to the app on port 3000 |
| `deploy/deploy.sh` | Runs tests, copies code to the server, restarts it, checks `/api/health` |
