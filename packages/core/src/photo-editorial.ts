import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import type { MediaAsset } from "./media-brain";
import type { EditorBundleFile } from "./capcut-export";

export interface PhotoRect { x: number; y: number; width: number; height: number }
export interface PhotoEditorialInput {
  projectId: string;
  asset: MediaAsset;
  /** Pixel coordinates in the orientation-corrected source. */
  crop: PhotoRect;
  /** Required subject/detail bounds supplied by the editorial selection step. */
  protectedRegions: PhotoRect[];
  processing: { exposureEv: number; contrast: number; saturation: number };
  editorial: { angleId: string; angle: string; caption: { angleId: string; assetId: string; text: string } };
  output: { width: number; height: number };
}
export interface PhotoRenderer {
  /** Decode and orient without modifying the supplied bytes. */
  dimensions(source: Uint8Array): Promise<{ width: number; height: number }>;
  /** Apply only the recipe; emit 8-bit RGB/RGBA, non-interlaced PNG. No source writes. */
  render(source: Uint8Array, recipe: Readonly<PhotoEditorialInput>): Promise<Uint8Array>;
}
export interface PhotoEditorialPackage {
  state: "EDITORIAL_READY";
  image: { relativePath: "photo.png"; mimeType: "image/png"; bytes: Uint8Array; sha256: string };
  files: EditorBundleFile[];
}

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const requirePhoto = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
const dimension = (n: number) => Number.isSafeInteger(n) && n > 0 && n <= 16384;
const rect = (r: PhotoRect) => [r.x, r.y, r.width, r.height].every(Number.isSafeInteger) &&
  r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0;
const contains = (a: PhotoRect, b: PhotoRect) => b.x >= a.x && b.y >= a.y &&
  b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height;

/** Single-photo selection -> derivative + linked caption + reproducible evidence. Never publishes. */
export async function buildPhotoEditorialPackage(
  input: PhotoEditorialInput,
  io: { readSource: (asset: Readonly<MediaAsset>) => Promise<Uint8Array>; renderer: PhotoRenderer },
): Promise<PhotoEditorialPackage> {
  // Snapshot caller-owned data before any asynchronous work.
  const plan = structuredClone(input);
  const { asset, crop, output, processing, editorial } = plan;
  requirePhoto(Boolean(plan.projectId.trim()) && Boolean(asset.id.trim()), "Project and asset identity required");
  requirePhoto(asset.source === "own_raw" && Boolean(asset.mimeType?.startsWith("image/")), "Select an original photo");
  requirePhoto(Boolean(asset.provenance.originalProviderPath) && !asset.provenance.destructiveMoveVerified,
    "Immutable original provenance required");
  requirePhoto(Boolean(asset.contentHash), "Source content hash required");
  requirePhoto(editorial.angleId.trim().length > 0 && editorial.angle.trim().length > 0 &&
    editorial.caption.text.trim().length > 0 && editorial.caption.angleId === editorial.angleId &&
    editorial.caption.assetId === asset.id, "Caption must link the selected photo and editorial angle");
  requirePhoto(dimension(output.width) && dimension(output.height) && output.width * output.height <= 32_000_000, "Invalid output dimensions");
  requirePhoto(Object.keys(processing).sort().join() === "contrast,exposureEv,saturation" &&
    Number.isFinite(processing.exposureEv) && Math.abs(processing.exposureEv) <= 0.5 &&
    Number.isFinite(processing.contrast) && Math.abs(processing.contrast) <= 0.1 &&
    Number.isFinite(processing.saturation) && Math.abs(processing.saturation) <= 0.1,
  "Processing exceeds restrained exposure/contrast/saturation limits");
  const original = new Uint8Array(await io.readSource(structuredClone(asset)));
  const sourceHash = hash(original);
  const providerHash = asset.contentHash!.toLowerCase();
  const algorithm = /^[a-f0-9]{64}$/.test(providerHash) ? "sha256" :
    /^[a-f0-9]{32}$/.test(providerHash) ? "md5" : null;
  requirePhoto(algorithm !== null && createHash(algorithm ?? "sha256").update(original).digest("hex") === providerHash,
    "Source bytes do not match canonical content hash");
  const size = await io.renderer.dimensions(new Uint8Array(original));
  requirePhoto(dimension(size.width) && dimension(size.height) && rect(crop) &&
    contains({ x: 0, y: 0, ...size }, crop), "Crop is outside source bounds");
  requirePhoto(crop.width * crop.height >= size.width * size.height * 0.8, "Crop removes more than 20% of source detail");
  requirePhoto(plan.protectedRegions.length > 0 && plan.protectedRegions.every(r => rect(r) && contains(crop, r)),
    "Crop must preserve all protected subject/detail regions");
  requirePhoto(crop.width * output.height === crop.height * output.width &&
    output.width <= crop.width && output.height <= crop.height, "Export must preserve crop ratio without upscaling");
  const bytes = new Uint8Array(await io.renderer.render(new Uint8Array(original), structuredClone(plan)));
  validatePhotoPng(bytes, output);
  requirePhoto(hash(await io.readSource(structuredClone(asset))) === sourceHash, "Source changed during processing");
  const exportHash = hash(bytes);
  const manifest = {
    version: 1, projectId: plan.projectId,
    source: { assetId: asset.id, provider: asset.provider, providerId: asset.providerId,
      path: asset.providerPath, provenance: asset.provenance, providerContentHash: asset.contentHash, sha256: sourceHash, ...size },
    crop, protectedRegions: plan.protectedRegions, processing, editorial,
    export: { relativePath: "photo.png", mimeType: "image/png", ...output, sha256: exportHash },
    qa: { decision: "pass", checks: ["source_unchanged", "restrained_processing", "protected_composition", "no_upscale", "caption_linkage", "png_integrity"] },
  };
  return { state: "EDITORIAL_READY", image: { relativePath: "photo.png", mimeType: "image/png", bytes, sha256: exportHash },
    files: [
      { relativePath: "photo-editorial.json", mimeType: "application/json", content: JSON.stringify(manifest, null, 2) + "\n" },
      { relativePath: "caption.txt", mimeType: "text/plain", content: editorial.caption.text.trim() + "\n" },
    ] };
}

