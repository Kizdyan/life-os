import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {indexReferences,retrieveReferenceFrames,validateFrameFeatures} from './persona-reference-intelligence.mjs';
import {FOLDERS} from './persona-yandex-library.mjs';
const feature={dimension:'typography',status:'observed',observation:'Классическая типографика',application:'Крупный заголовок'};
const opinion={features:[feature],tags:['типографика','заголовок']};
async function fixture(){
 const cache=await mkdtemp(join(tmpdir(),'persona-ref-')),dir=join(cache,'catalogs',FOLDERS[1]),thumbs=join(dir,'thumbnails');
 await mkdir(thumbs,{recursive:true});const assets=[];
 for(let i=1;i<=3;i++){
  const sha256=String(i).repeat(64),thumbnail=sha256.slice(0,24)+'-image-0.jpg';
  await writeFile(join(thumbs,thumbnail),Buffer.alloc(300,i));
  assets.push({sha256,kind:'image',availability:'local',frames:[{thumbnail,timeSec:0}]});
 }
 await writeFile(join(dir,'persona-assets-v1.json'),JSON.stringify({kind:'persona-local-library-v1',assets}));
 return {cache,dir,thumbs,assets};
}
test('reference frame checkpoints resume and return observed, unconfirmed evidence only',async()=>{
 const {cache,thumbs,assets}=await fixture();
 try{
  let calls=0;
  const opts={cache,model:'vision',log:()=>{},describe:async()=>{calls++;return opinion}};
  const a=await indexReferences({...opts,limit:1});
  assert.deepEqual([a.analyzed,a.remaining],[1,2]);
  const b=await indexReferences(opts);
  assert.deepEqual([b.analyzed,b.reused,calls],[2,1,3]);
  const refs=await retrieveReferenceFrames({cache,query:'типографика'});
  assert.equal(refs.length,2);assert.equal(refs[0].preference,'unconfirmed');assert.equal(refs[0].features[0].dimension,'typography');
  assert.equal((await retrieveReferenceFrames({cache,query:'неизвестно'})).length,0);
  await writeFile(join(thumbs,assets[0].frames[0].thumbnail),Buffer.alloc(300,9));
  const after=await retrieveReferenceFrames({cache,query:'типографика'});
  assert.ok(after.every(r=>r.assetSha256!==assets[0].sha256));
 }finally{await rm(cache,{recursive:true,force:true})}
});
test('failed reference does not block remaining queue forever',async()=>{
 const {cache,dir}=await fixture();
 try{
  let calls=0;
  const opts={cache,model:'vision',limit:1,log:()=>{},describe:async bytes=>{calls++;if(bytes[0]===1)throw Error('fixture failure');return opinion}};
  assert.equal((await indexReferences(opts)).errors.length,1);
  assert.equal((await indexReferences(opts)).errors.length,1);
  const third=await indexReferences(opts);assert.equal(third.blocked,1);assert.equal(third.analyzed,1);assert.equal(calls,3);
  assert.equal(JSON.parse(await readFile(join(dir,'reference-evidence-v1.json'),'utf8')).rows.length,1);
 }finally{await rm(cache,{recursive:true,force:true})}
});
test('uncertain or fabricated dimensions cannot silently become approved facts',()=>{
 assert.throws(()=>validateFrameFeatures({...opinion,features:[{...feature,dimension:'music'}]}));
 assert.throws(()=>validateFrameFeatures({...opinion,features:[feature,feature]}));
 assert.equal(validateFrameFeatures({...opinion,features:[{...feature,status:'uncertain'}]}).features[0].status,'uncertain');
});
