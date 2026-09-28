import type { AutonomyEngine } from './engine';
import { setOutcomeAction } from './commands';

export async function markDone(engine:AutonomyEngine,itemId:string,plannedDate:string){
  const id=crypto.randomUUID();
  return engine.run(setOutcomeAction({itemId,command:'complete',plannedDate,carryForward:false,source:'ui'},id));
}

export async function markNotDone(engine:AutonomyEngine,itemId:string,plannedDate:string){
  const id=crypto.randomUUID();
  return engine.run(setOutcomeAction({itemId,command:'not_complete',plannedDate,carryForward:false,source:'ui'},id));
}

export async function markMissedAndCarry(engine:AutonomyEngine,itemId:string,plannedDate:string,nextDate:string){
  const id=crypto.randomUUID();
  return engine.run(setOutcomeAction({itemId,command:'not_complete',plannedDate,carryForward:true,nextDate,source:'ui'},id));
}
