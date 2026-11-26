import {describe,it,expect} from 'vitest';
import {validateMusicBrief,musicBriefState,musicBriefRequest,type MusicBrief} from './personaMusicBrief';
const scope={contentId:'fixture-post',revision:1,destination:'tiktok' as const};
const brief:MusicBrief={version:1,...scope,dramaturgy:'quiet tension',selectedIndex:null,candidates:[1,2,3].map(i=>({title:'Track '+i,artist:'Artist',reason:'Supports the idea',fragmentHint:'opening',availability:'UNKNOWN',rights:'UNKNOWN'}))};
describe('music brief scope',()=>{
 it('distinguishes selection, availability and actual attachment',()=>{
  expect(musicBriefState(null,scope)).toBe('AWAITING_PROPOSALS');
  expect(musicBriefState(brief,scope)).toBe('AWAITING_SELECTION');
  const selected={...brief,selectedIndex:0};
  expect(musicBriefState(selected,scope)).toBe('AWAITING_AVAILABILITY_OR_RIGHTS');
  const candidates=selected.candidates.map((c,i)=>i===0?{...c,availability:'AVAILABLE' as const,rights:'PLATFORM_LICENSE_CONFIRMED' as const,checkedAt:'2026-11-27T00:00:00Z'}:c);
  expect(musicBriefState({...selected,candidates},scope)).toBe('SELECTED_NOT_ATTACHED');
  expect(musicBriefState(selected,{...scope,revision:2})).toBe('STALE_BRIEF');
  expect(musicBriefState(selected,{...scope,destination:'instagram'})).toBe('STALE_BRIEF');
 });
 it('rejects duplicate candidates and unverified claims',()=>{
  expect(()=>validateMusicBrief({...brief,candidates:[brief.candidates[0],brief.candidates[0],brief.candidates[1]]})).toThrow();
  expect(()=>validateMusicBrief({...brief,candidates:brief.candidates.map(c=>({...c,availability:'AVAILABLE'}))})).toThrow();
  expect(musicBriefRequest(scope,'Topic','Caption').attached).toBe(false);
 });
});
