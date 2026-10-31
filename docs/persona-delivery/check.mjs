// Acceptance of the SELECTED editor candidate. Earlier README/production-brief.md
// contain historical V1 wording and must never be used as V2 proof.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve('docs/persona-delivery');
const read = filename => readFileSync(resolve(root, filename), 'utf8');
const fail = message => { throw Error('Persona selected Reel: ' + message); };

const brief = JSON.parse(read('editorial-candidate-production-brief.json'));
const sources = JSON.parse(read('seven-shot-sources.template.json'));
const shootingPack = read('first-real-reel-shooting-pack.md');
const ids = ['A01', 'B01', 'A02', 'B02', 'A03', 'B03', 'A04'];
const expectedDurationSec = [3, 4, 5, 5, 4, 6, 4];
const protectedLines = new Map([
  [0, 'Я актёр. И ещё пишу музыку.'],
  [1, 'И у нас есть проблема.'],
  [6, 'Это колыбельная? Это финал триллера.'],
]);

if (brief.version !== 1 || brief.sourceFormat !== 'reel' ||
    brief.sourceTitle !== 'Один день между театром и музыкой' ||
    !Array.isArray(brief.script) || !Array.isArray(brief.shots) ||
    brief.script.length !== ids.length || brief.shots.length !== ids.length)
  fail('wrong idea/format or seven scenes/shots are missing');

let duration = 0;
const seenLines = new Set();
for (let i = 0; i < ids.length; i++) {
  const beat = brief.script[i], shot = brief.shots[i];
  if (!beat || !shot || beat.order !== i + 1 || shot.order !== i + 1)
    fail('scene and shot order mismatch at ' + ids[i]);
  if (typeof beat.line !== 'string' || !beat.line.trim() ||
      typeof beat.action !== 'string' || !beat.action.trim() ||
      !Number.isFinite(beat.durationSec) || beat.durationSec !== expectedDurationSec[i] ||
      shot.durationSec !== beat.durationSec)
    fail('invalid beat, action or shot duration at ' + ids[i]);
  if (seenLines.has(beat.line.trim()))
    fail('repeated dialogue at ' + ids[i]);
  seenLines.add(beat.line.trim());
  if (protectedLines.has(i) && beat.line !== protectedLines.get(i))
    fail('protected author line changed at ' + ids[i]);
  if (!shootingPack.includes('«' + beat.line + '»'))
    fail('shooting pack contains stale dialogue at ' + ids[i]);
  if (typeof shot.action !== 'string' || !shot.action.includes(ids[i] + '_'))
    fail('shot file mapping is missing at ' + ids[i]);
  duration += beat.durationSec;
}
if (duration !== 31 || brief.adaptations?.reels?.durationSec !== duration)
  fail('candidate timing is not exactly 31 seconds');

if (sources?.version !== 1 || !Array.isArray(sources.sources) ||
    sources.sources.length !== ids.length ||
    new Set(sources.sources.map(source => source.id)).size !== ids.length)
  fail('source-template ID list invalid');
for (let i = 0; i < ids.length; i++) {
  const source = sources.sources[i];
  if (source?.id !== ids[i] + '_take01' ||
      typeof source.path !== 'string' ||
      !source.path.includes(ids[i] + '_') ||
      !source.path.startsWith('REPLACE_WITH_EXPLICIT_ABSOLUTE_PATH_'))
    fail('source-template missing correct explicit placeholder at ' + ids[i]);
}
if (!shootingPack.includes('editorial-candidate-production-brief.json'))
  fail('shooting command uses a stale or different Production Brief');
if (!shootingPack.includes('Публикация заблокирована'))
  fail('publication approval gate is missing from shooting instructions');
if (!brief.script[6].action.includes('без обязательного титра') ||
    !shootingPack.includes('Без обязательного титра'))
  fail('A04 timing must prioritize reaction and full spoken payoff over a mandatory end title');
console.log('PASS: selected editorial-candidate JSON (not archived V1), 7 ordered scenes + shots, locked A01/B01/payoff, 31 s, matching shooting pack and explicit source IDs');
