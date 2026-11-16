import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectCreativePreset,getVisualPreset} from './persona-creative-director.mjs';
test('local director protocol allows only a configured preset, never a model-supplied FFmpeg filter',async()=>{
 let body;
 const result=await selectCreativePreset({text:'Драматический монолог о прощании.',model:'local-qwen',fetchImpl:async(url,options)=>{
  assert.equal(url,'http://127.0.0.1:11434/api/chat');body=JSON.parse(options.body);
  return {ok:true,json:async()=>({message:{content:'{"selected_preset":"Cinematic"}'}})};
 }});
 assert.equal(result.selected_preset,'Cinematic');assert.equal(result.model,'local-qwen');
 assert.match(body.messages[1].content,/Драматический/);assert.equal(result.scriptSha256.length,64);
 assert.equal(getVisualPreset('Cinematic').subtitles.bold,false);
 assert.equal(getVisualPreset('Dynamic').subtitles.highlight,'longest-word');
 const soft=getVisualPreset('SoftCinematic');
 assert.equal(soft.id,'SoftCinematic');
 assert.equal(soft.name,'Soft Cinematic');
 assert.equal(soft.filter,'eq=contrast=1.04:saturation=0.98:gamma=1.01,colorbalance=rs=-0.01:bs=0.015:rm=0.005:gm=-0.003:bm=-0.003:pl=0');
 assert.equal(soft.editorialVariation,'cinematic');
 const detail=getVisualPreset('DetailCinematic');
 assert.equal(detail.id,'DetailCinematic');
 assert.equal(detail.name,'Detail Cinematic');
 assert.equal(detail.filter,'eq=contrast=1.045:saturation=0.985:gamma=1.01,colorbalance=rs=-0.008:bs=0.012:rm=0.004:gm=-0.002:bm=-0.003:pl=0,unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=0.20:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.0');
 assert.equal(detail.editorialVariation,'cinematic');
});
test('offline, malformed JSON and invented presets fail without a fallback',async()=>{
 for(const fetchImpl of [async()=>{throw Error('offline')},async()=>({ok:false,status:503}),async()=>({ok:true,json:async()=>({message:{content:'{"selected_preset":"Hollywood"}'}})}),async()=>({ok:true,json:async()=>({message:{content:'not json'}})})])
  await assert.rejects(selectCreativePreset({text:'Весёлый скетч.',model:'qwen',fetchImpl}));
 assert.throws(()=>getVisualPreset('../secret'));
});
