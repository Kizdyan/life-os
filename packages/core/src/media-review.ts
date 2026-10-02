import type { MediaCapabilities, StyleMemoryObservation } from "./media-brain";
import type { ContentCandidate } from "./media-pipeline";
import {
  createPostApprovalJobs,
  createRevisionJobs,
  type MediaJob,
  type MediaJobStore,
} from "./media-jobs";
import {
  learnFromFeedback,
  type StyleFeedbackInterpreter,
  type StyleMemoryStore,
} from "./style-memory";

export type MediaReviewDecision = "approve" | "revise" | "reject";

export interface MediaReviewInput {
  candidate: ContentCandidate;
  reviewJobId: string;
  decision: MediaReviewDecision;
  feedback: string[];
  capabilities: MediaCapabilities;
  jobStore: MediaJobStore;
  createJobId: () => string;
  now: () => string;
  styleInterpreter?: StyleFeedbackInterpreter | null;
  styleStore?: StyleMemoryStore | null;
}

export interface MediaReviewOutcome {
  decision: MediaReviewDecision;
  releasedJobIds: string[];
  learned: StyleMemoryObservation[];
}

export async function applyMediaReview(
  input: MediaReviewInput,
): Promise<MediaReviewOutcome> {
  const reviewJob = await input.jobStore.get(input.reviewJobId);
  if (!reviewJob) throw new Error("Review job not found");
  if (reviewJob.type !== "await_review") {
    throw new Error("Review job must be await_review");
  }
  if (reviewJob.state !== "waiting_approval") {
    throw new Error("Review job is not waiting for approval");
  }
  if (
    reviewJob.projectId &&
    reviewJob.projectId !== input.candidate.projectId
  ) {
    throw new Error("Review candidate does not match project");
  }

  const now = input.now();
  await input.jobStore.save({
    ...reviewJob,
    state: "completed",
    updatedAt: now,
  });

  const learned: StyleMemoryObservation[] = [];
  if (input.styleInterpreter && input.styleStore) {
    for (const rawFeedback of input.feedback) {
      learned.push(
        ...(await learnFromFeedback({
          feedback: rawFeedback,
          assetId: input.candidate.assetIds[0] ?? input.candidate.id,
          projectId: input.candidate.projectId,
          interpreter: input.styleInterpreter,
          store: input.styleStore,
          now: () => now,
        })),
      );
    }
  }

  let jobs: MediaJob[] = [];
  if (input.decision === "approve") {
    jobs = createPostApprovalJobs({
      assetId: input.candidate.assetIds[0] ?? null,
      projectId: input.candidate.projectId,
      approvedReviewJobId: reviewJob.id,
      now,
      createId: input.createJobId,
    });
  } else if (input.decision === "revise") {
    jobs = createRevisionJobs({
      assetId: input.candidate.assetIds[0] ?? null,
      projectId: input.candidate.projectId,
      completedReviewJobId: reviewJob.id,
      capabilities: input.capabilities,
      now,
      createId: input.createJobId,
    });
  }

  for (const job of jobs) {
    await input.jobStore.enqueue(job);
  }

  return {
    decision: input.decision,
    releasedJobIds: jobs.map((job) => job.id),
    learned,
  };
}
