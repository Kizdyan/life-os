# Life OS

Independent foundation for Life OS and Erika.

## Principles

- Offline-first client keeps working without network or an AI provider.
- Remote durable storage is canonical for cross-device state, history, audit and recovery.
- Hosting, database, object storage and AI providers are replaceable adapters.
- Erika is an orchestrator, not the database owner.
- AI changes state only through typed tools.
- Every autonomous action has a risk tier, audit record, verification and undo where possible.
- Observer verifies persisted/external outcomes before anything is reported as done.
- Human attention is reserved for direction, creative decisions and exceptional/high-risk changes.
- Memory and domain rules are user-owned and provider-independent.

## Runtime

The production runtime is:

`offline client replica -> same-origin Life OS API -> canonical PostgreSQL-compatible durable store`

Large media assets use Yandex.Disk through the Media Brain storage boundary. Yandex.Disk is not the canonical task/memory database.

AppDeploy is not part of the production architecture. A hosting provider is disposable infrastructure and must never own canonical Life OS state.

## Autonomy levels

1. AUTO — execute and verify without interruption.
2. AUTO_REPORT — execute, verify, then include in the next digest.
3. APPROVAL — prepare a plan but require explicit approval before execution.

## Main domains

Life planning, Erika orchestration, Skills, Observer, Memory, Analytics and the personal Media Brain operate on the same provider-neutral autonomy kernel.

See:

- `docs/ARCHITECTURE.md`
- `docs/AUTONOMY.md`
- `docs/DEPLOYMENT.md`
- `docs/AUTONOMOUS_RUNTIME_RUNBOOK.md`
