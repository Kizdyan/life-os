import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {test} from 'node:test';
import {checkWav,makeHtml,createAnimatic,validateAnimaticVariants} from './persona-delivery-animatic.mjs';

const root=resolve('docs/persona-delivery');
const [old,next]=await Promise.all([
 readFile(join(root,'candidate-production-brief.json'),'utf8').then(JSON.parse),
 readFile(join(root,'editorial-candidate-production-brief.json'),'utf8').then(JSON.parse)
]);

function pcm(durationSec=1){
 const rate=8000,frames=Math.round(rate*durationSec),dataSize=frames*2;
 const wav=Buffer.alloc(44+dataSize);
 wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVE',8);
 wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);
 wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);
 wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
 wav.write('data',36);wav.writeUInt32LE(dataSize,40);
 return wav;
}
test('original and candidate are exact seven-scene, same-idea, 31-second variants',()=>{
 assert.equal(validateAnimaticVariants(old,next),true);
 assert.notEqual(old.script[4].line,next.script[4].line);
 assert.equal(next.script[0].line,old.script[0].line);
 assert.equal(next.script[1].line,old.script[1].line);
 assert.equal(next.script[6].line,old.script[6].line);
});
test('rejects tampered locked beat and mismatched durations',()=>{
 const locked=structuredClone(next);locked.script[1].line='Подменённая реплика';
 assert.throws(()=>validateAnimaticVariants(old,locked),/protected B01/);
 const duration=structuredClone(next);duration.shots[5].durationSec=5;
 assert.throws(()=>validateAnimaticVariants(old,duration),/invalid beat\/shot B03/);
});
test('validates provided local WAV, rejects missing/truncated/long audio',()=>{
 assert.deepEqual(checkWav(pcm(1)),{durationSec:1,channels:1,rate:8000});
 assert.throws(()=>checkWav(Buffer.from('not a wave')),/RIFF\/WAVE/);
 assert.throws(()=>checkWav(pcm(4)),/0.25–3.5/);
});
test('single HTML contains both candidate variants and embedded audio; no real footage claims',()=>{
 const html=makeHtml(old,next,pcm(1),1);
 assert.match(html,/Редакторский кандидат/);
 assert.match(html,/Это не снятое видео|НЕТ снятого видео/i);
 assert.match(html,/data:audio\/wav;base64/);
 assert.match(html,/Значит, кто-то сегодня не спит/);
 assert.match(html,/То есть спать мы не будем/);
 assert.doesNotMatch(html,/C:\\Users\\/);
});
test('generates local preview and sha evidence without overwriting existing output',async t=>{
 const base=await mkdtemp(join(tmpdir(),'persona-animatic-test-'));
 t.after(()=>rm(base,{recursive:true,force:true}));
 const wav=join(base,'explicit.wav'),output=join(base,'preview');
 await writeFile(wav,pcm(1));
 const result=await createAnimatic(wav,output);
 const html=await readFile(result.html,'utf8'),proof=JSON.parse(await readFile(result.evidence,'utf8'));
 assert.match(html,/audio\/wav;base64/);
 assert.equal(proof.videoSources,0);
 assert.equal(proof.publicationApproved,false);
 assert.match(proof.audio.sha256,/^[a-f0-9]{64}$/);
 await assert.rejects(createAnimatic(wav,output),/EEXIST/);
});
