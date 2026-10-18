import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { buildPhotoEditorialPackage, validatePhotoPng, type PhotoEditorialInput } from "./photo-editorial";

function chunk(type: string, body: Buffer): Buffer {
  const data = Buffer.concat([Buffer.from(type), body]);
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const prefix = Buffer.alloc(4), suffix = Buffer.alloc(4);
  prefix.writeUInt32BE(body.length); suffix.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([prefix, data, suffix]);
}
function png(): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2); header.writeUInt32BE(2, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.alloc(14))), chunk("IEND", Buffer.alloc(0))]);
}
const plan = (): PhotoEditorialInput => ({
  projectId: "project", asset: { id: "photo", provider: "disk", providerId: "original", providerPath: "/raw/photo.png",
    contentHash: createHash("sha256").update(png()).digest("hex"), mimeType: "image/png", source: "own_raw", section: "inbox", status: "ingested",
    projectId: null, createdAt: null, importedAt: "2026-10-16", provenance: { originalProviderPath: "/raw/photo.png",
      originalProviderId: "original", destructiveMoveVerified: false } },
  crop: { x: 0, y: 0, width: 2, height: 2 }, protectedRegions: [{ x: 0, y: 0, width: 1, height: 1 }],
  processing: { exposureEv: 0, contrast: 0, saturation: 0 },
  editorial: { angleId: "angle", angle: "A quiet rehearsal", caption: { angleId: "angle", assetId: "photo", text: "Before the curtain." } },
  output: { width: 2, height: 2 },
});
const io = () => ({ readSource: async () => png(), renderer: {
  dimensions: async () => ({ width: 2, height: 2 }), render: async (_source: Uint8Array) => png(),
} });

describe("photo editorial lane", () => {
  it("exports reproducible linked evidence without mutating the input or original", async () => {
    const input = plan(), before = structuredClone(input), source = png();
    const adapter = io(); adapter.readSource = async () => source;
    adapter.renderer.render = async bytes => { bytes.fill(0); return png(); };
    const first = await buildPhotoEditorialPackage(input, adapter);
    const second = await buildPhotoEditorialPackage(input, adapter);
    expect(first).toEqual(second);
    expect(first.state).toBe("EDITORIAL_READY");
    expect(input).toEqual(before); expect(source).toEqual(png());
    expect(JSON.parse(first.files[0].content).editorial.caption.assetId).toBe("photo");
    expect(first.files[1].content).toBe("Before the curtain.\n");
  });
  it.each(["crop", "region", "processing", "caption", "upscale", "nan", "reference"])("blocks invalid %s", async failure => {
    const input = plan();
    if (failure === "crop") input.crop.width = 1;
    if (failure === "region") input.protectedRegions[0].x = 2;
    if (failure === "processing") input.processing.exposureEv = 1;
    if (failure === "caption") input.editorial.caption.angleId = "other";
    if (failure === "upscale") input.output = { width: 4, height: 4 };
    if (failure === "nan") input.processing.contrast = NaN;
    if (failure === "reference") input.asset.source = "reference";
    await expect(buildPhotoEditorialPackage(input, io())).rejects.toThrow();
  });
  it("rejects source bytes that disagree with canonical intake", async () => {
    const input = plan(); input.asset.contentHash = "0".repeat(64);
    await expect(buildPhotoEditorialPackage(input, io())).rejects.toThrow("canonical content hash");
  });
  it("blocks changed sources", async () => {
    const adapter = io(); let reads = 0;
    adapter.readSource = async () => ++reads === 1 ? png() : Buffer.from("changed");
    await expect(buildPhotoEditorialPackage(plan(), adapter)).rejects.toThrow("Source changed");
  });
  it("blocks corrupt, truncated, trailing and incorrectly sized exports", () => {
    const corrupted = png(); corrupted[45] ^= 1;
    for (const bytes of [corrupted, png().subarray(0, 40), Buffer.concat([png(), Buffer.from([0])])]) {
      expect(() => validatePhotoPng(bytes, { width: 2, height: 2 })).toThrow();
    }
    expect(() => validatePhotoPng(png(), { width: 4, height: 4 })).toThrow("dimensions");
  });
  it("accepts optional truecolor palettes and rejects malformed palettes", () => {
    const image = png(), palette = chunk("PLTE", Buffer.from([0, 0, 0]));
    const withPalette = (parts: Buffer[], offset = 33) =>
      Buffer.concat([image.subarray(0, offset), ...parts, image.subarray(offset)]);
    expect(() => validatePhotoPng(withPalette([palette]), { width: 2, height: 2 })).not.toThrow();
    for (const invalid of [
      withPalette([palette, palette]),
      withPalette([palette], image.length - 12),
      ...[0, 2, 771].map(length => withPalette([chunk("PLTE", Buffer.alloc(length))])),
    ]) {
      expect(() => validatePhotoPng(invalid, { width: 2, height: 2 })).toThrow("Invalid PNG palette");
    }
  });
  it("does not mark a bad render ready", async () => {
    const adapter = io(); adapter.renderer.render = async () => Buffer.from("bad render");
    await expect(buildPhotoEditorialPackage(plan(), adapter)).rejects.toThrow("PNG signature");
  });
});
