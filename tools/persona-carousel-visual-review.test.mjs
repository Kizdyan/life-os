import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {normalizeVisualReviewRequest,validateVisualOpinion,reviewCarouselVisual} from './persona-carousel-visual-review.mjs';
// Actual structurally valid 1080x1350 grayscale PNG with deterministic pixels.
function chunk(type,data){
 const name=Buffer.from(type),content=Buffer.concat([name,data]);
 let crc=0xffffffff;for(const b of content){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}
 const size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE((crc^0xffffffff)>>>0);
 return Buffer.concat([size,content,sum]);
}
const header=Buffer.alloc(13);header.writeUInt32BE(1080);header.writeUInt32BE(1350,4);header[8]=8;
const pixels=Buffer.alloc(1081*1350);for(let y=0;y<1350;y++)for(let x=1;x<=1080;x++)pixels[y*1081+x]=(x*7+y*13)%256;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
const request={topic:'Кино',text:'Заголовок',index:1,total:7,png:png.toString('base64'),sha256:createHash('sha256').update(png).digest('hex')};
const opinion={scores:{readability:4,hierarchy:4,composition:3,brandCoherence:4,imageRelevance:3},issues:[],summary:'Нужен авторский просмотр'};
test('exact PNG and digest checked before review',()=>{
 assert.equal(normalizeVisualReviewRequest(request).sha256,request.sha256);
 for(const patch of [{sha256:'0'.repeat(64)},{index:8},{png:'AAAA'},{total:2}])assert.throws(()=>normalizeVisualReviewRequest({...request,...patch}));
});
test('actual image bytes reach only local vision endpoint; no approval claim',async()=>{
 const calls=[];
 const result=await reviewCarouselVisual({request,model:'qwen3-vl:2b-instruct',fetchImpl:async(url,init)=>{
  calls.push(url);const body=JSON.parse(init.body);
  if(url.endsWith('/show'))return {ok:true,json:async()=>({capabilities:['vision']})};
  assert.equal(body.messages[1].images[0],request.png);
  return {ok:true,json:async()=>({message:{content:JSON.stringify(opinion)}})};
 }});
 assert.deepEqual(calls,['http://127.0.0.1:11434/api/show','http://127.0.0.1:11434/api/chat']);
 assert.equal(result.sha256,request.sha256);assert.equal(result.approved,false);assert.equal(result.published,false);
 assert.equal(result.status,'AUTHOR_REVIEW_REQUIRED');
});
test('low scores produce revision advice; nonvision model and invalid response fail closed',async()=>{
 assert.throws(()=>validateVisualOpinion({...opinion,scores:{...opinion.scores,readability:6}}));
 const fetchImpl=async(url)=>({ok:true,json:async()=>url.endsWith('/show')?{capabilities:['vision']}:{message:{content:JSON.stringify({...opinion,scores:{...opinion.scores,readability:2}})}}});
 assert.equal((await reviewCarouselVisual({request,model:'vision',fetchImpl})).status,'REVISION_SUGGESTED');
 await assert.rejects(reviewCarouselVisual({request,model:'text-only',fetchImpl:async()=>({ok:true,json:async()=>({capabilities:['completion']})})}),/does not advertise vision/);
});
