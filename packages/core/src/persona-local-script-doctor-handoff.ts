import {
  reviseScenarioScript,
  type ScenarioScript,
  type ScenarioScriptBeat,
} from "./persona-scenario-intelligence";

/**
 * Untrusted output of the optional Windows-local two-pass Script Doctor.
 * These suggestions are NEVER an editorial approval or a Production Brief.
 */
export interface PersonaLocalDoctorSuggestion {
  kind: "persona-local-doctor-suggestion-v1";
  version: 1;
  sourceRevisionId: string;
  status: "SUGGESTION_NOT_APPROVED";
  revisedBeats: ScenarioScriptBeat[];
  diff: Array<{
    beatIndex: number;
    before: ScenarioScriptBeat;
    after: ScenarioScriptBeat;
  }>;
  changeSummary: string;
}

function beatSnapshot(value: unknown): ScenarioScriptBeat {
  if (!value || typeof value !== "object") throw new Error("Invalid Script Doctor beat");
  const beat = value as Partial<ScenarioScriptBeat>;
  if (
    !["hook", "development", "ending"].includes(String(beat.purpose)) ||
    typeof beat.line !== "string" || !beat.line.trim() ||
    typeof beat.action !== "string" || !beat.action.trim() ||
    typeof beat.durationSec !== "number" ||
    !Number.isFinite(beat.durationSec) ||
    beat.durationSec <= 0 || beat.durationSec > 90
  ) throw new Error("Invalid Script Doctor beat");
  return {
    purpose: beat.purpose as ScenarioScriptBeat["purpose"],
    line: beat.line,
    action: beat.action,
    durationSec: beat.durationSec,
  };
}
function sameBeat(a: ScenarioScriptBeat, b: ScenarioScriptBeat): boolean {
  return a.purpose === b.purpose && a.line === b.line &&
    a.action === b.action && a.durationSec === b.durationSec;
}

/**
 * Imports an exact candidate as a NEW, UNAPPROVED ScenarioScript revision.
 * Caller must persist the returned script through the canonical project store.
 * A stale model file or undisclosed edit is rejected, not silently adopted.
 */
export function applyPersonaLocalDoctorSuggestion(
  script: ScenarioScript,
  candidate: unknown,
  createdAt: string,
): ScenarioScript {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Invalid Script Doctor suggestion");
  }
  const value = candidate as Partial<PersonaLocalDoctorSuggestion>;
  const current = script.revisions.find(item => item.id === script.currentRevisionId);
  if (!current || current.id !== script.currentRevision.id) {
    throw new Error("Invalid current Persona revision");
  }
  if (
    value.kind !== "persona-local-doctor-suggestion-v1" ||
    value.version !== 1 ||
    value.status !== "SUGGESTION_NOT_APPROVED" ||
    value.sourceRevisionId !== current.id
  ) throw new Error("Script Doctor suggestion belongs to another revision or is not an unapproved draft");
  if (!Array.isArray(value.revisedBeats) || !Array.isArray(value.diff) ||
      value.revisedBeats.length !== current.beats.length ||
      value.diff.length < 1 || value.diff.length > current.beats.length) {
    throw new Error("Invalid Script Doctor revision or diff");
  }
  const revised = value.revisedBeats.map(beatSnapshot);
  const changed = new Set<number>();
  for (const item of value.diff) {
    if (!item || !Number.isInteger(item.beatIndex) ||
      item.beatIndex < 0 || item.beatIndex >= current.beats.length ||
      changed.has(item.beatIndex)) throw new Error("Invalid Script Doctor change index");
    const before = beatSnapshot(item.before);
    const after = beatSnapshot(item.after);
    if (!sameBeat(before, current.beats[item.beatIndex]) ||
        !sameBeat(after, revised[item.beatIndex]) ||
        sameBeat(before, after)) throw new Error("Script Doctor diff does not match the existing revision");
    changed.add(item.beatIndex);
  }
  for (let i = 0; i < current.beats.length; i++) {
    if (changed.has(i) === sameBeat(current.beats[i], revised[i])) {
      throw new Error("Script Doctor contains an undisclosed or missing change");
    }
    if (current.beats[i].purpose !== revised[i].purpose) {
      throw new Error("Script Doctor changed the narrative role of a beat");
    }
  }
  if (
    revised[0].purpose !== "hook" || revised[revised.length - 1].purpose !== "ending" ||
    revised.slice(1, -1).some(beat => beat.purpose !== "development")
  ) throw new Error("Script Doctor damaged the narrative order");
  const duration = revised.reduce((sum,beat) => sum + beat.durationSec,0);
  if (duration < 12 || duration > 90) throw new Error("Script Doctor revision has an invalid duration");
  const summary = value.changeSummary;
  if (typeof summary !== "string" || summary.trim().length < 3 || summary.length > 1400) {
    throw new Error("Script Doctor change summary is missing");
  }
  // Existing core implementation clears approval and archives the previous revision.
  return reviseScenarioScript(script, {
    beats: revised,
    createdAt,
    reason: "Local Script Doctor (unapproved): " + summary.trim(),
  });
}
