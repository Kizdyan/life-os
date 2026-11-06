import {
  reviseScenarioScript,
  type ScenarioScript,
  type ScenarioScriptBeat,
  type ScenarioScriptRevision,
} from "./persona-scenario-intelligence";

export type PersonaScenarioRevisionDifference = {
  index: number;
  kind: "added" | "removed" | "changed";
  before?: ScenarioScriptBeat;
  after?: ScenarioScriptBeat;
  changedFields: Array<keyof ScenarioScriptBeat>;
};

/**
 * Exact, positional diff of preserved scenario beat content.
 * This is not an artistic score and never modifies the original revisions.
 */
export function comparePersonaScenarioRevisions(
  before: ScenarioScriptRevision,
  after: ScenarioScriptRevision,
): PersonaScenarioRevisionDifference[] {
  if (!before || !after || !Array.isArray(before.beats) || !Array.isArray(after.beats)) {
    throw new Error("Two saved scenario revisions are required");
  }
  const differences: PersonaScenarioRevisionDifference[] = [];
  const fields: Array<keyof ScenarioScriptBeat> = ["purpose","line","action","durationSec"];
  for (let index = 0; index < Math.max(before.beats.length,after.beats.length); index++) {
    const earlier = before.beats[index], later = after.beats[index];
    if (!earlier) {
      differences.push({index,kind:"added",after:later,changedFields:fields});
    } else if (!later) {
      differences.push({index,kind:"removed",before:earlier,changedFields:fields});
    } else {
      const changedFields = fields.filter(field => earlier[field] !== later[field]);
      if (changedFields.length) {
        differences.push({index,kind:"changed",before:earlier,after:later,changedFields});
      }
    }
  }
  return differences;
}

/**
 * Restoring history always makes an entirely new unapproved revision;
 * original authored revisions are kept intact for audit and comparison.
 */
export function restorePersonaScenarioRevision(
  script: ScenarioScript,
  selectedRevisionId: string,
  createdAt: string,
): ScenarioScript {
  const previous = script.revisions.find(revision => revision.id === selectedRevisionId);
  if (!previous) throw new Error("Requested historical scenario revision not found");
  if (previous.id === script.currentRevisionId) throw new Error("This is already the current revision");
  if (!Array.isArray(previous.beats) || previous.beats.length < 3) {
    throw new Error("Historical revision is incomplete");
  }
  return reviseScenarioScript(script,{
    createdAt,
    beats:previous.beats.map(beat=>({...beat})),
    reason:`Author restored historical version ${previous.number} as an unapproved new revision.`,
    ...(previous.ideaSnapshot ? {idea:previous.ideaSnapshot} : {}),
  });
}
