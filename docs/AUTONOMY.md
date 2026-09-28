# Autonomy policy

The system follows management-by-exception.

## AUTO
Safe, reversible, bounded actions: analysis, drafts, local planning, rescheduling flexible items inside policy, read-only research, tests, classification, analytics.

## AUTO_REPORT
Pre-approved recurring actions with meaningful external effects but bounded risk. They execute only after Observer verification and appear in a digest.

## APPROVAL
Money, destructive deletion, irreversible changes, credentials/security, production database migrations, pricing/legal changes, sensitive public content, major product-direction changes, or any action outside a known policy.

## Escalation
Escalate when confidence is below policy threshold, rules conflict, an external side effect cannot be verified, or a proposed action crosses its risk budget.

Goal: minimize unnecessary interruptions, not minimize human control.
