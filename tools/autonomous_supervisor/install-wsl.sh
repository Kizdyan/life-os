#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
RUN_USER="$(id -un)"
RUN_GROUP="$(id -gn)"
CONFIG="$HERE/config.json"
TOKEN_FILE="$HERE/.control-token"
SERVICE="/etc/systemd/system/life-os-supervisor.service"
WATCHDOG_SERVICE="/etc/systemd/system/life-os-supervisor-watchdog.service"
WATCHDOG_TIMER="/etc/systemd/system/life-os-supervisor-watchdog.timer"

command -v python3 >/dev/null || { echo "python3 required"; exit 1; }
command -v git >/dev/null || { echo "git required"; exit 1; }
command -v codex >/dev/null || { echo "Codex CLI required. Install it and sign in locally with ChatGPT, then rerun."; exit 2; }

[[ -f "$CONFIG" ]] || cp "$HERE/config.example.json" "$CONFIG"
mkdir -p "$HERE/data" "$HERE/worktrees"

if [[ -z "\${SUPERVISOR_CONTROL_TOKEN:-}" ]]; then
  echo "Create SUPERVISOR_CONTROL_TOKEN locally before install. Never paste it into chat."
  echo "Local generator: python3 -c 'import secrets; print(secrets.token_urlsafe(32))'"
  exit 3
fi

umask 077
printf 'SUPERVISOR_CONTROL_TOKEN=%s\n' "$SUPERVISOR_CONTROL_TOKEN" > "$TOKEN_FILE"

sudo tee "$SERVICE" >/dev/null <<EOF
[Unit]
Description=Life OS Autonomous Supervisor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_GROUP
WorkingDirectory=$HERE
Environment=SUPERVISOR_CONFIG=$CONFIG
EnvironmentFile=$TOKEN_FILE
ExecStart=/usr/bin/python3 $HERE/supervisor.py --config $CONFIG
Restart=always
RestartSec=5
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
EOF

sudo cp "$HERE/life-os-supervisor-watchdog.service" "$WATCHDOG_SERVICE"
sudo cp "$HERE/life-os-supervisor-watchdog.timer" "$WATCHDOG_TIMER"
sudo systemctl daemon-reload
sudo systemctl enable --now life-os-supervisor.service
sudo systemctl enable --now life-os-supervisor-watchdog.timer
sleep 1
sudo systemctl --no-pager --full status life-os-supervisor.service || true
echo "Dashboard: http://127.0.0.1:8787"
echo "For iPhone access, expose only through a private network (Tailscale/WireGuard), never public port-forwarding."
