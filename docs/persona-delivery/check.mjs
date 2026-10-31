import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const text = readFileSync(resolve('docs/persona-delivery/README.md'), 'utf8');
const brief = readFileSync(resolve('docs/persona-delivery/production-brief.md'), 'utf8');
const rows = [...text.matchAll(/^\| (\d+)–(\d+) \| (Актёр|Композитор) \| «([^»]+)»/gm)];
const expected = [[0,3],[3,7],[7,12],[12,17],[17,21],[21,27],[27,31]];
if (rows.length !== 7) throw new Error(`Expected 7 beats, got ${rows.length}`);
rows.forEach((row, i) => {
  if (+row[1] !== expected[i][0] || +row[2] !== expected[i][1]) throw new Error(`Timing error in beat ${i + 1}`);
  if (!brief.includes(`${expected[i][1] - expected[i][0]} |`)) throw new Error(`Shot duration missing for beat ${i + 1}`);
});
if (rows[0][4] !== 'Я актёр. И ещё пишу музыку.' || rows[1][4] !== 'И у нас есть проблема.') throw new Error('Locked A01/B01 changed');
if (rows[6][4] !== 'Это колыбельная? Это финал триллера.') throw new Error('Punchline changed');
if (new Set(rows.map(row => row[4])).size !== 7) throw new Error('Repeated line');
for (const id of ['A01','B01','A02','B02','A03','B03','A04']) if (!brief.includes(`${id}_`)) throw new Error(`Missing shot ${id}`);
console.log('PASS: 7 distinct beats, continuous 31 seconds, locked hook, punchline and 7 shots');
