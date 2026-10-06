import type { Transcript, TranscriptSegment } from "./contracts";
import { VideoPipelineError } from "./contracts";

export interface CaptionTextMeasurer {
  measureWidthPx(text: string): Promise<number>;
}

export interface CaptionVisualPreset {
  id: "vertical" | "instagram-reels" | string;
  frameWidthPx: number;
  frameHeightPx: number;
  safeWidthPx: number;
  fontName: string;
  fontSizePx: number;
  marginLeftPx: number;
  marginRightPx: number;
  marginBottomPx: number;
  outlinePx: number;
  maxLines: number;
  maxCueDurationMs: number;
  maxWordsPerCue: number;
}

export const DEFAULT_CAPTION_PRESET: CaptionVisualPreset = {
  id: "vertical",
  frameWidthPx: 1080,
  frameHeightPx: 1920,
  safeWidthPx: 900,
  fontName: "Arial",
  fontSizePx: 64,
  marginLeftPx: 90,
  marginRightPx: 90,
  marginBottomPx: 430,
  outlinePx: 4,
  maxLines: 2,
  maxCueDurationMs: 3000,
  maxWordsPerCue: 7,
};

export const INSTAGRAM_CAPTION_PRESET: CaptionVisualPreset = {
  ...DEFAULT_CAPTION_PRESET,
  id: "instagram-reels",
  safeWidthPx: 864,
  marginLeftPx: 100,
  marginRightPx: 116,
  marginBottomPx: 520,
};

export async function layoutCaptionTranscript(
  transcript: Transcript,
  measurer: CaptionTextMeasurer,
  policy: Partial<CaptionVisualPreset> = {},
): Promise<Transcript> {
  const resolved = { ...DEFAULT_CAPTION_PRESET, ...policy };
  const segments: TranscriptSegment[] = [];
  for (const source of transcript.segments) {
    const words = source.text.trim().split(/\s+/u).filter(Boolean);
    if (words.length === 0) continue;
    const durationMs = source.endMs - source.startMs;
    const targetCueCount = Math.max(
      1,
      Math.ceil(durationMs / resolved.maxCueDurationMs),
      Math.ceil(words.length / resolved.maxWordsPerCue),
    );
    const wordsPerCue = Math.max(1, Math.ceil(words.length / targetCueCount));
    const cues: string[][] = [];
    let cursor = 0;
    while (cursor < words.length) {
      let cueWords = words.slice(cursor, cursor + wordsPerCue);
      let lines = await wrapLines(cueWords, measurer, resolved.safeWidthPx);
      while (lines.length > resolved.maxLines && cueWords.length > 1) {
        cueWords = cueWords.slice(0, -1);
        lines = await wrapLines(cueWords, measurer, resolved.safeWidthPx);
      }
      if (lines.length > resolved.maxLines) {
        throw new VideoPipelineError(
          "INVALID_TRANSCRIPT",
          "Caption word cannot fit inside the configured pixel-safe width",
          { word: cueWords[0], safeWidthPx: resolved.safeWidthPx },
        );
      }
      cues.push(lines);
      cursor += cueWords.length;
    }

    const weights = cues.map((lines) => Math.max(1, lines.join(" ").replace(/\s/gu, "").length));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let elapsedWeight = 0;
    cues.forEach((lines, index) => {
      const startMs = Math.round(source.startMs + (durationMs * elapsedWeight) / totalWeight);
      elapsedWeight += weights[index];
      const endMs = index === cues.length - 1
        ? source.endMs
        : Math.round(source.startMs + (durationMs * elapsedWeight) / totalWeight);
      segments.push({
        startMs,
        endMs,
        text: lines.join("\n"),
        confidence: source.confidence,
      });
    });
  }
  return { ...transcript, segments };
}

async function wrapLines(
  words: string[],
  measurer: CaptionTextMeasurer,
  safeWidthPx: number,
): Promise<string[]> {
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if ((await measurer.measureWidthPx(candidate)) <= safeWidthPx) {
      current = candidate;
      continue;
    }
    if (!current) return [word, "", ""];
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

export function captionsToAss(
  transcript: Transcript,
  preset: CaptionVisualPreset = DEFAULT_CAPTION_PRESET,
): string {
  const style = [
    "Style: Default",
    preset.fontName,
    preset.fontSizePx,
    "&H00FFFFFF",
    "&H000000FF",
    "&H00000000",
    "&H00000000",
    "-1",
    "0",
    "0",
    "0",
    "100",
    "100",
    "0",
    "0",
    "1",
    preset.outlinePx,
    "0",
    "2",
    preset.marginLeftPx,
    preset.marginRightPx,
    preset.marginBottomPx,
    "1",
  ].join(",");
  const events = transcript.segments.map((segment) =>
    `Dialogue: 0,${formatAssTime(segment.startMs)},${formatAssTime(segment.endMs)},Default,,0,0,0,,${escapeAssText(segment.text)}`,
  );
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${preset.frameWidthPx}`,
    `PlayResY: ${preset.frameHeightPx}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    style,
    "",
    "[Events]",
    "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
    ...events,
    "",
  ].join("\n");
}

function formatAssTime(milliseconds: number): string {
  const centiseconds = Math.max(0, Math.round(milliseconds / 10));
  const hours = Math.floor(centiseconds / 360_000);
  const minutes = Math.floor((centiseconds % 360_000) / 6000);
  const seconds = Math.floor((centiseconds % 6000) / 100);
  const remainder = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(remainder).padStart(2, "0")}`;
}

function escapeAssText(text: string): string {
  return text
    .replace(/\\/gu, "\\\\")
    .replace(/[{}]/gu, "")
    .replace(/\r?\n/gu, "\\N");
}
