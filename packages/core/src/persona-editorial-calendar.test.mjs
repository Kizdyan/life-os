import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPersonaEditorialCalendar,WEEKLY_SLOTS} from './persona-editorial-calendar.mjs';

test('a complete Monday-Sunday week matches the main Persona Tue/Thu/Sat cadence',()=>{
 const plan=buildPersonaEditorialCalendar({startDate:'2026-11-16',days:7});
 assert.deepEqual(plan.slots.map(s=>s.date),['2026-11-17','2026-11-19','2026-11-21']);
 assert.deepEqual(plan.slots.map(s=>s.format),['reel','carousel','photo']);
 assert.equal(plan.target.reelsPerWeek,1);
 assert.equal(plan.target.carouselsPerWeek,1);
 assert.equal(plan.target.photosPerWeek,1);
 assert.equal(plan.target.stories,'optional');
 assert.equal(new Set(plan.slots.map(s=>s.slotId)).size,3);
});
test('90-day plan remains bounded with 3 weekly formats and verified platform labels',()=>{
 const plan=buildPersonaEditorialCalendar({startDate:'2026-10-27',days:90});
 assert.equal(plan.horizon.endDate,'2027-01-24');
 assert.ok(plan.slots.every(s=>s.date>='2026-10-27'&&s.date<='2027-01-24'));
 assert.ok(plan.slots.every(s=>s.format!=='reel'||s.platforms.includes('tiktok')));
 assert.ok(plan.slots.every(s=>s.status==='planned'&&!s.approved&&s.contentId===null));
 assert.ok(plan.slots.every(s=>[2,4,6].includes(WEEKLY_SLOTS.find(x=>x.format===s.format)?.weekday)));
 assert.equal(plan.reserveTarget.reels,2);
 assert.equal(new Set(plan.slots.map(s=>s.slotId)).size,plan.slots.length);
});
test('retains approval and assignments when recalculating a canonical slot',()=>{
 const old=buildPersonaEditorialCalendar({startDate:'2026-11-16',days:7});
 const previous={...old.slots[0],status:'ready',approved:true,contentId:'asset-123',notes:'Author script'};
 const updated=buildPersonaEditorialCalendar({startDate:'2026-11-16',days:7,existing:[previous]});
 assert.equal(updated.slots.length,3);
 assert.equal(updated.slots[0].contentId,'asset-123');
 assert.equal(updated.slots[0].status,'ready');
 assert.equal(updated.slots[0].approved,true);
 assert.equal(updated.slots[0].notes,'Author script');
 assert.equal(updated.slots[0].legacySavedDate,undefined);
});
test('old schedule author-edited posts survive unchanged as explicitly marked extra slots',()=>{
 const before=[
  {slotId:'persona:2026-11-16:photo',date:'2026-11-16',format:'photo',purpose:'personal-story',status:'needs_review',approved:true,contentId:'photo-777',platforms:['instagram'],notes:'Keep my Monday'},
  {slotId:'persona:2026-11-18:carousel',date:'2026-11-18',format:'carousel',purpose:'storytelling-and-expertise',status:'in_production',approved:false,contentId:'carousel-123',platforms:['vk'],notes:'Keep my Wednesday'},
  {slotId:'persona:2026-11-20:reel',date:'2026-11-20',format:'reel',purpose:'craft-and-portfolio',status:'planned',approved:false,contentId:null,platforms:['instagram'],notes:'Selected Friday'},
 ];
 const plan=buildPersonaEditorialCalendar({startDate:'2026-11-16',days:7,existing:before});
 assert.equal(plan.slots.length,6);
 assert.deepEqual(plan.slots.map(x=>x.date),['2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-20','2026-11-21']);
 for(const input of before){
  const output=plan.slots.find(s=>s.slotId===input.slotId);
  assert.ok(output);
  assert.equal(output.legacySavedDate,true);
  for(const key of ['date','format','status','approved','contentId','notes'])assert.deepEqual(output[key],input[key]);
 }
 assert.equal(new Set(plan.slots.map(s=>s.slotId)).size,plan.slots.length);
});
test('out-of-horizon legacy records stay untouched in storage, never leak into visible schedule',()=>{
 const input={slotId:'persona:2026-12-01:reel',date:'2026-12-01',format:'reel',status:'ready',notes:'Future work'};
 const plan=buildPersonaEditorialCalendar({startDate:'2026-11-16',days:7,existing:[input]});
 assert.equal(plan.slots.length,3);
 assert.equal(input.notes,'Future work');
});
test('rejects invalid date and horizon',()=>{
 assert.throws(()=>buildPersonaEditorialCalendar({startDate:'2026-02-30'}));
 assert.throws(()=>buildPersonaEditorialCalendar({startDate:'2026-10-27',days:0}));
 assert.equal(WEEKLY_SLOTS.length,3);
});
