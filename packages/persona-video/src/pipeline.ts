import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  analyzeAudio,
  FfmpegLoudnessNormalizer,
  type AudioNormalizationProvider,
} from "./audio";
import {
  captionsToAss,
  DEFAULT_CAPTION_PRESET,
  INSTAGRAM_CAPTION_PRESET,
  layoutCaptionTranscript,
  type CaptionVisualPreset,
} from "./caption-layout";
import { FfmpegCaptionTextMeasurer } from "./caption-measure";
import { renderCaptionedVideo, type CaptionRenderStyle } from "./caption-render";
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
import { DEFAULT_EXPORT_PRESETS, renderPlatformVariants } from "./exports";
import { hashFileSha256 } from "./file-hash";
import { probeVideo } from "./probe";
import { NodeProcessRunner, resolveMediaTools } from "./process-adapter";
import { renderVerticalMaster } from "./reframe";
import { renderRoughCut } from "./rough-cut";
import {
  buildObjectiveSegments,
  detectSilence,
  type SegmentationPolicy,
  type SilenceDetectionPolicy,
} from "./segmentation";
import { runTechnicalQa, type TechnicalQaPolicy } from "./technical-qa";
import {
  resolveTranscript,
  TranscriptProviderChain,
  type TranscriptProvider,
  type TranscriptProviderCandidate,
} from "./transcription";
import { extractTranscriptionAudio } from "./transcription-audio";
import {
  normalizeTranscriptForCaptions,
  normalizedTranscriptToCanonical,
} from "./transcript-normalize";

