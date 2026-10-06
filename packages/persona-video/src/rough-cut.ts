import type {
  EditDecision,
  EditDecisionList,
  ProcessRunner,
  VerifiedMediaOutput,
  VideoMetadata,
} from "./contracts";
import { VideoPipelineError } from "./contracts";
import { renderAtomically } from "./render-utils";

export async function renderRoughCut(input: {
  metadata: VideoMetadata;
  editDecisionList: EditDecisionList;
  outputPath: string;
  ffmpegPath: string;
  ffprobePath: string;
  runner: ProcessRunner;
}): Promise<VerifiedMediaOutput> {
  const keeps = validateKeepRanges(input.editDecisionList, input.metadata.durationMs);
  return renderAtomically({
    outputPath: input.outputPath,
    ffprobePath: input.ffprobePath,
    runner: input.runner,
    render: async (temporaryPath) => {
      const filter = buildConcatFilter(keeps, input.metadata.hasAudio);
      const args = [
        "-y",
        "-nostdin",
        "-v",
        "error",
        "-i",
        input.metadata.inputPath,
        "-filter_complex",
        filter,
        "-map",
        "[outv]",
        ...(input.metadata.hasAudio ? ["-map", "[outa]"] : []),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        ...(input.metadata.hasAudio ? ["-c:a", "aac", "-b:a", "160k"] : ["-an"]),
        "-movflags",
        "+faststart",
        temporaryPath,
      ];
      await input.runner.run(input.ffmpegPath, args, { timeoutMs: 300_000 });
    },
  });
}

function validateKeepRanges(edl: EditDecisionList, durationMs: number): EditDecision[] {
  const keeps = edl.decisions
    .filter((decision) => decision.action === "KEEP")
    .sort((left, right) => left.sourceStartMs - right.sourceStartMs);
  if (keeps.length === 0) {
    throw new VideoPipelineError("INVALID_OUTPUT", "EDL has no KEEP ranges");
  }
  let previousEnd = -1;
  for (const keep of keeps) {
    if (
      keep.sourceStartMs < 0 ||
      keep.sourceEndMs <= keep.sourceStartMs ||
      keep.sourceEndMs > durationMs + 10 ||
      keep.sourceStartMs < previousEnd
    ) {
      throw new VideoPipelineError("INVALID_OUTPUT", "EDL KEEP ranges are invalid", {
        keep,
      });
    }
    previousEnd = keep.sourceEndMs;
  }
  return keeps;
}

function buildConcatFilter(keeps: EditDecision[], hasAudio: boolean): string {
  const filters: string[] = [];
  for (const [index, keep] of keeps.entries()) {
    const start = seconds(keep.sourceStartMs);
    const end = seconds(keep.sourceEndMs);
    filters.push(`[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${index}]`);
    if (hasAudio) {
      filters.push(`[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${index}]`);
    }
  }
  const inputs = keeps
    .map((_, index) => `[v${index}]${hasAudio ? `[a${index}]` : ""}`)
    .join("");
  filters.push(
    `${inputs}concat=n=${keeps.length}:v=1:a=${hasAudio ? 1 : 0}[outv]${
      hasAudio ? "[outa]" : ""
    }`,
  );
  return filters.join(";");
}

function seconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(3);
}