/** Validate actual PNG structure, checksums, dimensions and decoded scanlines. */
export function validatePhotoPng(bytes: Uint8Array, expected: { width: number; height: number }): void {
  const b = Buffer.from(bytes);
  requirePhoto(b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "Invalid PNG signature");
  let offset = 8, channels = 0, ended = false, dataStarted = false, dataEnded = false, paletteSeen = false;
  const data: Buffer[] = [];
  while (offset < b.length) {
    requirePhoto(offset + 12 <= b.length && !ended, "Truncated PNG or trailing bytes");
    const length = b.readUInt32BE(offset);
    requirePhoto(length <= b.length - offset - 12, "Truncated PNG chunk");
    const type = b.toString("ascii", offset + 4, offset + 8);
    const body = b.subarray(offset + 8, offset + 8 + length);
    requirePhoto(crc32(b.subarray(offset + 4, offset + 8 + length)) === b.readUInt32BE(offset + 8 + length), "PNG checksum mismatch");
    if (offset === 8) {
      requirePhoto(type === "IHDR" && length === 13, "Missing PNG header");
      requirePhoto(dimension(expected.width) && dimension(expected.height) && expected.width * expected.height <= 32_000_000 &&
        b.readUInt32BE(offset + 8) === expected.width && b.readUInt32BE(offset + 12) === expected.height,
      "Export dimensions mismatch");
      requirePhoto(body[8] === 8 && [2, 6].includes(body[9]) && body[10] === 0 && body[11] === 0 && body[12] === 0,
        "Unsupported PNG encoding");
      channels = body[9] === 2 ? 3 : 4;
    } else if (type === "PLTE") {
      requirePhoto(!paletteSeen && !dataStarted && length > 0 && length <= 768 && length % 3 === 0,
        "Invalid PNG palette");
      paletteSeen = true;
    } else if (type === "IDAT") {
      requirePhoto(!dataEnded, "Nonconsecutive PNG data");
      dataStarted = true; data.push(body);
    } else if (type === "IEND") {
      requirePhoto(length === 0 && dataStarted, "Invalid PNG end"); ended = true;
    } else {
      requirePhoto(type !== "IHDR" && /^[a-z]/.test(type), "Unsupported PNG chunk");
      if (dataStarted) dataEnded = true;
    }
    offset += length + 12;
  }
  requirePhoto(ended, "Missing PNG end");
  const stride = expected.width * channels + 1;
  const decoded = inflateSync(Buffer.concat(data), { maxOutputLength: stride * expected.height });
  requirePhoto(decoded.length === stride * expected.height, "PNG pixel data length mismatch");
  for (let y = 0; y < expected.height; y++) requirePhoto(decoded[y * stride] <= 4, "Invalid PNG scanline filter");
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
