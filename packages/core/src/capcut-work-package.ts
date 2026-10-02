export type ContentChannel = "instagram" | "youtube" | "other";

export interface EditClipSelection {
  assetId: string;
  sourceStartMs: number;
  sourceEndMs: number;
  order: number;
  reason: string;
}

export interface CaptionCue {
  startMs: number;
  endMs: number;
  text: string;
}

export interface OverlayCue {
  atMs: number;
  durationMs: number;
  text: string;
  role: "hook" | "context" | "cta" | "label";
}

export interface AudioCue {
  atMs: number;
  kind: "music" | "voice" | "ambient" | "effect";
  instruction: string;
}

export interface CapCutWorkPackage {
  version: 1;
  projectId: string;
  channel: ContentChannel;
  aspectRatio: "9:16" | "16:9" | "1:1" | "4:5";
  targetDurationMs: number | null;
  hook: string | null;
  clips: EditClipSelection[];
  captions: CaptionCue[];
  overlays: OverlayCue[];
  audio: AudioCue[];
  coverBrief: string | null;
  diveMRevisionNotes: string[];
  styleMemoryNotes: string[];
  approvalRequired: true;
}

export interface BuildCapCutPackageInput
  extends Omit<CapCutWorkPackage, "version" | "approvalRequired"> {}

export function buildCapCutWorkPackage(
  input: BuildCapCutPackageInput,
): CapCutWorkPackage {
  const sortedClips = [...input.clips].sort((a, b) => a.order - b.order);
  for (const clip of sortedClips) {
    if (clip.sourceStartMs < 0 || clip.sourceEndMs <= clip.sourceStartMs) {
      throw new Error(`Invalid clip range for asset ${clip.assetId}`);
    }
  }

  return {
    version: 1,
    ...input,
    clips: sortedClips,
    captions: [...input.captions].sort((a, b) => a.startMs - b.startMs),
    overlays: [...input.overlays].sort((a, b) => a.atMs - b.atMs),
    audio: [...input.audio].sort((a, b) => a.atMs - b.atMs),
    approvalRequired: true,
  };
}

export function capCutPackageToJson(workPackage: CapCutWorkPackage): string {
  return JSON.stringify(workPackage, null, 2);
}
