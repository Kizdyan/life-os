import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProcessResult, ProcessRunner } from "./contracts";
import { hashFileSha256 } from "./file-hash";
import type { TranscriptProviderInput } from "./transcription";
import { WhisperCppTranscriptProvider } from "./whisper-cpp";
import { createFixtureDirectory } from "../test/fixture";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("WhisperCppTranscriptProvider", () => {
  it("maps full Whisper JSON to a provider-neutral Russian transcript", async () => {
    const fixture = await providerFixture(validWhisperJson());

    const result = await fixture.provider.transcribe(fixture.input);

    expect(result.transcript).toEqual({
      language: "ru",
      provider: "whisper-cpp-local",
      confidence: 0.85,
      limitations: [
        "Confidence is derived from mean Whisper token probabilities",
        "Speaker diarization is not available",
      ],
      segments: [
        { startMs: 520, endMs: 1840, text: "Привет, это тест.", confidence: 0.85 },
      ],
    });
    expect(result.diagnosticArtifacts).toEqual([join(fixture.directory, "whisper-result.json")]);
    expect(result.providerDetails).toMatchObject({
      executablePath: fixture.executablePath,
      modelPath: fixture.modelPath,
      language: "ru",
      threads: 4,
      modelSha256: await hashFileSha256(fixture.modelPath),
    });
    expect(JSON.parse(await readFile(result.diagnosticArtifacts[0], "utf8"))).toEqual(
      validWhisperJson(),
    );
    expect(fixture.runner.lastArgs).toEqual([
      "-m",
      fixture.modelPath,
      "-f",
      fixture.audioPath,
      "-l",
      "ru",
      "-t",
      "4",
      "-ojf",
      "-of",
      join(fixture.directory, "whisper-result"),
      "-np",
    ]);
  });

  it.each([
    ["empty", { ...validWhisperJson(), transcription: [] }],
    [
      "overlapping",
      {
        ...validWhisperJson(),
        transcription: [
          segment(0, 1_000, "Раз", 0.9),
          segment(900, 1_500, "Два", 0.8),
        ],
      },
    ],
    ["malformed", { ...validWhisperJson(), transcription: [{ text: "Нет времени" }] }],
  ])("rejects %s provider output before it becomes canonical", async (_name, output) => {
    const fixture = await providerFixture(output);

    await expect(fixture.provider.transcribe(fixture.input)).rejects.toMatchObject({
      code: "INVALID_TRANSCRIPT",
    });
  });
});

async function providerFixture(output: unknown): Promise<{
  directory: string;
  executablePath: string;
  modelPath: string;
  audioPath: string;
  provider: WhisperCppTranscriptProvider;
  runner: WhisperRunner;
  input: TranscriptProviderInput;
}> {
  const directory = await createFixtureDirectory();
  directories.push(directory);
  const artifactDirectory = join(directory, "run");
  await mkdir(artifactDirectory);
  const executablePath = join(directory, "whisper-cli.exe");
  const modelPath = join(directory, "ggml-small.bin");
  const audioPath = join(directory, "stt-input.wav");
  await writeFile(executablePath, "test executable");
  await writeFile(modelPath, "test model weights");
  await writeFile(audioPath, "test audio");
  const runner = new WhisperRunner(output);
  const provider = new WhisperCppTranscriptProvider({
    executablePath,
    modelPath,
    language: "ru",
    threads: 4,
    runner,
  });
  return {
    directory: artifactDirectory,
    executablePath,
    modelPath,
    audioPath,
    provider,
    runner,
    input: { audioPath, language: "ru", artifactDirectory, runner },
  };
}

class WhisperRunner implements ProcessRunner {
  lastArgs: string[] = [];

  constructor(private readonly output: unknown) {}

  async run(_command: string, args: string[]): Promise<ProcessResult> {
    this.lastArgs = [...args];
    const outputBase = args[args.indexOf("-of") + 1];
    await writeFile(`${outputBase}.json`, `${JSON.stringify(this.output, null, 2)}\n`, "utf8");
    return { exitCode: 0, stdout: "", stderr: "" };
  }
}

function validWhisperJson(): Record<string, unknown> {
  return {
    model: { type: "small", multilingual: true },
    result: { language: "ru" },
    transcription: [segment(520, 1_840, " Привет, это тест. ", 0.85)],
  };
}

function segment(from: number, to: number, text: string, probability: number) {
  return {
    timestamps: { from: "00:00:00,000", to: "00:00:01,000" },
    offsets: { from, to },
    text,
    tokens: [
      { text: "token-1", p: probability - 0.05 },
      { text: "token-2", p: probability + 0.05 },
    ],
  };
}
