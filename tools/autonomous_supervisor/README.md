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
