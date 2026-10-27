export type PersonaMediaKind = "image" | "video";
export type PersonaMediaOrientation = "portrait" | "landscape" | "square" | "unknown";
export type PersonaMediaAvailability = "available" | "unavailable_in_browser" | "not_applicable";

export interface PersonaMediaProbe {
  kind: PersonaMediaKind;
  name: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  durationSec: number | null;
  fps: number | null;
  audio: PersonaMediaAvailability;
  exposure: PersonaMediaAvailability;
}

export interface PersonaMediaAssessment extends PersonaMediaProbe {
  orientation: PersonaMediaOrientation;
  status: "ready_for_edit_plan" | "needs_vertical_edit" | "ready_for_safe_photo_export" | "insufficient_metadata";
  safeOutput: "editor_package_only" | "contained_canvas_jpeg" | "none";
  notes: string[];
}

/**
 * Classifies measured browser metadata only. It never implies that FPS,
 * exposure or audio tracks were measured when the browser cannot expose them.
 */
export function assessPersonaMedia(probe: PersonaMediaProbe): PersonaMediaAssessment {
  const orientation = orientationFor(probe.width, probe.height);
  const notes = ["Исходный файл не изменён."];
  if (!isPositive(probe.width) || !isPositive(probe.height)) {
    return { ...probe, orientation, status: "insufficient_metadata", safeOutput: "none", notes: [...notes, "Браузер не предоставил размеры исходника."] };
  }
  if (probe.kind === "image") {
    return {
      ...probe,
      orientation,
      status: "ready_for_safe_photo_export",
      safeOutput: "contained_canvas_jpeg",
      notes: [...notes, "Фото можно экспортировать на вертикальный холст 9:16.", "без обрезки и изменения геометрии"],
    };
  }
  if (orientation === "portrait") {
    return {
      ...probe,
      orientation,
      status: "ready_for_edit_plan",
      safeOutput: "editor_package_only",
      notes: [...notes, "Видео пригодно для вертикального edit plan; этот браузер не выполняет видеорендер."],
    };
  }
  return {
    ...probe,
    orientation,
    status: "needs_vertical_edit",
    safeOutput: "editor_package_only",
    notes: [...notes, "Нужен проверенный видеоредактор для вертикального кадрирования; автоматический рендер не выполнялся."],
  };
}

/** Reads real local-file dimensions and duration without uploading the file. */
export async function probePersonaMediaFile(file: File): Promise<PersonaMediaProbe> {
  if (file.type.startsWith("image/")) {
    const image = await loadImage(URL.createObjectURL(file));
    return {
      kind: "image",
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      byteSize: file.size,
      width: image.width,
      height: image.height,
      durationSec: null,
      fps: null,
      audio: "not_applicable",
      exposure: "unavailable_in_browser",
    };
  }
  if (file.type.startsWith("video/")) {
    const video = await loadVideo(URL.createObjectURL(file));
    return {
      kind: "video",
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      byteSize: file.size,
      width: video.width,
      height: video.height,
      durationSec: video.durationSec,
      fps: null,
      audio: "unavailable_in_browser",
      exposure: "unavailable_in_browser",
    };
  }
  throw new Error("Persona accepts image or video files only");
}

/**
 * Produces a real JPEG for portrait delivery using contain, never crop. The
 * source pixels are not written back or otherwise modified.
 */
export async function exportContainedVerticalPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Only images can be exported in the browser");
  const image = await loadImage(URL.createObjectURL(file));
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable in this browser");
  context.fillStyle = "#151515";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  context.drawImage(image.element, Math.round((canvas.width - width) / 2), Math.round((canvas.height - height) / 2), width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("JPEG export failed")), "image/jpeg", 0.92);
  });
}

export function downloadPersonaMedia(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function orientationFor(width: number, height: number): PersonaMediaOrientation {
  if (!isPositive(width) || !isPositive(height)) return "unknown";
  if (width === height) return "square";
  return height > width ? "portrait" : "landscape";
}

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

async function loadImage(url: string): Promise<{ element: HTMLImageElement; width: number; height: number }> {
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Image metadata could not be read"));
      element.src = url;
    });
    return { element: image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadVideo(url: string): Promise<{ width: number; height: number; durationSec: number | null }> {
  try {
    return await new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        durationSec: Number.isFinite(video.duration) ? video.duration : null,
      });
      video.onerror = () => reject(new Error("Video metadata could not be read"));
      video.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
