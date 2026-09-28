# Life OS

Independent foundation for Life OS and Erika.

## Principles
- Local/offline-first core must keep working without an AI provider.
- Erika is an orchestrator, not the database owner.
- AI changes state only through typed tools.
- Every autonomous action has a risk tier, audit record, verification and undo where possible.
- Observer verifies persisted/external outcomes before anything is reported as done.
- Human attention is reserved for direction, creative decisions and exceptional/high-risk changes.
- Memory and domain rules are provider-independent.

## Autonomy levels
1. AUTO — execute and verify without interruption.
2. AUTO_REPORT — execute, verify, then include in the next digest.
3. APPROVAL — prepare a plan but require explicit approval before execution.

## First domains
Life planning, Erika orchestration, Skills, Observer, Memory, Analytics. Later the same kernel can coordinate Media and product agents without coupling those products to Life OS.

See docs/ARCHITECTURE.md and docs/AUTONOMY.md.
