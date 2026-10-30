import type {
  ScenarioCreativeProfile,
  ScenarioScript,
  ScenarioScriptBeat,
} from "./persona-scenario-intelligence";

/** Narrow export contract, containing only the current saved author draft. */
export interface PersonaLocalDoctorTask {
  kind: "persona-local-doctor-input-v1";
  version: 1;
  script: {
    idea: ScenarioScript["idea"];
    currentRevisionId: string;
    currentRevision: {
      id: string;
      beats: ScenarioScriptBeat[];
    };
  };
  targetIndices: number[];
  lockedIndices: number[];
  instruction: string;
  authorFeedback?: string;
  creativeProfile?: ScenarioCreativeProfile;
}

export function buildPersonaLocalDoctorTask(
  script: ScenarioScript,
  options: {
    targetIndices: number[];
    lockedIndices?: number[];
    instruction: string;
    authorFeedback?: string;
    creativeProfile?: ScenarioCreativeProfile;
  },
): PersonaLocalDoctorTask {
  const revision = script.currentRevision;
  if (!revision || !Array.isArray(revision.beats) ||
      revision.id !== script.currentRevisionId ||
      revision.beats.length < 3 || revision.beats.length > 12 ||
      !script.revisions.some(item => item.id === revision.id)) {
    throw new Error("First save a valid Persona screenplay revision");
  }
  const checkIndices = (values: number[], label: string, allowEmpty = false): number[] => {
    if (!Array.isArray(values) || (!allowEmpty && values.length === 0) ||
        values.length > 12 || new Set(values).size !== values.length ||
        values.some(index => !Number.isInteger(index) ||
          index < 0 || index >= revision.beats.length)) {
      throw new Error(`Invalid ${label} scene selection`);
    }
    return [...values].sort((a, b) => a - b);
  };
  const selected = checkIndices(options.targetIndices, "target");
  const locked = checkIndices(options.lockedIndices ?? [], "locked", true);
  if (selected.some(index => locked.includes(index))) {
    throw new Error("A locked scene cannot be selected for rewriting");
  }
  if (typeof options.instruction !== "string" ||
      options.instruction.trim().length < 3 || options.instruction.length > 2000) {
    throw new Error("Provide a concrete editorial instruction");
  }
  if (options.authorFeedback !== undefined &&
      (typeof options.authorFeedback !== "string" ||
        options.authorFeedback.trim().length < 3 ||
        options.authorFeedback.length > 2000)) {
    throw new Error("Author feedback is invalid");
  }
  const profile = options.creativeProfile;
  if (profile !== undefined &&
      (!Array.isArray(profile.priorities) ||
       !Array.isArray(profile.constraints) ||
       [...profile.priorities, ...profile.constraints].some(value => typeof value !== "string"))) {
    throw new Error("Invalid project creative profile");
  }
  return {
    kind: "persona-local-doctor-input-v1",
    version: 1,
    script: {
      // No approval or old revision history leaves the browser.
      idea: { ...script.idea, referenceIds: [...script.idea.referenceIds] },
      currentRevisionId: revision.id,
      currentRevision: {
        id: revision.id,
        beats: revision.beats.map(beat => ({ ...beat })),
      },
    },
    targetIndices: selected,
    lockedIndices: locked,
    instruction: options.instruction.trim(),
    ...(options.authorFeedback ? { authorFeedback: options.authorFeedback.trim() } : {}),
    ...(profile
      ? { creativeProfile: {
          priorities: [...profile.priorities].slice(0, 12),
          constraints: [...profile.constraints].slice(0, 12),
        } }
      : {}),
  };
}
