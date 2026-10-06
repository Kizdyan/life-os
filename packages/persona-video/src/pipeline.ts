import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { analyzeAudio } from "./audio";
import { captionsToSrt, retimeTranscriptToEdl } from "./captions";
import type {
  ExportPreset,
  PipelineStage,
  ProcessedVideoResult,
  ProcessRunner,
  ReframeInstruction,
} from "./contracts";
import { VideoPipelineError } from "./contracts";
import { buildEditDecisionList, type EdlPolicy } from "./edl";
import { renderPlatformVariants } from "./exports";
import { hashFileSha256 } from "./file-hash";
import { probeVideo } from "./probe";
import { NodeProcessRunner, resolveMediaTools } from "./process-adapter";
import { renderVerticalMaster } from "./reframe";
import { renderRoughCut } from "./rough-cut";
import {
  buildObjectiveSegments,
  detectSilence,
  type SilenceDetectionPolicy,
} from "./segmentation";
import { runTechnicalQa, type TechnicalQaPolicy } from "./technical-qa";
import { resolveTranscript, type TranscriptProvider } from "./transcription";

export interface VideoProcessingRequest {
  inputPath: string;
  outputRoot: string;
  transcriptProvider?: TranscriptProvider | null;
  reframeInstruction?: ReframeInstruction;
  exportPresets?: ExportPreset[];
  ffmpegPath?: string;
  ffprobePath?: string;
  runner?: ProcessRunner;
  qaPolicy?: Partial<TechnicalQaPolicy>;
  silencePolicy?: Partial<SilenceDetectionPolicy>;
  edlPolicy?: Partial<EdlPolicy>;
  onProgress?: (stage: PipelineStage) => void;
}

