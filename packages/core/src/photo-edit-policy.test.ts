import { describe, expect, it } from "vitest";
import { validatePhotoEditPlan } from "./photo-edit-policy";

const basePlan = {
  sourceAssetId: "photo-original-1",
  outputAssetId: "photo-variant-1",
  preserveOriginal: true,
  sourceResolution: { width: 4032, height: 3024 },
  outputResolution: { width: 4032, height: 3024 },
  operations: [
    { type: "exposure", amount: 0.25 },
    { type: "contrast", amount: 0.1 },
    { type: "white_balance", amount: -0.05 },
  ],
};

describe("validatePhotoEditPlan", () => {
  it("accepts an original-preserving pixel adjustment plan at source resolution", () => {
    expect(validatePhotoEditPlan(basePlan)).toEqual(basePlan);
  });

  it.each([
    "face_reshape",
    "hair_change",
    "wardrobe_change",
    "object_removal",
    "generative_fill",
  ])("rejects appearance-changing operation %s", (type) => {
    expect(() =>
      validatePhotoEditPlan({ ...basePlan, operations: [{ type, amount: 0.1 }] }),
    ).toThrow(/operation/i);
  });

  it("rejects crop or composition changes without explicit approval", () => {
    expect(() =>
      validatePhotoEditPlan({ ...basePlan, operations: [{ type: "crop" }] }),
    ).toThrow(/composition approval/i);

    expect(
      validatePhotoEditPlan({
        ...basePlan,
        compositionChangeApproved: true,
        operations: [{ type: "crop" }],
      }).compositionChangeApproved,
    ).toBe(true);
  });

  it("rejects destructive overwrite and silent resolution loss", () => {
    expect(() =>
      validatePhotoEditPlan({ ...basePlan, outputAssetId: basePlan.sourceAssetId }),
    ).toThrow(/output asset/i);
    expect(() =>
      validatePhotoEditPlan({
        ...basePlan,
        outputResolution: { width: 1080, height: 810 },
      }),
    ).toThrow(/resolution/i);
  });

  it("rejects non-finite adjustment amounts", () => {
    expect(() =>
      validatePhotoEditPlan({
        ...basePlan,
        operations: [{ type: "exposure", amount: Number.NaN }],
      }),
    ).toThrow(/amount/i);
  });
});
