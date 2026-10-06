# Life OS MASTER Feature Recovery — 2026-10-07

## Definition of Done
A feature is DONE only when its real user flow works end-to-end on the production iPhone: input/action -> durable local state -> canonical sync where applicable -> visible result in the correct surface -> reload/restart survival -> audit/undo for mutations. Endpoint existence, green CI, build success, or a source file are infrastructure evidence only.

## Product contract recovered
Life OS is one system with five layers: planning/execution, life sensing, durable memory, analytics/learning, and AI orchestration. Erika is the intelligent interface/orchestrator over typed tools. Persona is a Content Production OS fed by Life OS context. Critical planning/storage/media semantics remain provider-neutral and offline-first.

Video-analysis requirements recovered from project history include: Erika as dispatcher over skills/agents; event -> condition -> action -> verification workflows; Observer verification rather than trusting executor claims; reusable Skills + Memory + Rules + Undo + Offline Sync; understand -> plan -> act -> verify -> remember -> adapt; Media OS loop reference/viral analysis -> idea -> script -> shoot -> publish -> result -> learning.

## MASTER FEATURE RECOVERY MATRIX

| Feature | Source | Existed before | Current / real E2E | Old implementation | Dependencies | Action | Acceptance |
|---|---|---:|---|---|---|---|---|
| Today | PR25/41 | yes | partial | App.tsx, outcomes | runtime | restore/extend | now/next, schedule, free windows, outcomes survive reload |
| Week | roadmap | partial contracts | absent | planner/core | task/event domain | implement | seven-day editable schedule |
| Tasks | core | yes primitives | partial/no dedicated UI | LifeItem/outcomes | runtime | restore UI | CRUD/move/outcome/offline/reload |
| Calendar | PR8/10 | yes core | absent UI | calendar-sync.ts | scheduling | restore+wire | day/week events/tasks/conflicts/free windows |
| Projects | architecture | partial | absent Life UI | runtime records | tasks/goals | implement | project CRUD + linked actions/progress |
| Goals/Goal Tree | evolution plan/user | designed | absent | architecture plan | projects | new | hierarchy + next actions + alignment |
| Subtasks/dependencies | PR8/10 | yes | dependencies hidden | dependencies.ts | tasks | restore | blocked/unblocked behavior visible |
| Recurrence | PR8/10 | yes | hidden | recurrence.ts | tasks/calendar | restore | next occurrence without duplicates |
| Reminders | PR8/10 | yes | hidden | reminders.ts | schedule | restore | reminder generated/delivered where platform permits |
| Inbox/Quick Capture | PR6/9/10 | yes | absent | quick-capture.ts | tasks | restore | capture -> classify -> visible durable item |
| Free windows | PR25/41 | yes | regressed; recovery restarted | planner/App | calendar | restore | correct gaps from real blocks |
| Outcomes | PR3/5 | yes | partial E2E | outcomes/status | runtime | preserve | completed/partial/moved/missed_time/not_completed |
| Rollover/day close | PR5 | yes core | not product E2E | automation.ts | outcomes | restore | old miss retained + successor created, bounded |
| Actual execution/deep work | analytics plan | partial | partial | analytics/runtime | execution | complete | start/stop -> actual duration/deep-work observation |
| Audit/undo | PR11/30 | yes | partial | audit.ts/undo.ts | all writes | extend | action group verified + one undo |
| Life observations | evolution plan | yes core | partial | life-analytics.ts/adapters | execution+sensors | extend | normalized durable observation stream |
| Analytics graphs/history | user/evolution | partial model | incomplete UI | analyticsView/Dashboard | observations | rebuild UI | real history, charts, period comparisons |
| Correlations/insights | evolution | partial | insufficient | life-analytics.ts | sample thresholds | extend | guarded association + explanation |
| Sleep/energy/check-ins | sleep spec | yes | partial | sleep runtime/analytics | sensors | extend | sparse check-in + history + sync |
| Erika discourse | PR18/39 | yes | regressed/partial | erika-discourse.ts/planner | tool layer | restore fallback | long multi-clause utterance fully covered |
| Erika AI agent | architecture/evolution | designed | absent E2E | orchestrator specs | LLM+tools+memory | new | natural request -> tools -> Observer -> audit/undo |
| Erika memory | evolution | designed | absent | memory ledger plan | runtime | new | provenance/confidence/supersession/delete |
| Erika voice | PR18 + user | partial | partial | voice.ts/transcript | STT+agent | rebuild adapter | record -> transcript -> AI -> actions; no brittle parser failure |
| Erika multimodal | user | designed | absent | knowledge/tool architecture | storage/model adapters | new | image/file/media -> interpreted task/action |
| Persona ideas | Persona spec | yes | partial | PersonaFactory/state | context | preserve | context-derived durable candidate lifecycle |
| Shooting brief | Persona spec | yes contract | broken production | persona-shooting/Edge | AI/context | fix | idea -> valid brief -> shooting flow |
| Shooting/capture | Persona spec | partial | incomplete | PersonaShooting | media ingest | restore | brief -> capture/source attachment |
| Media ingest/QA | PR36 | yes core | not E2E | media-ingestion/pipeline | object storage | wire | immutable ingest + select/QA |
| Transcription | media/video requirements | partial | not production E2E | media pipeline/API history | TranscriptProvider | rebuild provider-neutral | Russian transcript + local fallback |
| Segmentation/EDL/rough cut | video pipeline | yes tested core | not product E2E | media-pipeline/orchestrator | source media | restore | source -> EDL -> rough cut |
| Captions/audio/master | video pipeline | yes tested | not product E2E | pipeline | ffmpeg/local tools | restore | SRT + normalized audio + vertical master |
| IG/YT/VK adaptations | Persona/Media OS | designed/partial | not E2E | content/media modules | master | implement | one master -> platform packages |
| Prepublish/QA | Persona spec | yes | partial | Persona QA | packages | restore | independent QA blocks defects |
| Publish/analytics/learning | PR36/spec | partial | not E2E | publication/learning | platform adapters | implement | approval -> publish -> metrics -> learning |
| Offline PWA/outbox | architecture | yes | shell partial | SW/runtimeSync | all local domains | harden | offline mutate/restart/reconnect/no duplicate |
| Production independence | recovery | yes infra | static host works; product incomplete | Render+Supabase Edge | deployment | preserve | Vercel quota cannot stop installed production |

