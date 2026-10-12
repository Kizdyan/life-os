import {
  buildCanonicalMediaPlanV2,
  type CanonicalMediaPlanV2,
  type CompositionDecisionV2,
  type MediaPlanLineageV2,
} from "./canonical-media-timeline-v2";
import {
  createContentItemV2,
  type CanonicalContentItemV2,
  type ContentItemV2Input,
  type TargetPublicationType,
} from "./content-format-v2";
import {
  createExecutionIdentityV2,
  routeMediaExecutionV2,
  type ExecutorCapabilitiesV2,
  type MediaBudgetPolicyV2,
  type MediaRoutingDecisionV2,
} from "./media-execution-router-v2";
import { deepFreezeV2 } from "./canonical-hash-v2";

export interface FrozenMediaClaimRequestV2 {
  schemaVersion: 2;
  executionId: string;
  attempt: 1;
  executorId: string;
  contentItemId: string;
  contentRevision: number;
  targetPublicationType: TargetPublicationType;
  timelineVersion: number;
  timelineHash: string;
  outputProfile: string;
  lineage: MediaPlanLineageV2;
}

interface PreparedMediaBaseV2 {
  contentItem: CanonicalContentItemV2;
  plan: CanonicalMediaPlanV2;
}

export type PreparedMediaExecutionV2 =
  | (PreparedMediaBaseV2 & {
    status: "SELECTED_PENDING_CLAIM";
    actionable: false;
    routing: Extract<MediaRoutingDecisionV2, { status: "selected_pending_claim" }>;
    claimRequest: FrozenMediaClaimRequestV2;
  })
  | (PreparedMediaBaseV2 & {
    status: "REVISE_COMPOSITION";
    actionable: false;
    reasons: string[];
  })
  | (PreparedMediaBaseV2 & {
    status: "NO_EXECUTOR";
    actionable: false;
    routing: Extract<MediaRoutingDecisionV2, { status: "no_eligible_executor" }>;
  });

export function prepareMediaExecutionV2(input: {
  contentItem: ContentItemV2Input;
  timelineVersion: number;
  timelineHash?: string;
  outputProfile: string;
  compositionDecision?: CompositionDecisionV2;
  executors: ExecutorCapabilitiesV2[];
  now: string;
  budgetPolicy?: MediaBudgetPolicyV2;
}): PreparedMediaExecutionV2 {
  const contentItem = createContentItemV2(input.contentItem);
  const plan = buildCanonicalMediaPlanV2(contentItem, {
    timelineVersion: input.timelineVersion,
    timelineHash: input.timelineHash,
    compositionDecision: input.compositionDecision,
  });

  if (!plan.preflight.actionable) {
    return {
      status: "REVISE_COMPOSITION",
      actionable: false,
      contentItem,
      plan,
      reasons: [...plan.preflight.reasons],
    };
  }

  const routing = routeMediaExecutionV2({
    contentItem,
    plan,
    executors: input.executors,
    now: input.now,
    budgetPolicy: input.budgetPolicy,
  });
  if (routing.status === "no_eligible_executor") {
    return { status: "NO_EXECUTOR", actionable: false, contentItem, plan, routing };
  }

  const claimRequest: FrozenMediaClaimRequestV2 = deepFreezeV2({
    schemaVersion: 2,
    executionId: createExecutionIdentityV2(plan, input.outputProfile),
    attempt: 1,
    executorId: routing.executorId,
    contentItemId: contentItem.contentItemId,
    contentRevision: contentItem.revision,
    targetPublicationType: contentItem.targetPublicationType,
    timelineVersion: plan.lineage.timelineVersion,
    timelineHash: plan.lineage.timelineHash,
    outputProfile: input.outputProfile,
    lineage: plan.lineage,
  });

  return {
    status: "SELECTED_PENDING_CLAIM",
    actionable: false,
    contentItem,
    plan,
    routing,
    claimRequest,
  };
}
