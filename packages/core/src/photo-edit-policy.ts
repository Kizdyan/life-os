export type PhotoAdjustmentType =
  | "exposure"
  | "contrast"
  | "saturation"
  | "tone_curve"
  | "local_light"
  | "white_balance";

export interface PhotoEditOperation {
  type: PhotoAdjustmentType | "crop";
  amount?: number;
}

export interface PhotoResolution {
  width: number;
  height: number;
}

export interface PhotoEditPlan {
  sourceAssetId: string;
  outputAssetId: string;
  preserveOriginal: true;
  sourceResolution: PhotoResolution;
  outputResolution: PhotoResolution;
  operations: PhotoEditOperation[];
  compositionChangeApproved?: true;
}

const ADJUSTMENTS = new Set<PhotoAdjustmentType>([
  "exposure",
  "contrast",
  "saturation",
  "tone_curve",
  "local_light",
  "white_balance",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseResolution(value: unknown, label: string): PhotoResolution {
  if (!isRecord(value)) throw new Error(`Invalid ${label} resolution`);
  const width = value.width;
  const height = value.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || Number(width) <= 0 || Number(height) <= 0) {
    throw new Error(`Invalid ${label} resolution`);
  }
  return { width: Number(width), height: Number(height) };
}

export function validatePhotoEditPlan(input: unknown): PhotoEditPlan {
  if (!isRecord(input)) throw new Error("Invalid photo edit plan");
  const sourceAssetId = input.sourceAssetId;
  const outputAssetId = input.outputAssetId;
  if (typeof sourceAssetId !== "string" || sourceAssetId.trim() === "") {
    throw new Error("Invalid source asset");
  }
  if (typeof outputAssetId !== "string" || outputAssetId.trim() === "" || outputAssetId === sourceAssetId) {
    throw new Error("Invalid output asset");
  }
  if (input.preserveOriginal !== true) throw new Error("Original asset must be preserved");

  const sourceResolution = parseResolution(input.sourceResolution, "source");
  const outputResolution = parseResolution(input.outputResolution, "output");
  if (
    sourceResolution.width !== outputResolution.width ||
    sourceResolution.height !== outputResolution.height
  ) {
    throw new Error("Output resolution must preserve source resolution");
  }
  if (!Array.isArray(input.operations)) throw new Error("Operations must be an array");

  const operations: PhotoEditOperation[] = input.operations.map((candidate) => {
    if (!isRecord(candidate) || typeof candidate.type !== "string") {
      throw new Error("Invalid operation");
    }
    const type = candidate.type;
    if (type === "crop") {
      if (input.compositionChangeApproved !== true) {
        throw new Error("Crop requires composition approval");
      }
    } else if (!ADJUSTMENTS.has(type as PhotoAdjustmentType)) {
      throw new Error(`Unsupported operation: ${type}`);
    }
    if (candidate.amount !== undefined && !Number.isFinite(candidate.amount)) {
      throw new Error("Operation amount must be finite");
    }
    return candidate.amount === undefined
      ? { type: type as PhotoEditOperation["type"] }
      : { type: type as PhotoEditOperation["type"], amount: Number(candidate.amount) };
  });

  return {
    sourceAssetId,
    outputAssetId,
    preserveOriginal: true,
    sourceResolution,
    outputResolution,
    operations,
    ...(input.compositionChangeApproved === true ? { compositionChangeApproved: true as const } : {}),
  };
}
