import { writeFile } from "node:fs/promises";
import type { EditDecision, ProcessedVideoResult } from "./contracts";
import { VideoPipelineError } from "./contracts";

export interface V0V1Comparison {
  inputSha256: string;
  inputUnchanged: true;
  duration: { v0Ms: number; v1Ms: number; deltaMs: number };
  removedRanges: {
    v0: RemovedRange[];
    v1: RemovedRange[];
  };
  captions: {
    v0: "DONE" | "BLOCKED";
    v1: "DONE" | "BLOCKED";
    providerUsed: string | null;
  };
  loudness: {
    v0Lufs: number | null;
    v1BeforeLufs: number | null;
    v1AfterLufs: number | null;
  };
  geometry: { v0: string; v1: string };
}

interface RemovedRange {
  startMs: number;
  endMs: number;
  reason: string;
}

export async function writeV0V1Comparison(
  v0: ProcessedVideoResult,
  v1: ProcessedVideoResult,
  outputPath: string,
): Promise<V0V1Comparison> {
  if (v0.inputSha256 !== v1.inputSha256) {
    throw new VideoPipelineError(
      "INVALID_OUTPUT",
      "V0 and V1 reports reference different input files",
      { v0InputSha256: v0.inputSha256, v1InputSha256: v1.inputSha256 },
    );
  }
  const v0Duration = v0.roughCut.metadata.durationMs;
  const v1Duration = v1.roughCut.metadata.durationMs;
  const comparison: V0V1Comparison = {
    inputSha256: v1.inputSha256,
    inputUnchanged: true,
    duration: {
      v0Ms: v0Duration,
      v1Ms: v1Duration,
      deltaMs: v1Duration - v0Duration,
    },
    removedRanges: {
      v0: removedRanges(v0.editDecisionList.decisions),
      v1: removedRanges(v1.editDecisionList.decisions),
    },
    captions: {
      v0: v0.transcript && v0.captionedMaster ? "DONE" : "BLOCKED",
      v1: v1.transcript && v1.captionedMaster ? "DONE" : "BLOCKED",
      providerUsed: v1.transcriptProviderUsage?.providerUsed ?? v1.transcript?.provider ?? null,
    },
    loudness: {
      v0Lufs: v0.audio.integratedLoudnessLufs,
      v1BeforeLufs:
        v1.audioNormalization?.before.integratedLoudnessLufs ??
        v1.audio.integratedLoudnessLufs,
      v1AfterLufs:
        v1.audioNormalization?.after.integratedLoudnessLufs ??
        v1.audio.integratedLoudnessLufs,
    },
    geometry: {
      v0: geometry(v0.verticalMaster),
      v1: geometry(v1.verticalMaster),
    },
  };
  await writeFile(outputPath, `${JSON.stringify(comparison, null, 2)}\n`, "utf8");
  return comparison;
}

function removedRanges(decisions: EditDecision[]): RemovedRange[] {
  return decisions
    .filter((decision) => decision.action === "CUT")
    .map((decision) => ({
      startMs: decision.sourceStartMs,
      endMs: decision.sourceEndMs,
      reason: decision.reason,
    }));
}

function geometry(output: ProcessedVideoResult["verticalMaster"]): string {
  return `${output.metadata.width}x${output.metadata.height}`;
}
