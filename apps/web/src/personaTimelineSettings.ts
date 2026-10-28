export type PersonaTimelineClip = {
  id: string;
  name: string;
  bytes: number;
  mime: string;
  lastModified: number;
  sourceDuration: number;
  startSec: number;
  durationSec: number;
  fingerprint?: string;
};

export type PersonaTimelineMusic = {
  name: string;
  bytes: number;
  mime: string;
  lastModified: number;
  volume: number;
  originalVolume: number;
};

export type PersonaTimelineCaption = {
  id: string;
  text: string;
  startSec: number;
  endSec: number;
};

export type PersonaTimelineSettings = {
  version: 1;
  width: 1080 | 1920;
  height: 1920 | 1080;
  fps: 25 | 30 | 60;
  clips: PersonaTimelineClip[];
  music: PersonaTimelineMusic | null;
  captions: PersonaTimelineCaption[];
};

type SourceIdentity = Pick<PersonaTimelineClip, 'name' | 'bytes' | 'mime' | 'lastModified' | 'sourceDuration' | 'fingerprint'>;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validClip(value: unknown): value is PersonaTimelineClip {
  if (!value || typeof value !== 'object') return false;
  const clip = value as Partial<PersonaTimelineClip>;
  return typeof clip.id === 'string' && clip.id.length > 0
    && typeof clip.name === 'string' && clip.name.length > 0
    && Number.isInteger(clip.bytes) && clip.bytes >= 0
    && typeof clip.mime === 'string' && clip.mime.startsWith('video/')
    && Number.isInteger(clip.lastModified) && clip.lastModified >= 0
    && finite(clip.sourceDuration) && clip.sourceDuration > 0
    && finite(clip.startSec) && clip.startSec >= 0
    && finite(clip.durationSec) && clip.durationSec > 0
    && clip.startSec + clip.durationSec <= clip.sourceDuration + 0.01
    && (clip.fingerprint === undefined || (typeof clip.fingerprint === 'string' && clip.fingerprint.startsWith('sha256:')));
}

function validCaption(value: unknown): value is PersonaTimelineCaption {
  if (!value || typeof value !== 'object') return false;
  const caption = value as Partial<PersonaTimelineCaption>;
  return typeof caption.id === 'string' && caption.id.length > 0
    && typeof caption.text === 'string' && caption.text.trim().length > 0
    && finite(caption.startSec) && finite(caption.endSec)
    && caption.startSec >= 0 && caption.endSec > caption.startSec;
}

function validMusic(value: unknown): value is PersonaTimelineMusic | null {
  if (value === null) return true;
  if (!value || typeof value !== 'object') return false;
  const music = value as Partial<PersonaTimelineMusic>;
  return typeof music.name === 'string' && music.name.length > 0
    && Number.isInteger(music.bytes) && music.bytes >= 0
    && typeof music.mime === 'string' && music.mime.startsWith('audio/')
    && Number.isInteger(music.lastModified) && music.lastModified >= 0
    && finite(music.volume) && music.volume >= 0 && music.volume <= 1
    && finite(music.originalVolume) && music.originalVolume >= 0 && music.originalVolume <= 1;
}

export function validatePersonaTimelineSettings(value: unknown): PersonaTimelineSettings {
  if (!value || typeof value !== 'object') throw new Error('invalid_persona_timeline');
  const timeline = value as Partial<PersonaTimelineSettings>;
  const dimensions = (timeline.width === 1080 && timeline.height === 1920) || (timeline.width === 1920 && timeline.height === 1080);
  if (timeline.version !== 1 || !dimensions || (timeline.fps !== 25 && timeline.fps !== 30 && timeline.fps !== 60)
    || !Array.isArray(timeline.clips) || timeline.clips.length > 30 || !timeline.clips.every(validClip)
    || new Set(timeline.clips.map(clip => clip.id)).size !== timeline.clips.length
    || !validMusic(timeline.music) || !Array.isArray(timeline.captions) || !timeline.captions.every(validCaption)) {
    throw new Error('invalid_persona_timeline');
  }
  return timeline as PersonaTimelineSettings;
}

export function createPersonaTimelineSettings(
  clips: PersonaTimelineClip[],
  output: Pick<PersonaTimelineSettings, 'width' | 'height' | 'fps'> = { width: 1080, height: 1920, fps: 30 },
): PersonaTimelineSettings {
  return validatePersonaTimelineSettings({ version: 1, ...output, clips, music: null, captions: [] });
}

export function constrainPersonaTimelineClip(
  clip: PersonaTimelineClip,
  patch: Pick<PersonaTimelineClip, 'startSec'> | Pick<PersonaTimelineClip, 'durationSec'>,
): PersonaTimelineClip {
  const candidate = { ...clip, ...patch };
  if ('startSec' in patch) {
    const startSec = Number(Math.min(Math.max(0, candidate.startSec), Math.max(0, clip.sourceDuration - 0.1)).toFixed(3));
    const durationSec = Number(Math.max(0.1, Math.min(clip.durationSec, clip.sourceDuration - startSec)).toFixed(3));
    return { ...candidate, startSec, durationSec };
  }
  const durationSec = Number(Math.min(Math.max(0.1, candidate.durationSec), clip.sourceDuration).toFixed(3));
  const maxStart = Math.max(0, clip.sourceDuration - durationSec);
  const startSec = Number(Math.min(Math.max(0, candidate.startSec), maxStart).toFixed(3));
  return { ...candidate, startSec, durationSec };
}

export function constrainPersonaTimelineCaption(
  caption: PersonaTimelineCaption,
  patch: Pick<PersonaTimelineCaption, 'startSec'> | Pick<PersonaTimelineCaption, 'endSec'>,
  timelineDuration: number,
): PersonaTimelineCaption {
  const maximum = Number.isFinite(timelineDuration) ? Math.max(0.1, timelineDuration) : 0.1;
  const candidate = { ...caption, ...patch };
  if ('startSec' in patch) {
    const startSec = Number(Math.min(Math.max(0, candidate.startSec), Math.max(0, maximum - 0.1)).toFixed(3));
    const endSec = Number(Math.max(startSec + 0.1, Math.min(caption.endSec, maximum)).toFixed(3));
    return { ...candidate, startSec, endSec };
  }
  const endSec = Number(Math.min(Math.max(caption.startSec + 0.1, candidate.endSec), maximum).toFixed(3));
  const startSec = Number(Math.min(Math.max(0, caption.startSec), endSec - 0.1).toFixed(3));
  return { ...candidate, startSec, endSec };
}

export function matchesPersonaTimelineSource(saved: PersonaTimelineClip, candidate: SourceIdentity): boolean {
  const isLegacy = saved.bytes === 0 && saved.mime === 'video/unknown' && saved.lastModified === 0;
  if (saved.name !== candidate.name || Math.abs(saved.sourceDuration - candidate.sourceDuration) > 0.5) return false;
  if (!isLegacy && (saved.bytes !== candidate.bytes || saved.mime !== candidate.mime || saved.lastModified !== candidate.lastModified)) return false;
  return saved.fingerprint === undefined || candidate.fingerprint === saved.fingerprint;
}