## CURRENT BUG MATRIX
1. Production navigation exposes only a subset of Life OS; Week/Tasks/Calendar/Projects/Goals are not usable surfaces.
2. Calendar/scheduling is not a real day/week calendar.
3. Analytics lacks the agreed full history/graph/period/insight experience.
4. Persona Content mobile layout overlaps/collapses on real iPhone.
5. Shooting brief fails with the production error that a brief could not be assembled.
6. Erika success text is not proof of complete intent extraction, persistence, Calendar reflection, sync, or undo.
7. Media pipeline primitives are not connected into one production user workflow.
8. Offline acceptance has not yet been proven for every recovered domain.
9. Current production can be infrastructure-healthy while product functionality remains missing.

## ARCHITECTURE GAP MATRIX
| Layer | Target | Gap |
|---|---|---|
| Client | iPhone PWA durable replica/outbox | domain coverage incomplete; real-device E2E incomplete |
| Domain | typed task/calendar/project/goal/sensor/media contracts | goals + several UI adapters incomplete |
| Edge | Supabase typed tools/runtime | Erika general tool registry and multimodal/media operations incomplete |
| Canonical store | Supabase DB/Auth/Storage | generic runtime substrate exists; domain contracts/projections incomplete |
| Erika | reasoning -> tools -> policy -> Observer -> audit | current path is not a general AI agent |
| Analytics | observations -> aggregates -> guarded insights | longitudinal UI/engine incomplete |
| Persona | opportunities -> production -> distribution -> learning | broken at shooting brief and later E2E stages |
| Media | provider-neutral local-first processing | local TranscriptProvider and product orchestration incomplete |
| Reliability | offline/retry/conflict/audit/undo | must cover every new mutation, not just outcomes |
| Hosting | Render static; no Vercel runtime | preserve |

## Dependency order
1. Stable domain/runtime contracts and iPhone navigation.
2. Life Core surfaces (Today/Week/Tasks/Calendar/Projects/Goals/Inbox).
3. Execution semantics + audit/undo/offline.
4. Erika typed tool layer + memory; then LLM/voice/multimodal adapters.
5. Scheduling intelligence on the same tools.
6. Analytics on normalized observations.
7. Persona shooting recovery.
8. Media processing pipeline.
9. Distribution/publishing/learning.
10. Full iPhone/offline/reliability hardening and real-device acceptance.

## Recovery rule
Reuse pure, tested core semantics where they match the recovered contract. Rewrite thin UI/adapters that expose only prototypes or depend on obsolete runtime boundaries. Implement new only where history contains design but no complete implementation. Never revive Vercel as a production runtime dependency and never treat a provider-credit service as mandatory for critical media processing.
