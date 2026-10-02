export type MediaSection = "inbox" | "references" | "projects";

export type MediaAssetSource = "own_raw" | "reference" | "generated";

export type MediaAssetStatus =
  | "ingested"
  | "analyzing"
  | "in_project"
  | "ready_for_review"
  | "approved"
  | "published"
  | "archived"
  | "rejected"
  | "superseded";

export type StyleDimension =
  | "editing"
  | "pacing"
  | "framing"
  | "color"
  | "typography"
  | "captions"
  | "hook"
  | "sound"
  | "narrative"
  | "wardrobe"
  | "mood"
  | "dislike";

export type StyleSignal =
  | "published"
  | "explicit_approval"
  | "specific_feedback"
  | "accepted_draft"
  | "saved_reference"
  | "inferred";

export interface MediaAsset {
  id: string;
  provider: string;
  providerId: string | null;
  providerPath: string;
  contentHash: string | null;
  mimeType: string | null;
  source: MediaAssetSource;
  section: MediaSection;
  status: MediaAssetStatus;
  projectId: string | null;
  createdAt: string | null;
  importedAt: string;
  provenance: {
    originalProviderPath: string;
    originalProviderId: string | null;
    destructiveMoveVerified: boolean;
  };
}

export interface MediaStorageEntry {
  id: string | null;
  path: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  modifiedAt: string | null;
  contentHash: string | null;
}

export interface MediaStorageProvider {
  readonly id: string;
  list(path: string): Promise<MediaStorageEntry[]>;
  stat(path: string): Promise<MediaStorageEntry | null>;
  createFolder(path: string): Promise<void>;
  upload(path: string, bytes: Uint8Array, mimeType?: string | null): Promise<void>;
  move(fromPath: string, toPath: string): Promise<void>;
  copy(fromPath: string, toPath: string): Promise<void>;
  archive(path: string, archivePath: string): Promise<void>;
}

export interface MediaCapabilities {
  contentAutonomy: "low" | "standard" | "high";
  useDiveMPrePublishAnalysis: boolean;
  styleMemory: "off" | "standard" | "personal";
  autoEditVideo: boolean;
  autoGenerateCarousels: boolean;
  autoGenerateVisuals: boolean;
  approvalBeforePublish: boolean;
  lifeOsContextEnabled: boolean;
  /** Personal-only seed formats. Optional for backward-compatible profiles. */
  usePersonalFormatSeed?: boolean;
}

export const DEFAULT_MEDIA_CAPABILITIES: MediaCapabilities = {
  contentAutonomy: "standard",
  useDiveMPrePublishAnalysis: false,
  styleMemory: "standard",
  autoEditVideo: false,
  autoGenerateCarousels: false,
  autoGenerateVisuals: false,
  approvalBeforePublish: true,
  lifeOsContextEnabled: false,
  usePersonalFormatSeed: false,
};

export const PERSONAL_HIGH_AUTONOMY_MEDIA: MediaCapabilities = {
  contentAutonomy: "high",
  useDiveMPrePublishAnalysis: true,
  styleMemory: "personal",
  autoEditVideo: true,
  autoGenerateCarousels: true,
  autoGenerateVisuals: true,
  approvalBeforePublish: true,
  lifeOsContextEnabled: true,
  usePersonalFormatSeed: true,
};

const STYLE_SIGNAL_WEIGHT: Record<StyleSignal, number> = {
  published: 1,
  explicit_approval: 0.9,
  specific_feedback: 0.82,
  accepted_draft: 0.7,
  saved_reference: 0.45,
  inferred: 0.2,
};

export function styleSignalWeight(signal: StyleSignal): number {
  return STYLE_SIGNAL_WEIGHT[signal];
}

export interface StyleMemoryObservation {
  assetId: string;
  dimension: StyleDimension;
  value: string;
  signal: StyleSignal;
  weight: number;
  createdAt: string;
}

export function makeStyleObservation(input: Omit<StyleMemoryObservation, "weight">): StyleMemoryObservation {
  return { ...input, weight: styleSignalWeight(input.signal) };
}

export interface DiveMContentAssessmentRequest {
  profileId: string;
  projectId: string;
  assetIds: string[];
  channel: "instagram" | "youtube" | "other";
  goal: string;
  currentFocus: string[];
  proposedHook?: string | null;
  proposedStructure?: string[] | null;
  evidence?: Record<string, number>;
}

export interface DiveMContentAssessment {
  fit: "strong" | "mixed" | "weak" | "unknown";
  notes: string[];
  weakTransition:
    | "visibility"
    | "contact"
    | "interest"
    | "opportunity"
    | "result"
    | null;
  revisionSuggestions: string[];
  confidence: number;
  evidenceState: "sufficient" | "partial" | "insufficient";
}

export interface DiveMStrategyService {
  assessContent(input: DiveMContentAssessmentRequest): Promise<DiveMContentAssessment>;
}

export interface MediaProject {
  id: string;
  title: string;
  status: MediaAssetStatus;
  assetIds: string[];
  channelTargets: Array<"instagram" | "youtube" | "other">;
  approvalRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export function mediaSectionPath(root: string, section: MediaSection): string {
  const trimmed = root.replace(/\/+$/, "") || "/";
  const names: Record<MediaSection, string> = {
    inbox: "Inbox",
    references: "References",
    projects: "Projects",
  };
  return trimmed === "/" ? `/${names[section]}` : `${trimmed}/${names[section]}`;
}

export function mediaAssetKey(provider: string, providerPath: string, contentHash?: string | null): string {
  const normalizedPath = providerPath.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  return [provider, normalizedPath, contentHash || "no-hash"].join(":");
}

export function canPublishWithoutApproval(capabilities: MediaCapabilities): boolean {
  return capabilities.approvalBeforePublish === false;
}
