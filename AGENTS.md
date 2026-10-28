# Project instructions — ecosystem capability tracking

This project contains Life OS, Persona, Erika and AI Capacity OS. Preserve existing project, folder and chat names.

Before proposing a new ecosystem feature, read `docs/ECOSYSTEM_CAPABILITY_ROADMAP_2026-10-28.md` and query `docs/ecosystem-capabilities.json` with `node scripts/ecosystem-capabilities.mjs next` or `show ID`. Work on the smallest testable next milestone; don't start multiple unrelated tools or agents.

Status is evidence-based:
- A proposed feature, an open PR or a successful preview deployment is **not** a released user feature.
- Mark user-facing functionality complete only after exercising it on the target device with an observable outcome.
- Keep existing working modules; don't duplicate the orchestration, skill registry, memory or media pipeline.
- For Persona, optimize for two real iPhone clips → editable plan → MP4 export → quality control before adding advanced AI features.
- Do not merge into main, change production, perform external publication, incur fees, expose secrets, or delete/move user files without explicit approval.
- Keep original photos/video unaltered and require human review for facial appearance, color, sound, caption synchronization and licenses.
- If updating a registry status, cite the test/artifact and revise the matching acceptance gate. Never use a PR reference as proof of deployment.

Use `node --test scripts/ecosystem-capabilities.check.mjs` to validate the capability registry. This file is a plan and is not authority to bypass existing safety or product policies.
