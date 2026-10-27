import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPersonaEditorialCalendar,WEEKLY_SLOTS} from './persona-editorial-calendar.mjs';
test('one complete Monday-Sunday week has exactly five unique slots',()=>{
 const plan=buildPersonaEditorialCalendar({startDate:'2026-10-26',days:7});
 assert.equal(plan.slots.length,5);
 assert.deepEqual(plan.slots.map(s=>s.format),['photo','reel','carousel','reel','reel']);
 assert.equal(plan.target.stories,'optional');
 assert.equal(new Set(plan.slots.map(s=>s.slotId)).size,5);
});
test('90-day horizon is bounded and has correct channel destinations',()=>{
 const plan=buildPersonaEditorialCalendar({startDate:'2026-10-27',days:90});
 assert.equal(plan.horizon.endDate,'2027-01-24');
 assert.ok(plan.slots.every(s=>s.date>='2026-10-27'&&s.date<='2027-01-24'));
 assert.ok(plan.slots.every(s=>s.format!=='reel'||s.platforms.includes('tiktok')));
 assert.ok(plan.slots.every(s=>s.status==='planned'&&!s.approved&&s.contentId===null));
 assert.equal(plan.reserveTarget.reels,6);
});
test('preserves approved content assignments on recalculation',()=>{
 const old=buildPersonaEditorialCalendar({startDate:'2026-10-26',days:7});
 const previous={...old.slots[0],status:'ready',approved:true,contentId:'asset-123'};
 const updated=buildPersonaEditorialCalendar({startDate:'2026-10-26',days:7,existing:[previous]});
 assert.equal(updated.slots[0].contentId,'asset-123');
 assert.equal(updated.slots[0].status,'ready');
 assert.equal(updated.slots[0].approved,true);
});
test('rejects invalid date and horizon',()=>{
 assert.throws(()=>buildPersonaEditorialCalendar({startDate:'2026-02-30'}));
 assert.throws(()=>buildPersonaEditorialCalendar({startDate:'2026-10-27',days:0}));
 assert.equal(WEEKLY_SLOTS.length,5);
});
