import type { DiveMContentAssessment } from "./media-brain";
import {
  buildCapCutWorkPackage,
  type AudioCue,
  type CaptionCue,
  type EditClipSelection,
  type OverlayCue,
} from "./capcut-work-package";
import type { ContentCandidate, ContentFactory } from "./media-pipeline";

export interface PlannedContentDraft {
  title: string | null;
  caption: string | null;
  aspectRatio: "9:16" | "16:9" | "1:1" | "4:5";
  targetDurationMs: number | null;
  hook: string | null;
  clips: EditClipSelection[];
  captions: CaptionCue[];
  overlays: OverlayCue[];
  audio: AudioCue[];
  coverBrief: string | null;
  editorNotes: string[];
}

export interface ContentPlanner {
  createPlan(input: {
    projectId: string;
    assetIds: string[];
    channel: "instagram" | "youtube" | "other";
    goal: string;
    styleMemoryNotes: string[];
    formatMemoryNotes: string[];
    lifeOsContext: Record<string, unknown> | null;
  }): Promise<PlannedContentDraft>;

  revisePlan(input: {
    candidate: ContentCandidate;
    assessment: DiveMContentAssessment;
  }): Promise<PlannedContentDraft>;
}

export class ProviderNeutralContentFactory implements ContentFactory {
  constructor(
    private readonly planner: ContentPlanner,
    private readonly createCandidateId: () => string,
    private readonly now: () => string,
  ) {}

  async createDraft(input: {
    projectId: string;
    assetIds: string[];
    channel: "instagram" | "youtube" | "other";
    goal: string;
    styleMemoryNotes: string[];
    formatMemoryNotes?: string[];
    lifeOsContext?: Record<string, unknown> | null;
  }): Promise<ContentCandidate> {
    const plan = await this.planner.createPlan({
      projectId: input.projectId,
      assetIds: input.assetIds,
      channel: input.channel,
      goal: input.goal,
      styleMemoryNotes: input.styleMemoryNotes,
      formatMemoryNotes: input.formatMemoryNotes ?? [],
      lifeOsContext: input.lifeOsContext ?? null,
    });

    return this.toCandidate({
      projectId: input.projectId,
      assetIds: input.assetIds,
      channel: input.channel,
      styleMemoryNotes: input.styleMemoryNotes,
      plan,
      diveMRevisionNotes: [],
    });
  }

  async reviseDraft(input: {
    candidate: ContentCandidate;
    assessment: DiveMContentAssessment;
  }): Promise<ContentCandidate> {
    const plan = await this.planner.revisePlan(input);

    return this.toCandidate({
      projectId: input.candidate.projectId,
      assetIds: input.candidate.assetIds,
      channel: input.candidate.workPackage.channel,
      styleMemoryNotes: input.candidate.workPackage.styleMemoryNotes,
      plan,
      diveMRevisionNotes: input.assessment.revisionSuggestions,
    });
  }

  private toCandidate(input: {
    projectId: string;
    assetIds: string[];
    channel: "instagram" | "youtube" | "other";
    styleMemoryNotes: string[];
    plan: PlannedContentDraft;
    diveMRevisionNotes: string[];
  }): ContentCandidate {
    validateClipAssetIds(input.plan.clips, input.assetIds);

    const workPackage = buildCapCutWorkPackage({
      projectId: input.projectId,
      channel: input.channel,
      aspectRatio: input.plan.aspectRatio,
      targetDurationMs: input.plan.targetDurationMs,
      hook: input.plan.hook,
      clips: input.plan.clips,
      captions: input.plan.captions,
      overlays: input.plan.overlays,
      audio: input.plan.audio,
      coverBrief: input.plan.coverBrief,
      diveMRevisionNotes: input.diveMRevisionNotes,
      styleMemoryNotes: [
        ...input.styleMemoryNotes,
        ...input.plan.editorNotes,
      ],
    });

    return {
      id: this.createCandidateId(),
      projectId: input.projectId,
      assetIds: [...input.assetIds],
      title: input.plan.title,
      caption: input.plan.caption,
      workPackage,
      createdAt: this.now(),
    };
  }
}

function validateClipAssetIds(
  clips: EditClipSelection[],
  allowedAssetIds: string[],
): void {
  const allowed = new Set(allowedAssetIds);
  for (const clip of clips) {
    if (!allowed.has(clip.assetId)) {
      throw new Error(
        `Content planner referenced unknown asset: ${clip.assetId}`,
      );
    }
  }
}