export async function processVideo(
  request: VideoProcessingRequest,
): Promise<ProcessedVideoResult> {
  const inputPath = resolve(request.inputPath);
  const outputRoot = resolve(request.outputRoot);
  const runId = createRunId();
  const runPath = join(outputRoot, runId);
  const reportPath = join(runPath, "report.json");
  try {
    await mkdir(outputRoot, { recursive: true });
    await mkdir(runPath, { recursive: false });
  } catch (error) {
    throw filesystemError("Unable to create video pipeline run directory", error, {
      outputRoot,
      runId,
      runPath,
    });
  }
  const runner = request.runner ?? new NodeProcessRunner();

  const progress = (stage: PipelineStage) => request.onProgress?.(stage);
  try {
    const tools = await resolveMediaTools({
      ffmpegPath: request.ffmpegPath,
      ffprobePath: request.ffprobePath,
      runner,
    });
    const toolVersions = {
      ffmpeg: await readToolVersion(runner, tools.ffmpegPath),
      ffprobe: await readToolVersion(runner, tools.ffprobePath),
    };

    progress("PROBING");
    const metadata = await probeVideo({
      inputPath,
      ffprobePath: tools.ffprobePath,
      runner,
    });
    const inputSha256 = await hashFileSha256(inputPath);
    await writeJson(join(runPath, "metadata.json"), metadata);

    progress("QA");
    const qa = await runTechnicalQa({
      metadata,
      ffmpegPath: tools.ffmpegPath,
      runner,
      policy: request.qaPolicy,
    });
    await writeJson(join(runPath, "qa.json"), qa);
    if (qa.status === "FAIL") {
      throw new VideoPipelineError("TECHNICAL_QA_FAILED", "Input failed technical QA", {
        findings: qa.findings,
      });
    }

    progress("CAPTIONS");
    const transcriptResolution = await resolveTranscript(
      request.transcriptProvider ?? null,
      inputPath,
    );
    await writeJson(join(runPath, "transcript.json"), transcriptResolution);
    const captionsPath = join(runPath, "captions.srt");

    progress("SEGMENTING");
    const silence = metadata.hasAudio
      ? await detectSilence({
          inputPath,
          durationMs: metadata.durationMs,
          ffmpegPath: tools.ffmpegPath,
          runner,
          policy: request.silencePolicy,
        })
      : [];
    const segments = buildObjectiveSegments(
      metadata.durationMs,
      silence,
      transcriptResolution.transcript,
    );
    const editDecisionList = buildEditDecisionList(
      metadata.durationMs,
      segments,
      request.edlPolicy,
    );
    await writeJson(join(runPath, "segments.json"), segments);
    await writeJson(join(runPath, "edit-decision.json"), editDecisionList);
    const outputTranscript = transcriptResolution.transcript
      ? retimeTranscriptToEdl(transcriptResolution.transcript, editDecisionList)
      : null;
    await writeFile(captionsPath, outputTranscript ? captionsToSrt(outputTranscript) : "", "utf8");

    progress("EDITING");
    const roughCut = await renderRoughCut({
      metadata,
      editDecisionList,
      outputPath: join(runPath, "rough-cut.mp4"),
      ffmpegPath: tools.ffmpegPath,
      ffprobePath: tools.ffprobePath,
      runner,
    });

    progress("AUDIO");
    const audio = await analyzeAudio({
      metadata: roughCut.metadata,
      ffmpegPath: tools.ffmpegPath,
      runner,
    });
    await writeJson(join(runPath, "audio.json"), audio);

    progress("REFRAMING");
    const verticalMaster = await renderVerticalMaster({
      metadata: roughCut.metadata,
      instruction: request.reframeInstruction ?? { mode: "CENTER" },
      outputPath: join(runPath, "vertical-master.mp4"),
      ffmpegPath: tools.ffmpegPath,
      ffprobePath: tools.ffprobePath,
      runner,
    });

    progress("EXPORTING");
    const platformOutputs = await renderPlatformVariants({
      master: verticalMaster,
      outputDirectory: runPath,
      presets: request.exportPresets,
      ffmpegPath: tools.ffmpegPath,
      ffprobePath: tools.ffprobePath,
      runner,
    });

    progress("VERIFYING");
    const warnings = [
      ...qa.findings
        .filter((finding) => finding.severity === "WARNING")
        .map((finding) => finding.message),
      ...(transcriptResolution.warning ? [transcriptResolution.warning] : []),
    ];
    const result: ProcessedVideoResult = {
      runId,
      runPath,
      inputPath,
      inputSha256,
      metadata,
      qa,
      segments,
      editDecisionList,
      transcript: transcriptResolution.transcript,
      captionsPath,
      audio,
      roughCut,
      verticalMaster,
      platformOutputs,
      reportPath,
      warnings,
      toolVersions,
    };
    await writeJson(reportPath, { status: "COMPLETED", ...result });
    progress("COMPLETED");
    return result;
  } catch (error) {
    progress("FAILED");
    const failure = normalizeError(error);
    const details: Record<string, unknown> = {
      ...failure.details,
      runPath,
      reportPath,
    };
    try {
      await writeJson(reportPath, {
        status: "FAILED",
        runId,
        runPath,
        inputPath,
        error: { code: failure.code, message: failure.message, details: failure.details },
      });
      details.reportWritten = true;
    } catch (reportError) {
      details.reportWritten = false;
      details.reportWriteError = errorMessage(reportError);
    }
    throw new VideoPipelineError(failure.code, failure.message, {
      ...details,
    });
  }
}

function createRunId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${timestamp}-${randomUUID().slice(0, 8)}`;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readToolVersion(runner: ProcessRunner, command: string): Promise<string> {
  const result = await runner.run(command, ["-version"]);
  return (result.stdout || result.stderr).split(/\r?\n/, 1)[0]?.trim() || "unknown";
}

function normalizeError(error: unknown): VideoPipelineError {
  if (error instanceof VideoPipelineError) return error;
  if (isFilesystemError(error)) {
    return filesystemError("Video pipeline filesystem operation failed", error);
  }
  return new VideoPipelineError(
    "PROCESS_FAILED",
    error instanceof Error ? error.message : "Unknown video pipeline failure",
  );
}

function filesystemError(
  message: string,
  error: unknown,
  details: Record<string, unknown> = {},
): VideoPipelineError {
  return new VideoPipelineError("FILESYSTEM_ERROR", message, {
    ...details,
    cause: errorMessage(error),
    filesystemCode: isFilesystemError(error) ? error.code : undefined,
  });
}

function isFilesystemError(error: unknown): error is NodeJS.ErrnoException {
  if (!(error instanceof Error) || typeof (error as NodeJS.ErrnoException).code !== "string") {
    return false;
  }
  return new Set([
    "EACCES",
    "EEXIST",
    "EISDIR",
    "EMFILE",
    "ENFILE",
    "ENOENT",
    "ENOSPC",
    "ENOTDIR",
    "EPERM",
    "EROFS",
  ]).has((error as NodeJS.ErrnoException).code as string);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
