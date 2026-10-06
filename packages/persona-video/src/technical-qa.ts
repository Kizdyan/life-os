import type {
  ProcessRunner,
  QaFinding,
  QaSeverity,
  VideoMetadata,
  VideoTechnicalQA,
} from "./contracts";

export interface TechnicalQaPolicy {
  minimumDurationMs: number;
  decodeTimeoutMs: number;
}

const DEFAULT_POLICY: TechnicalQaPolicy = {
  minimumDurationMs: 1500,
  decodeTimeoutMs: 120_000,
};

export function evaluateTechnicalQa(
  metadata: VideoMetadata,
  decodedSuccessfully: boolean,
  policy: Partial<TechnicalQaPolicy> = {},
  decodeStderr = "",
): VideoTechnicalQA {
  const resolvedPolicy = { ...DEFAULT_POLICY, ...policy };
  const findings: QaFinding[] = [];

  if (metadata.width <= 0 || metadata.height <= 0) {
    findings.push(fail("RESOLUTION_INVALID", "Video dimensions must be positive"));
  }
  if (!Number.isFinite(metadata.fps) || metadata.fps <= 0) {
    findings.push(fail("FPS_INVALID", "Video frame rate must be positive"));
  }
  if (!Number.isFinite(metadata.durationMs) || metadata.durationMs <= 0) {
    findings.push(fail("DURATION_INVALID", "Video duration must be positive"));
  }
  if (metadata.videoCodec === "unknown" || metadata.videoCodec.trim() === "") {
    findings.push(fail("VIDEO_CODEC_UNKNOWN", "Video codec could not be identified"));
  }
  if (!metadata.hasAudio) {
    findings.push(warning("AUDIO_STREAM_MISSING", "Input has no audio stream"));
  }
  if (metadata.durationMs > 0 && metadata.durationMs < resolvedPolicy.minimumDurationMs) {
    findings.push(
      warning("DURATION_ANOMALOUSLY_SHORT", "Video is shorter than the configured minimum", {
        durationMs: metadata.durationMs,
        minimumDurationMs: resolvedPolicy.minimumDurationMs,
      }),
    );
  }
  if (!decodedSuccessfully) {
    findings.push(
      fail("FULL_DECODE_FAILED", "Input could not be decoded from start to finish", {
        stderr: decodeStderr,
      }),
    );
  }

  return {
    status: aggregateStatus(findings),
    findings,
    decodedSuccessfully,
  };
}

export async function runTechnicalQa(input: {
  metadata: VideoMetadata;
  ffmpegPath: string;
  runner: ProcessRunner;
  policy?: Partial<TechnicalQaPolicy>;
}): Promise<VideoTechnicalQA> {
  const policy = { ...DEFAULT_POLICY, ...input.policy };
  const result = await input.runner.run(
    input.ffmpegPath,
    [
      "-nostdin",
      "-v",
      "error",
      "-xerror",
      "-i",
      input.metadata.inputPath,
      "-f",
      "null",
      "-",
    ],
    { allowFailure: true, timeoutMs: policy.decodeTimeoutMs },
  );
  return evaluateTechnicalQa(
    input.metadata,
    result.exitCode === 0,
    policy,
    result.stderr.trim(),
  );
}

function aggregateStatus(findings: QaFinding[]): QaSeverity {
  if (findings.some((finding) => finding.severity === "FAIL")) return "FAIL";
  if (findings.some((finding) => finding.severity === "WARNING")) return "WARNING";
  return "PASS";
}

function fail(code: string, message: string, details?: Record<string, unknown>): QaFinding {
  return { code, severity: "FAIL", message, ...(details ? { details } : {}) };
}

function warning(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): QaFinding {
  return { code, severity: "WARNING", message, ...(details ? { details } : {}) };
}
