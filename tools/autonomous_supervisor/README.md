# Life OS Autonomous Supervisor Runtime v1

Local always-on supervisor for Life OS / Persona development. It is deliberately independent of ChatGPT Tasks.

Current v1 provides:
- durable SQLite queue + event log;
- heartbeat and visible status;
- local iPhone-friendly control center;
- Pause / Resume / Retry / Stop-current-job controls;
- Codex CLI execution through the locally signed-in ChatGPT/Codex client;
- WAITING_FOR_CODEX when the included Codex allowance is temporarily exhausted;
- automatic retry after cooldown;
- isolated git worktrees/branches;
- protected-branch deny list;
- local test/typecheck/build gates before READY.

It does not merge main, deploy production, publish live content, buy anything, or expose secrets.

Codex CLI usage remains subject to the user's ChatGPT plan allowance. The runtime itself has no OpenAI API dependency.

## Smoke test

```bash
cd tools/autonomous_supervisor
cp config.example.json config.json
export SUPERVISOR_CONTROL_TOKEN='create-locally-do-not-send-to-chat'
python3 supervisor.py --config config.json
```

Open http://127.0.0.1:8787 on the PC.

For iPhone access, route this local port only through a private network such as Tailscale/WireGuard. Do not public-port-forward it.

Job flow:

QUEUED -> PREPARING -> CODING -> TESTING -> READY

Exceptional states: WAITING_FOR_CODEX / HUMAN_REQUIRED / FAILED / CANCELLED.


## Windows one-time install

Run PowerShell as Administrator from a dedicated checkout/worktree of this branch:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\autonomous_supervisor\install-windows.ps1 -RepoPath $PWD
```

The installer:
- enables WSL/systemd when available;
- installs missing Python/Git/curl/bubblewrap and the latest Codex CLI;
- asks for one-time ChatGPT sign-in only if Codex is not already authenticated;
- installs the Supervisor and heartbeat watchdog;
- creates a Windows startup task so WSL/Supervisor come back after reboot;
- creates the local control token without sending it anywhere;
- seeds the first Trust Closure job;
- starts the runtime and verifies the local health endpoint.

After install, verify with:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\autonomous_supervisor\verify-windows.ps1
```

A successful install is not considered proven 24/7 until the service survives a deliberate restart/reboot and the heartbeat resumes with the same durable queue.
