#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_USER="${SUPERVISOR_RUN_USER:-$(id -un)}"
RUN_GROUP="$(id -gn "$RUN_USER")"
RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"
CONFIG="$HERE/config.json"
STATE_DIR="$RUN_HOME/.life-os-supervisor"
TOKEN_FILE="$STATE_DIR/control.env"
SERVICE="/etc/systemd/system/life-os-supervisor.service"
WATCHDOG_SERVICE="/etc/systemd/system/life-os-supervisor-watchdog.service"
WATCHDOG_TIMER="/etc/systemd/system/life-os-supervisor-watchdog.timer"

if [[ "$(id -u)" -eq 0 ]]; then
  ROOT=()
else
  command -v sudo >/dev/null || { echo "sudo required"; exit 1; }
  ROOT=(sudo)
fi

command -v python3 >/dev/null || { echo "python3 required"; exit 1; }
command -v git >/dev/null || { echo "git required"; exit 1; }
command -v codex >/dev/null || { echo "Codex CLI required"; exit 2; }

[[ -f "$CONFIG" ]] || cp "$HERE/config.example.json" "$CONFIG"

if [[ -z "${SUPERVISOR_CONTROL_TOKEN:-}" ]]; then
  echo "SUPERVISOR_CONTROL_TOKEN is required"
  exit 3
fi

"${ROOT[@]}" mkdir -p "$STATE_DIR"
"${ROOT[@]}" chown "$RUN_USER:$RUN_GROUP" "$STATE_DIR"
umask 077
printf 'SUPERVISOR_CONTROL_TOKEN=%s\n' "$SUPERVISOR_CONTROL_TOKEN" | "${ROOT[@]}" tee "$TOKEN_FILE" >/dev/null
"${ROOT[@]}" chown "$RUN_USER:$RUN_GROUP" "$TOKEN_FILE"
"${ROOT[@]}" chmod 600 "$TOKEN_FILE"

"${ROOT[@]}" tee "$SERVICE" >/dev/null <<EOF
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

"${ROOT[@]}" cp "$HERE/life-os-supervisor-watchdog.service" "$WATCHDOG_SERVICE"
"${ROOT[@]}" cp "$HERE/life-os-supervisor-watchdog.timer" "$WATCHDOG_TIMER"
"${ROOT[@]}" systemctl daemon-reload
"${ROOT[@]}" systemctl enable --now life-os-supervisor.service
"${ROOT[@]}" systemctl enable --now life-os-supervisor-watchdog.timer
sleep 1
"${ROOT[@]}" systemctl --no-pager --full status life-os-supervisor.service || true
echo "Dashboard: http://127.0.0.1:8787"
