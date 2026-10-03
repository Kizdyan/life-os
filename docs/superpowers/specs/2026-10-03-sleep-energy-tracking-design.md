# Sleep & Energy Tracking — Design Spec

## Goal

Add a first useful sleep/energy tracking slice to Life OS so the user can record sleep duration, choose the actual sleep interval quickly, record waking energy, and later identify whether duration and sleep timing correlate with feeling rested.

This feature is part of the current Autonomous Runtime milestone and must work offline-first, sync through the same durable runtime, and survive reload/second-device rehydration.

## User flow

On Today, add a compact `Сон и энергия` card.

The user can enter sleep duration in hours, including fractional values such as `7`, `7.5`, or `8`.

After duration is entered, Life OS generates selectable sleep intervals whose length exactly matches that duration. For `7` hours, examples include:

- `23:00–06:00`
- `00:00–07:00`
- `01:00–08:00`
- `02:00–09:00`
- `03:00–10:00`

The list should be centered around plausible overnight sleep windows and include later schedules rather than assuming midnight sleep. The user can also set exact sleep and wake times manually; presets are a convenience, not a restriction.

The user records waking energy on a 1–10 scale. The card shows the currently selected duration, interval, and energy and allows correction.

## Data model

Persist one `sleep_log` record per sleep episode in the autonomous runtime. The payload contains:

- `id`
- `sleep_date` — local calendar date associated with the wake-up/day being evaluated
- `sleep_start` — ISO datetime with local offset
- `sleep_end` — ISO datetime with local offset
- `duration_minutes` — integer derived from the selected/entered interval
- `energy` — integer 1–10
- `source` — initially `manual`
- `created_at`
- `updated_at`

`duration_minutes` and interval must remain internally consistent. If the user changes a preset interval, duration is derived from it. If duration is changed first, presets are regenerated.

The runtime record kind is extended with `sleep_log`; it uses the same versioned mutation, conflict, audit, outbox, and sync semantics as other canonical records.

## Offline and sync behavior

A sleep log is written locally immediately. Network loss must not prevent entry or editing.

Remote sync uses the existing runtime outbox. A successful server acknowledgement clears the corresponding mutation. Stale cross-device edits produce an explicit conflict rather than silent last-write-wins.

A fresh client syncing from revision zero must receive sleep logs from the canonical database.

## First analytics slice

Do not attempt medical diagnosis or claim causality. The first analytics view is descriptive and personal.

Once at least three completed sleep logs exist, show a compact summary containing:

- average sleep duration;
- average waking energy;
- recent sleep/wake timing;
- grouped comparison of energy by duration band (`<7 h`, `7–8 h`, `8–9 h`, `9+ h`) when enough observations exist;
- a neutral note when there is not yet enough data to infer a useful pattern.

Later versions may analyze bedtime/wake-time bands and combine sleep with schedule adherence, but the current milestone only needs enough persisted structure to support that without migration loss.

## UI constraints

The feature must remain compact on iPhone and must not turn Today into a dashboard wall. Sleep entry belongs near the top of Today but below the active/next schedule context.

Preset intervals should be horizontally scrollable chips or another compact mobile control. Energy 1–10 should require at most one tap after opening/selecting the control.

All controls must remain usable offline.

## Validation

- duration: greater than 0 and at most 24 hours;
- energy: integer 1–10;
- sleep end must be after sleep start, including overnight date rollover;
- generated presets must exactly match entered duration;
- malformed persisted sleep records must not crash Today;
- duplicate mutation replay must remain idempotent.

## Current milestone acceptance

The milestone is ready for the user to inspect through a public URL only when:

1. existing core/web/deploy-readiness/Media Brain CI is green;
2. sleep/energy tests and build are green;
3. a dedicated durable Life OS database exists and migrations are applied there, not to DiveM production/integration-test;
4. the independent deployment is reachable by HTTPS;
5. Today works on iPhone;
6. sleep/energy entry works offline and survives reload;
7. reconnect sync persists the entry remotely;
8. outcome undo and cross-device conflict handling still work;
9. a fresh/second client can rehydrate canonical data;
10. AppDeploy is not required by the deployed runtime.

## Non-goals for this milestone

- sleep-stage detection;
- Apple Health ingestion;
- medical recommendations;
- automated claims about optimal sleep after only a few observations;
- replacing the broader Analytics architecture.
