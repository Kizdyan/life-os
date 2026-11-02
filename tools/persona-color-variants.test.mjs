import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createColorVariants} from './persona-color-variants.mjs';
const available=spawnSync('ffmpeg',['-version']).status===0;
test('creates three reproducible non-destructive color variants',{skip:!available,timeout:120000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-color-variants-')),source=join(root,'original.mp4'),out=join(root,'variants');
 try{assert.equal(spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=320x568:r=30:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-c:a','aac','-shortest',source]).status,0);const before=await readFile(source),result=await createColorVariants({inputPath:source,outputDir:out});assert.equal(result.variants.length,3);assert.equal(result.publicationApproved,false);assert.deepEqual(await readFile(source),before);for(const v of result.variants)assert.ok((await stat(v.path)).size>1000)}finally{await rm(root,{recursive:true,force:true})}
});
