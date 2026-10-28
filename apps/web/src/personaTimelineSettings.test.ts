import {describe,expect,it} from 'vitest';
import {DEFAULT_TIMELINE_SETTINGS,hasValidTimelineBounds,loadPersonaTimelineSettings,validateReattachedVideo} from './personaTimelineSettings';

function store(raw:string|null):Pick<Storage,'getItem'>{
 return {getItem:()=>raw};
}
describe('Persona timeline render settings',()=>{
 it('defaults to 1080x1920, 30 fps',()=>{
  expect(loadPersonaTimelineSettings(store(null),'settings')).toEqual(DEFAULT_TIMELINE_SETTINGS);
 });
 it('restores valid landscape and 60 fps',()=>{
  expect(loadPersonaTimelineSettings(store(JSON.stringify({width:1920,height:1080,fps:60})),'settings'))
    .toEqual({width:1920,height:1080,fps:60});
 });
 it('rejects malformed JSON, invalid rotations and unsupported FPS',()=>{
  for(const raw of ['{','[]',JSON.stringify({width:1080,height:1080,fps:30}),JSON.stringify({width:1920,height:1080,fps:300})])
   expect(loadPersonaTimelineSettings(store(raw),'settings')).toEqual(DEFAULT_TIMELINE_SETTINGS);
 });
});
describe('Persona saved video source reattachment',()=>{
 const saved={name:'original.mov',sourceDuration:12.4,sourceSizeBytes:42000};
 it('accepts matching name, approximate duration and exact byte count',()=>{
  expect(validateReattachedVideo(saved,{name:'original.mov',size:42000},12.5).ok).toBe(true);
 });
 it('rejects same-name clip with different byte count',()=>{
  expect(validateReattachedVideo(saved,{name:'original.mov',size:43000},12.4).ok).toBe(false);
 });
 it('rejects a substituted name or a different duration',()=>{
  expect(validateReattachedVideo(saved,{name:'fake.mov',size:42000},12.4).ok).toBe(false);
  expect(validateReattachedVideo(saved,{name:'original.mov',size:42000},13.4).ok).toBe(false);
 });
 it('still permits old projects without saved file size with a caution',()=>{
  const result=validateReattachedVideo({name:'original.mov',sourceDuration:12.4},{name:'original.mov',size:42000},12.4);
  expect(result.ok).toBe(true);
  expect(result.reason).toContain('Старый проект');
 });
});

describe('Persona trim bounds',()=>{
 const clip={startSec:0.5,durationSec:1.0,sourceDuration:2};
 it('accepts a valid independently trimmed clip',()=>expect(hasValidTimelineBounds(clip)).toBe(true));
 it('rejects edits past source end',()=>expect(hasValidTimelineBounds({...clip,startSec:1.5})).toBe(false));
 it('rejects NaN, infinite positions, and empty durations',()=>{
  expect(hasValidTimelineBounds({...clip,startSec:NaN})).toBe(false);
  expect(hasValidTimelineBounds({...clip,durationSec:Infinity})).toBe(false);
  expect(hasValidTimelineBounds({...clip,durationSec:0})).toBe(false);
 });
});
