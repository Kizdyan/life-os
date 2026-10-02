import type { DiveMContentAssessment } from "./media-brain";
import type { ContentCandidate } from "./media-pipeline";

export interface MediaCandidateRecord {
  candidate: ContentCandidate;
  assessment: DiveMContentAssessment | null;
  observerNotes: string[];
  readyForReview: boolean;
  editorBundlePaths: string[];
  externalId: string | null;
  updatedAt: string;
}

export interface MediaCandidateStore {
  saveCandidate(record: MediaCandidateRecord): Promise<void>;
  getCandidateRecord(candidateId: string): Promise<MediaCandidateRecord | null>;
  getLatestCandidateForProject(projectId: string): Promise<MediaCandidateRecord | null>;
}
