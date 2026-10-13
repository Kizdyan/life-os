# Persona Publisher V1 implementation plan

1. Add failing contract tests for states, package validation, manual outcomes and Metricool connection handling.
2. Implement provider-neutral contracts, router and deterministic adapter boundary.
3. Add failing durable execution tests for scheduling, immediate publish, evidence validation, lost responses, restart and concurrency.
4. Implement the runtime-store-backed publication engine with optimistic concurrency and reconciliation.
5. Run targeted tests, repository regression, TypeScript, API typecheck and production build.
6. Run independent QA and adversarial critique, fix every Critical/Important finding, rerun verification and commit an isolated candidate.

