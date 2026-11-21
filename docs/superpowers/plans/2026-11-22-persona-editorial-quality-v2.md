# Persona Editorial Quality V2 — implementation plan

**Goal:** Deliver a separately reviewable seven-slide revision and two cover hooks,
without changing the V1 draft, originals or author approvals.

**Architecture:** Existing Editorial Desk → versioned research record → existing
Canvas renderer → review PNG/ZIP. A named composition preset changes framing,
lighting and text zones only for V2. No parallel editor or renderer.

**Design:** Keep chocolate/graphite/amber, Cormorant headlines and Inter body.
Move cover text above the coin. Alternate wide environment, fridge detail,
bright bronze close-up, sound-room view, door and coin macro. Develop the story
from a threat to the 60 Hz choice, rejected percussion, early collaboration,
loss of musical reassurance, and an explicitly personal acting conclusion.
Two cover propositions are review candidates, not performance-tested winners.

**Constraints:** No paid calls, no main changes, no publication. V1 config and
source images stay byte-identical; browser re-export is compared with saved V1.
Facts come from Burwell's notes and Dennis Lim's article reproduced on his site.
Acting advice is interpretation, not a claim about the filmmakers' intentions.

- [ ] Add regression tests for separate revisions, approved-state protection,
  exact source attribution, layout hash invalidation and cover/coin separation.
- [ ] Add versioned V2 content and a named composition preset to the existing
  renderer; preserve all default behavior and V1 outputs.
- [ ] Expose V1/V2 and alternate cover in the existing Desk; export 7 PNGs,
  alternate cover, contact sheets, caption, source evidence and provenance.
- [ ] Audit Worker image generation without a paid call; fix verified contract
  defects with local tests and report actual BLOCKED status honestly.
- [ ] Browser-test mobile readability, contrast, actual PNGs and preview/export
  equality. Compare V1 file hashes and request independent artistic critique.
- [ ] Address concrete critique, run regressions, commit, create a draft PR
  stacked on #222 and verify exact-head CI. Never mark artwork approved.
