# Existing local batch — guarded night adapter

This reuses `persona-task-dispatcher`, `persona-task-journal`, `persona-local-executor` and the existing ProductionJob mutex. No second task store or render engine. Current execution remains restricted to the original allowlisted Node tests; **model-generated commands are never executed**. The five-goal example explicitly blocks unimplemented capabilities and proceeds with independent engineering work.

## Commands (PowerShell)

Copy `config/persona-night-board.example.json` to a private state folder before the first run. Keep that same board on restart. Example:

```powershell
.\start-night-mode.ps1 -Board 'G:\Persona-Local-Intelligence\night\board.json' -StateRoot 'G:\Persona-Local-Intelligence\night\run'
.\night-status.ps1 -StateRoot 'G:\Persona-Local-Intelligence\night\run'
.\stop-night-mode.ps1 -StateRoot 'G:\Persona-Local-Intelligence\night\run'
```

Paths are explicit parameters; `G:` is an example, not a required drive in implementation. Temp/output stays in the selected state directory. No Windows service, global environment or power-plan changes. The launcher opens no visible helper window.

## Safety and current limits

- At least 4 GiB available RAM, 1 GiB free on the system drive, 10 GiB on the working drive; no more than one loaded model larger than 8 GiB. Unknown measurements refuse unattended work. Individual heavy-model loaders need stricter model-specific headroom.
- One runner, priority/dependency selection from the existing board, durable revision journal, heartbeat, at most 50 tasks / 12 hours / two prior starts. No automatic retry of an ambiguous interrupted task.
- On restart RUNNING becomes BLOCKED for inspection. Completed tasks stay DONE and are not repeated. Unknown mutex ownership remains blocked. No forced stale-lock removal.
- Safe stop waits for the bounded current test (up to two minutes), then starts no next task. Morning summaries describe technical execution, never author acceptance.
- No persistent daemon/automatic refill or local inference handler is claimed yet. Reference analysis, source discovery, content generation and analytics need their existing adapters plus **verified** model/provider capability before unattended activation. The example task labels alone do not implement those operations.
- Controlled tests cover resource refusal, restart, dedupe and safe-stop behavior. Actual overnight stability and hardware temperatures are separate gates. If the Windows system disk is nearly full, the start command intentionally refuses to run.
- Some Windows installations prohibit unsigned `.ps1` files in a new shell. Do not change that policy or bypass it automatically. The equivalent existing Node command works without PowerShell script permissions: `node tools/persona-local-batch.mjs --night --input "<private board.json>" --output "<state directory>" --max-tasks 50`. The provided PowerShell wrappers were also checked in the already authorized host session; this does not grant new shells permission.
