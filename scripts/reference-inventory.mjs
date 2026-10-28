#!/usr/bin/env node
/**
 * Read-only inventory for Persona references and downloads.
 * Usage: node scripts/reference-inventory.mjs <directory>
 *        node scripts/reference-inventory.mjs --self-test
 *
 * No moving, deletion, upload, API keys, network or dependency installation.
 */
import { createReadStream } from 'node:fs';
import { readdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const kinds = {
  '.mp4':'video', '.mov':'video', '.m4v':'video',
  '.jpg':'image', '.jpeg':'image', '.png':'image', '.webp':'image', '.heic':'image',
  '.pdf':'document', '.md':'document', '.txt':'document',
};
function normalizedStem(filename) {
  const ext = extname(filename);
  return basename(filename, ext).replace(/\s*\(\d+\)$/, '').trim().toLowerCase();
}
async function sha256(path) {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest('hex');
}
function groupsBy(entries, keyFn) {
  const groups = new Map();
  for (const item of entries) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item.name);
  }
  return [...groups.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([key, files]) => ({ key, files: files.sort((a,b) => a.localeCompare(b)) }))
    .sort((a,b) => a.key.localeCompare(b.key));
}
export async function inventoryReferenceFolder(folder) {
  const root = resolve(folder);
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error('Input must be a regular directory');
  const dirents = await readdir(root, { withFileTypes:true });
  const entries = [];
  let ignoredEntries = 0;
  for (const dent of dirents.sort((a,b) => a.name.localeCompare(b.name))) {
    if (!dent.isFile() || dent.isSymbolicLink()) { ignoredEntries++; continue; }
    const ext = extname(dent.name).toLowerCase();
    if (!(ext in kinds)) { ignoredEntries++; continue; }
    const full = resolve(root, dent.name);
    const info = await lstat(full);
    if (!info.isFile() || info.isSymbolicLink()) { ignoredEntries++; continue; }
    entries.push({
      name: dent.name, type: kinds[ext], sizeBytes: info.size,
      sha256: await sha256(full), normalizedStem: normalizedStem(dent.name),
    });
  }
  const exactDuplicates = groupsBy(entries, x => x.sha256);
  const similarNameCandidates = groupsBy(entries, x => x.type + ':' + x.normalizedStem)
    .filter(group => new Set(group.files.map(name => entries.find(x => x.name === name).sha256)).size > 1);
  const countsByType = Object.fromEntries(['video','image','document']
    .map(type => [type, entries.filter(x=>x.type===type).length]));
  return {
    schemaVersion:1, readOnly:true, autoDeleteAllowed:false, autoMoveAllowed:false,
    scannedDirectory:basename(root), totalFiles:entries.length,
    ignoredEntries, countsByType, exactDuplicates, similarNameCandidates, entries,
  };
}
async function selfTest() {
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const assert = (await import('node:assert/strict')).default;
  const dir = await mkdtemp(join(tmpdir(), 'reference-inventory-'));
  try {
    await writeFile(join(dir,'clip.mp4'), 'a');
    await writeFile(join(dir,'clip(1).mp4'), 'b');
    await writeFile(join(dir,'duplicate.jpg'), 'a');
    await writeFile(join(dir,'duplicate-copy.jpg'), 'a');
    await writeFile(join(dir,'private.env'), 'secret');
    const before = (await readdir(dir)).sort();
    const report = await inventoryReferenceFolder(dir);
    assert.deepEqual((await readdir(dir)).sort(), before);
    assert.equal(report.totalFiles,4);
    assert.equal(report.ignoredEntries,1);
    assert.equal(report.exactDuplicates.length,1);
    assert.equal(report.similarNameCandidates.length,1);
    assert.equal(report.autoDeleteAllowed,false);
    assert.equal(await readFile(join(dir,'private.env'),'utf8'),'secret');
    process.stdout.write('PASS: 7 file inventory safety/grouping checks\n');
  } finally {
    await rm(dir,{recursive:true,force:true});
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--self-test') {
    selfTest().catch(error=>{console.error(error);process.exitCode=1;});
  } else if (process.argv.length !== 3) {
    console.error('Usage: node scripts/reference-inventory.mjs <directory> | --self-test');
    process.exitCode=2;
  } else {
    inventoryReferenceFolder(process.argv[2])
      .then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
      .catch(error=>{console.error(error.message);process.exitCode=1;});
  }
}
