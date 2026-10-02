import type { CapCutWorkPackage } from "./capcut-work-package";

export interface EditorBundleFile {
  relativePath: string;
  mimeType: string;
  content: string;
}

export function buildCapCutEditorBundle(
  workPackage: CapCutWorkPackage,
): EditorBundleFile[] {
  return [
    {
      relativePath: "edit-plan.json",
      mimeType: "application/json",
      content: JSON.stringify(workPackage, null, 2),
    },
    {
      relativePath: "captions.srt",
      mimeType: "application/x-subrip",
      content: captionsToSrt(workPackage),
    },
    {
      relativePath: "cut-list.csv",
      mimeType: "text/csv",
      content: cutListToCsv(workPackage),
    },
    {
      relativePath: "editor-brief.txt",
      mimeType: "text/plain",
      content: editorBrief(workPackage),
    },
  ];
}

export function captionsToSrt(workPackage: CapCutWorkPackage): string {
  return workPackage.captions
    .map(
      (caption, index) =>
        `${index + 1}\n${formatSrtTime(caption.startMs)} --> ${formatSrtTime(
          caption.endMs,
        )}\n${caption.text}\n`,
    )
    .join("\n");
}

export function cutListToCsv(workPackage: CapCutWorkPackage): string {
  const header = [
    "order",
    "asset_id",
    "source_start_ms",
    "source_end_ms",
    "duration_ms",
    "reason",
  ];
  const rows = workPackage.clips.map((clip) => [
    String(clip.order),
    clip.assetId,
    String(clip.sourceStartMs),
    String(clip.sourceEndMs),
    String(clip.sourceEndMs - clip.sourceStartMs),
    clip.reason,
  ]);

  return [header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}

export function editorBrief(workPackage: CapCutWorkPackage): string {
  const lines = [
    `Project: ${workPackage.projectId}`,
    `Channel: ${workPackage.channel}`,
    `Aspect ratio: ${workPackage.aspectRatio}`,
    `Target duration: ${workPackage.targetDurationMs ?? "open"} ms`,
    `Hook: ${workPackage.hook ?? "not set"}`,
    `Cover: ${workPackage.coverBrief ?? "not set"}`,
    "",
    "DiveM revision notes:",
    ...bulletLines(workPackage.diveMRevisionNotes),
    "",
    "Style Memory notes:",
    ...bulletLines(workPackage.styleMemoryNotes),
    "",
    "Audio cues:",
    ...workPackage.audio.map(
      (cue) => `- ${cue.atMs}ms [${cue.kind}] ${cue.instruction}`,
    ),
    "",
    "Overlays:",
    ...workPackage.overlays.map(
      (cue) =>
        `- ${cue.atMs}ms +${cue.durationMs}ms [${cue.role}] ${cue.text}`,
    ),
  ];

  return lines.join("\n").trimEnd() + "\n";
}

function bulletLines(items: string[]): string[] {
  return items.length ? items.map((item) => `- ${item}`) : ["- none"];
}

function formatSrtTime(milliseconds: number): string {
  const safe = Math.max(0, Math.floor(milliseconds));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const millis = safe % 1000;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":") + `,${String(millis).padStart(3, "0")}`;
}

function csvCell(value: string): string {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