export interface VideoProcessingRequest {
  inputPath: string;
  outputRoot: string;
  transcriptProvider?: TranscriptProvider | null;
  transcriptCandidates?: TranscriptProviderCandidate[];
  transcriptRequired?: boolean;
  audioNormalizationProvider?: AudioNormalizationProvider;
  captionStyle?: Partial<CaptionRenderStyle>;
  captionPreset?: Partial<CaptionVisualPreset>;
  instagramCaptionPreset?: Partial<CaptionVisualPreset>;
  captionFontPath?: string;
  reframeInstruction?: ReframeInstruction;
  exportPresets?: ExportPreset[];
  ffmpegPath?: string;
  ffprobePath?: string;
  runner?: ProcessRunner;
  qaPolicy?: Partial<TechnicalQaPolicy>;
  silencePolicy?: Partial<SilenceDetectionPolicy>;
  segmentationPolicy?: Partial<SegmentationPolicy>;
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
    const candidates =
      request.transcriptCandidates ??
      (request.transcriptProvider
        ? [{ provider: request.transcriptProvider, allowed: true }]
        : []);
    const v1Enabled =
      request.transcriptRequired === true ||
      request.transcriptCandidates !== undefined ||
      request.audioNormalizationProvider !== undefined;
    const transcriptionAudio =
      candidates.length > 0
        ? await extractTranscriptionAudio({
            metadata,
            outputPath: join(runPath, "stt-input.wav"),
            ffmpegPath: tools.ffmpegPath,
            ffprobePath: tools.ffprobePath,
            runner,
          })
        : null;
    const transcriptResolution =
      candidates.length > 0 && transcriptionAudio
        ? await new TranscriptProviderChain(candidates).resolve({
            audioPath: transcriptionAudio.path,
            language: "ru",
            artifactDirectory: runPath,
            runner,
          })
        : await resolveTranscript(null, inputPath);
    if (
      request.transcriptRequired &&
      (transcriptResolution.status !== "available" ||
        transcriptResolution.transcript.segments.length === 0)
    ) {
      throw new VideoPipelineError(
        "INVALID_TRANSCRIPT",
        transcriptResolution.warning || "Required transcript is unavailable",
      );
    }
    await writeJson(join(runPath, "transcript.json"), transcriptResolution);
    const normalizedTranscript = transcriptResolution.transcript
      ? normalizeTranscriptForCaptions(transcriptResolution.transcript)
      : null;
    const normalizedTranscriptPath = normalizedTranscript
      ? join(runPath, "normalized-transcript.json")
      : null;
    if (normalizedTranscriptPath && normalizedTranscript) {
      await writeJson(normalizedTranscriptPath, normalizedTranscript);
    }
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
      request.segmentationPolicy,
    );
    const editDecisionList = buildEditDecisionList(
      metadata.durationMs,
      segments,
      request.edlPolicy,
    );
    await writeJson(join(runPath, "segments.json"), segments);
    await writeJson(join(runPath, "edit-decision.json"), editDecisionList);
    const normalizedCanonical = normalizedTranscript
      ? normalizedTranscriptToCanonical(normalizedTranscript)
      : null;
    const retimedTranscript = normalizedCanonical
      ? retimeTranscriptToEdl(normalizedCanonical, editDecisionList)
      : null;
    const captionPreset = resolveCaptionPreset(request.captionPreset, request.captionStyle);
    const instagramCaptionPreset = {
      ...INSTAGRAM_CAPTION_PRESET,
      ...request.instagramCaptionPreset,
    };
    const fontFilePath = request.captionFontPath ?? defaultCaptionFontPath();
    const textMeasurer = retimedTranscript
      ? new FfmpegCaptionTextMeasurer({
          ffmpegPath: tools.ffmpegPath,
          runner,
          workDirectory: runPath,
          fontFilePath,
          fontSizePx: captionPreset.fontSizePx,
        })
      : null;
    const outputTranscript = retimedTranscript && textMeasurer
      ? await layoutCaptionTranscript(retimedTranscript, textMeasurer, captionPreset)
      : null;
    const instagramTranscript = retimedTranscript && textMeasurer
      ? await layoutCaptionTranscript(retimedTranscript, textMeasurer, instagramCaptionPreset)
      : null;
    const captionsAssPath = join(runPath, "captions.ass");
    const instagramCaptionsAssPath = join(runPath, "instagram-captions.ass");
    await writeFile(captionsPath, outputTranscript ? captionsToSrt(outputTranscript) : "", "utf8");
    if (outputTranscript) {
      await writeFile(captionsAssPath, captionsToAss(outputTranscript, captionPreset), "utf8");
    }
    if (instagramTranscript) {
      await writeFile(
        instagramCaptionsAssPath,
        captionsToAss(instagramTranscript, instagramCaptionPreset),
        "utf8",
      );
    }

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
    const audioNormalization = v1Enabled
      ? await (
          request.audioNormalizationProvider ?? new FfmpegLoudnessNormalizer()
        ).normalize({
          metadata: roughCut.metadata,
          outputPath: join(runPath, "normalized-rough-cut.mp4"),
          ffmpegPath: tools.ffmpegPath,
          ffprobePath: tools.ffprobePath,
          runner,
        })
      : null;
    const normalizedRoughCut = audioNormalization?.output ?? roughCut;
    const audio = audioNormalization?.after ??
      (await analyzeAudio({
        metadata: roughCut.metadata,
        ffmpegPath: tools.ffmpegPath,
        runner,
      }));
    await writeJson(
      join(runPath, "audio.json"),
      audioNormalization
        ? { normalized: true, ...audioNormalization }
        : { normalized: false, before: audio, after: audio },
    );

    progress("REFRAMING");
    const verticalMaster = await renderVerticalMaster({
      metadata: normalizedRoughCut.metadata,
      instruction: request.reframeInstruction ?? { mode: "CENTER" },
      outputPath: join(runPath, "vertical-master.mp4"),
      ffmpegPath: tools.ffmpegPath,
      ffprobePath: tools.ffprobePath,
      runner,
    });

    const captionedMaster =
      v1Enabled && outputTranscript && outputTranscript.segments.length > 0
        ? await renderCaptionedVideo({
            input: verticalMaster,
            srtPath: captionsAssPath,
            outputPath: join(runPath, "captioned-vertical.mp4"),
            ffmpegPath: tools.ffmpegPath,
            ffprobePath: tools.ffprobePath,
            runner,
            embeddedStyle: true,
          })
        : null;
    if (request.transcriptRequired && !captionedMaster) {
      throw new VideoPipelineError("INVALID_TRANSCRIPT", "Required captioned output is unavailable");
    }
    const platformMaster = captionedMaster ?? verticalMaster;
    const platformOutputSource = captionedMaster ? "captioned-vertical" : "vertical-master";

    progress("EXPORTING");
    const exportPresets = request.exportPresets ?? DEFAULT_EXPORT_PRESETS;
    const instagramPreset = captionedMaster
      ? exportPresets.find((preset) => preset.id === "instagram-reels")
      : undefined;
    const regularPresets = instagramPreset
      ? exportPresets.filter((preset) => preset !== instagramPreset)
      : exportPresets;
    const regularOutputs = await renderPlatformVariants({
      master: platformMaster,
      outputDirectory: runPath,
      presets: regularPresets,
      ffmpegPath: tools.ffmpegPath,
      ffprobePath: tools.ffprobePath,
      runner,
    });
    const instagramOutput = instagramPreset && instagramTranscript
      ? {
          ...(await renderCaptionedVideo({
            input: verticalMaster,
            srtPath: instagramCaptionsAssPath,
            outputPath: join(runPath, instagramPreset.fileName),
            ffmpegPath: tools.ffmpegPath,
            ffprobePath: tools.ffprobePath,
            runner,
            embeddedStyle: true,
          })),
          presetId: instagramPreset.id,
        }
      : null;
    const outputsByPreset = new Map(
      [...regularOutputs, ...(instagramOutput ? [instagramOutput] : [])]
        .map((output) => [output.presetId, output]),
    );
    const platformOutputs = exportPresets
      .map((preset) => outputsByPreset.get(preset.id))
      .filter((output): output is NonNullable<typeof output> => output !== undefined);
    const platformOutputSources = Object.fromEntries(
      platformOutputs.map((output) => [
        output.presetId,
        output.presetId === "instagram-reels" && instagramOutput
          ? "instagram-safe-caption-render"
          : platformOutputSource,
      ]),
    ) as ProcessedVideoResult["platformOutputSources"];

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
      normalizedTranscript,
      normalizedTranscriptPath,
      transcriptionAudio,
      transcriptProviderUsage: transcriptResolution.providerUsage,
      transcriptDiagnosticArtifacts: transcriptResolution.diagnosticArtifacts,
      transcriptProviderDetails:
        transcriptResolution.status === "available" && transcriptResolution.providerDetails
          ? transcriptResolution.providerDetails
          : null,
      captionsPath,
      audio,
      roughCut,
      normalizedRoughCut,
      audioNormalization,
      verticalMaster,
      cleanMaster: verticalMaster,
      captionedMaster,
      captionLayout: outputTranscript
        ? {
            maxLines: captionPreset.maxLines,
            safeWidthPx: captionPreset.safeWidthPx,
            frameWidthPx: captionPreset.frameWidthPx,
            measuredWith: "FFMPEG_DRAWTEXT",
            fontFilePath,
          }
        : null,
      platformOutputSource,
      platformOutputSources,
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

function resolveCaptionPreset(
  preset: Partial<CaptionVisualPreset> | undefined,
  legacyStyle: Partial<CaptionRenderStyle> | undefined,
): CaptionVisualPreset {
  return {
    ...DEFAULT_CAPTION_PRESET,
    ...preset,
    ...(legacyStyle?.fontName ? { fontName: legacyStyle.fontName } : {}),
    ...(legacyStyle?.fontSize ? { fontSizePx: legacyStyle.fontSize } : {}),
    ...(legacyStyle?.marginV ? { marginBottomPx: legacyStyle.marginV } : {}),
  };
}

function defaultCaptionFontPath(): string {
  return process.env.CAPTION_FONT_PATH ??
    (process.platform === "win32"
      ? "C:\\Windows\\Fonts\\arial.ttf"
      : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf");
}
