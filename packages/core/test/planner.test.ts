import {describe,expect,it} from 'vitest';
import {reserveTheatreExit} from '../src/planner';
import type {LifeItem} from '../src/life-item';
describe('planner rules',()=>{it('reserves exit before theatre automatically',()=>{
 const e:LifeItem={id:'t',kind:'event',title:'Театр — репетиция',status:'planned',plannedStart:'2026-09-30T16:00:00+03:00',plannedEnd:'2026-09-30T17:00:00+03:00',actualStart:null,actualEnd:null,projectId:null,version:1,createdAt:'x',updatedAt:'x'};
 const b=reserveTheatreExit(e,{theatreExitBufferMin:30,mealMin:30,travelDefaultMin:30,reserveMin:15});
 expect(new Date(b!.start).getTime()).toBe(new Date(e.plannedStart!).getTime()-30*60000);
});});
