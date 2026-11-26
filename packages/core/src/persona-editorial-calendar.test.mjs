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

test('daily sprint preserves saved dates, fills only gaps, and restores legacy projection after 30 days',()=>{
 const saved={slotId:'persona:2026-11-29:photo',date:'2026-11-29',format:'photo',status:'needs_review',approved:false,contentId:'existing-photo',platforms:['instagram'],notes:'Do not move'};
 const plan=buildPersonaEditorialCalendar({startDate:'2026-11-28',days:90,sprintStartDate:'2026-11-28',existing:[saved]});
 const sprint=plan.slots.filter(s=>s.date>='2026-11-28'&&s.date<='2026-12-27');
 assert.equal(sprint.length,30);assert.equal(new Set(sprint.map(s=>s.date)).size,30);
 assert.equal(sprint.find(s=>s.date===saved.date).contentId,saved.contentId);
 assert.deepEqual(sprint.find(s=>s.date===saved.date).platforms,saved.platforms);
 assert.ok(sprint.filter(s=>s.date!==saved.date).every(s=>s.format==='carousel'&&!s.approved&&s.contentId===null&&s.status==='planned'));
 assert.equal(plan.reserveTarget.carousels,7);assert.equal(plan.sprint.status,'PLANNING_ONLY');
 assert.deepEqual(plan.slots.filter(s=>s.date>='2026-12-28'&&s.date<='2027-01-03').map(s=>s.format),['reel','carousel','photo']);
 const legacy=buildPersonaEditorialCalendar({startDate:'2026-11-28',days:7,existing:[saved]});
 assert.ok(legacy.slots.some(s=>s.contentId===saved.contentId));assert.equal(legacy.reserveTarget.carousels,2);
});
test('sprint rejects impossible date and retains multiple explicit commitments on one date',()=>{
 assert.throws(()=>buildPersonaEditorialCalendar({startDate:'2026-11-28',sprintStartDate:'2026-02-30'}));
 const existing=['photo','reel'].map(format=>({slotId:'persona:2026-11-28:'+format,date:'2026-11-28',format,contentId:format,approved:true,platforms:['instagram']}));
 const plan=buildPersonaEditorialCalendar({startDate:'2026-11-28',days:7,sprintStartDate:'2026-11-28',existing});
 assert.equal(plan.slots.filter(s=>s.date==='2026-11-28').length,2);assert.equal(plan.slots.length,8);
});

test('explicitly occupied editorial dates are never filled with another proposed carousel',()=>{
 const plan=buildPersonaEditorialCalendar({startDate:'2026-11-28',days:7,sprintStartDate:'2026-11-28',occupiedDates:['2026-11-29','2026-12-02']});
 assert.equal(plan.slots.length,5);assert.ok(plan.slots.every(s=>!['2026-11-29','2026-12-02'].includes(s.date)));
 assert.throws(()=>buildPersonaEditorialCalendar({startDate:'2026-11-28',days:7,sprintStartDate:'2026-11-28',occupiedDates:['2026-02-30']}));
});
