import { describe, expect, it, vi } from 'vitest';
import { readVideoDuration, timelineClipDuration, type VideoMetadataPort } from './personaVideoMetadata';

function port(): { value: VideoMetadataPort; video: { onloadedmetadata: null | (() => void); onerror: null | (() => void); duration: number; src: string } } {
  const video = { onloadedmetadata: null as null | (() => void), onerror: null as null | (() => void), duration: 0, src: '' };
  return {
    video,
    value: {
      createObjectUrl: () => 'blob:test',
      revokeObjectUrl: vi.fn(),
      createVideo: () => video,
      setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
      clearTimeout: timer => clearTimeout(timer),
    },
  };
}

describe('video metadata reader', () => {
  it('rejects a clip that is too short for the editable timeline', () => {
    expect(() => timelineClipDuration(0.001)).toThrow('Видео слишком короткое для монтажа');
    expect(timelineClipDuration(1.27)).toBe(1.27);
  });

  it('returns the finite duration and releases its temporary URL', async () => {
    const fixture = port();
    const duration = readVideoDuration({} as File, fixture.value);
    fixture.video.duration = 2.4;
    fixture.video.onloadedmetadata?.();

    await expect(duration).resolves.toBe(2.4);
    expect(fixture.value.revokeObjectUrl).toHaveBeenCalledWith('blob:test');
  });

  it('fails instead of leaving an import pending when metadata never arrives', async () => {
    vi.useFakeTimers();
    const fixture = port();
    const duration = readVideoDuration({} as File, fixture.value, 25);
    const assertion = expect(duration).rejects.toThrow('Не удалось прочитать метаданные видео вовремя');

    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(fixture.value.revokeObjectUrl).toHaveBeenCalledWith('blob:test');
    vi.useRealTimers();
  });
});
