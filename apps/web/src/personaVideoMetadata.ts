export type VideoMetadataElement = {
  duration: number;
  src: string;
  preload?: string;
  onloadedmetadata: null | (() => void);
  onerror: null | (() => void);
};

export type VideoMetadataPort = {
  createObjectUrl: (file: File) => string;
  revokeObjectUrl: (url: string) => void;
  createVideo: () => VideoMetadataElement;
  setTimeout: (callback: () => void, milliseconds: number) => ReturnType<typeof globalThis.setTimeout>;
  clearTimeout: (timer: ReturnType<typeof globalThis.setTimeout>) => void;
};

const browserPort: VideoMetadataPort = {
  createObjectUrl: file => URL.createObjectURL(file),
  revokeObjectUrl: url => URL.revokeObjectURL(url),
  createVideo: () => document.createElement('video'),
  setTimeout: (callback, milliseconds) => window.setTimeout(callback, milliseconds),
  clearTimeout: timer => window.clearTimeout(timer),
};

export function timelineClipDuration(sourceDuration: number): number {
  if (!Number.isFinite(sourceDuration) || sourceDuration < 0.25) {
    throw new Error('Видео слишком короткое для монтажа');
  }
  return Math.min(10, Number(sourceDuration.toFixed(3)));
}

export function readVideoDuration(file: File, port: VideoMetadataPort = browserPort, timeoutMs = 10_000): Promise<number> {
  const url = port.createObjectUrl(file);
  const video = port.createVideo();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      port.clearTimeout(timeout);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.src = '';
      port.revokeObjectUrl(url);
      outcome();
    };
    const timeout = port.setTimeout(() => finish(() => reject(new Error('Не удалось прочитать метаданные видео вовремя'))), timeoutMs);

    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = video.duration;
      finish(() => Number.isFinite(duration) && duration > 0
        ? resolve(duration)
        : reject(new Error('Не удалось прочитать длительность видео')));
    };
    video.onerror = () => finish(() => reject(new Error('Невозможно открыть видео')));
    video.src = url;
  });
}
