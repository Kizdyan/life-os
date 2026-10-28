import { describe, expect, it } from 'vitest';
import {
  createPersonaTimelineSettings,
  matchesPersonaTimelineSource,
  constrainPersonaTimelineClip,
  validatePersonaTimelineSettings,
} from './personaTimelineSettings';

describe('Persona timeline settings', () => {
  it('persists independent trims, order, and output settings for a project', () => {
    const timeline = createPersonaTimelineSettings([
      { id: 'blue', name: 'blue.mp4', bytes: 1200, mime: 'video/mp4', lastModified: 10, sourceDuration: 2, startSec: 0.4, durationSec: 0.8 },
      { id: 'red', name: 'red.mp4', bytes: 1300, mime: 'video/mp4', lastModified: 11, sourceDuration: 2, startSec: 0.2, durationSec: 0.9 },
    ], { width: 1080, height: 1920, fps: 30 });

    expect(validatePersonaTimelineSettings(timeline)).toEqual(timeline);
    expect(timeline.clips.map(clip => clip.id)).toEqual(['blue', 'red']);
    expect(timeline.clips.map(clip => [clip.startSec, clip.durationSec])).toEqual([[0.4, 0.8], [0.2, 0.9]]);
  });

  it('does not silently reattach a different file with the same name', () => {
    const saved = { id: 'clip-1', name: 'scene.mp4', bytes: 1200, mime: 'video/mp4', lastModified: 10, sourceDuration: 2, startSec: 0, durationSec: 1, fingerprint: 'sha256:known' };

    expect(matchesPersonaTimelineSource(saved, { name: 'scene.mp4', bytes: 1200, mime: 'video/mp4', lastModified: 10, sourceDuration: 2, fingerprint: 'sha256:known' })).toBe(true);
    expect(matchesPersonaTimelineSource(saved, { name: 'scene.mp4', bytes: 1200, mime: 'video/mp4', lastModified: 10, sourceDuration: 2, fingerprint: 'sha256:other' })).toBe(false);
  });

  it('allows a legacy name-and-duration record to be safely upgraded on its first reattach', () => {
    const legacy = { id: 'legacy-1', name: 'scene.mp4', bytes: 0, mime: 'video/unknown', lastModified: 0, sourceDuration: 2, startSec: 0, durationSec: 1 };

    expect(matchesPersonaTimelineSource(legacy, { name: 'scene.mp4', bytes: 1200, mime: 'video/mp4', lastModified: 10, sourceDuration: 2 })).toBe(true);
  });

  it('rejects persisted clip boundaries outside the source duration', () => {
    expect(() => validatePersonaTimelineSettings({
      version: 1,
      width: 1080,
      height: 1920,
      fps: 30,
      clips: [{ id: 'clip-1', name: 'scene.mp4', bytes: 1200, mime: 'video/mp4', lastModified: 10, sourceDuration: 2, startSec: 1.5, durationSec: 0.8 }],
      music: null,
      captions: [],
    })).toThrow('invalid_persona_timeline');
  });

  it('keeps a trim valid while a number field is being edited', () => {
    const clip = { id: 'clip-1', name: 'scene.mp4', bytes: 1200, mime: 'video/mp4', lastModified: 10, sourceDuration: 1.16, startSec: 0.2, durationSec: 0.8 };

    expect(constrainPersonaTimelineClip(clip, { durationSec: 0 })).toMatchObject({ startSec: 0.2, durationSec: 0.1 });
    expect(constrainPersonaTimelineClip(clip, { startSec: 1 })).toMatchObject({ startSec: 1, durationSec: 0.16 });
  });
});
