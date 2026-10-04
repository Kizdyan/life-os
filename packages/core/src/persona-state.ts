export type PersonaPlatform = "instagram" | "vk" | "youtube";
export type PersonaApprovalDecision = "approved" | "rework" | "deferred" | "rejected";

export interface PersonaApprovalRecord {
  candidateId: string;
  revision: number;
  decision: PersonaApprovalDecision;
  reason: string | null;
  decidedAt: string;
}

export interface PersonaPlatformVariant {
  id: string;
  candidateId: string;
  revision: number;
  platform: PersonaPlatform;
  mediaAssetId: string;
  title: string | null;
  caption: string | null;
  coverAssetId: string | null;
  createdAt: string;
}

export type PersonaPublicationState =
  | "approved" | "scheduled" | "publishing" | "published" | "verified"
  | "retry_wait" | "blocked" | "failed";

export interface PersonaPublicationJob {
  id: string;
  candidateId: string;
  platform: PersonaPlatform;
  state: PersonaPublicationState;
  idempotencyKey: string;
  scheduledAt: string | null;
  externalId: string | null;
  externalUrl: string | null;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersonaMetricSnapshot {
  publicationJobId: string;
  platform: PersonaPlatform;
  capturedAt: string;
  views?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  saves?: number;
  shares?: number;
  averageWatchSeconds?: number;
  followersGained?: number;
  raw: Record<string, unknown>;
}

export interface PersonaLearningSignal {
  candidateId: string;
  platform: PersonaPlatform;
  featureKey: string;
  score: number;
  confidence: number;
  evidenceCount: number;
  createdAt: string;
}
