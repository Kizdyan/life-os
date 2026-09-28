# Life OS delivery roadmap

## Core already implemented
- Unified outcome model for UI and Erika.
- Missed-on-time vs never-completed distinction.
- Carry-forward without rewriting history.
- Offline outbox.
- Honest adherence analytics.
- Erika runtime and natural-language outcome commands.
- Supabase REST repository boundary.

## Current implementation block
- Today fast actions for routines/tasks/events.
- Planner rules: theatre exit buffer, travel, meals, reserve.
- Quick Capture and Inbox.
- Daily check-in with nullable decimal sleep.
- Automatic end-of-day rollover.

## Next implementation blocks
- Full independent PWA shell and portable HTTP API.
- Supabase auth/RLS and transactional RPC for outcome mutation.
- Google Calendar two-way adapter with no-delete conflict policy.
- Voice pipeline: long free-form transcription, transcript log, action preview/undo.
- Week/Tasks/Calendar/Projects/Analytics migration.
- Recurrence, dependencies, reminders and notification scheduler.
- Google Sheets export/backup only.
- Native iOS shell, App Intents and widgets after PWA stability.
- Reliability: idempotency, retries, observer verification, audit/undo, E2E tests.
