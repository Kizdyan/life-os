# Persona Research-to-PreEdit Delivery Design

## Intent

Make the existing Scenario Workspace present three evidence-labelled ideas and
one complete, pre-filming scene plan. The author should be able to review the
future cuts, sound, subtitles, colour direction and shooting instructions
before approving a script. This is not a claim of Instagram Insights, trend
prediction, artistic approval or available footage.

## Scope

- Keep `ScenarioResearchItem` as the source of research provenance. Manual
  links and public sources remain `metadata_only` until the author records a
  concrete review; no views, retention or popularity will be manufactured.
- Generate three original ideas in the existing `suggestScenarioIdeas` flow
  and expose creative-profile fit, filming complexity and an explicit filming
  risk in the existing idea cards.
- Extend the versioned `PersonaPreEditPlan` with optional, validated visual
  direction per scene and a colour direction. Newly created plans populate
  these values; older saved plans continue to parse and display their existing
  brief shot data.
- Preserve all per-scene AI-director camera, light, performance and cut
  directions when its proposal becomes the canonical Production Brief.
- Render the complete planning packet in Scenario Workspace and the existing
  Production Brief panel. Semantic montage continues to consume only actual,
  post-shoot time bounds and cannot invent a new concept.

## Non-goals

- No automatic Instagram scraping, Insights access, paid APIs or claimed
  trend-performance metrics.
- No new editor, model, storage system, colour processing, publication or
  changes to personal media.
- No artistic or author approval without an explicit author action.

## Compatibility and invalidation

Pre-edit visual fields are optional when parsing existing JSON. A newly
generated plan binds all directions to its script revision and exact lines;
any scene edit still revokes the dependent production approval through the
existing revision/beat guard. Research-only updates do not revoke a valid
shoot approval.
