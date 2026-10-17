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

export function validatePhotoEditPlan(_input: unknown): PhotoEditPlan {
  throw new Error("Not implemented");
}
