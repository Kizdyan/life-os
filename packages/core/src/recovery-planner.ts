import type { LifeItem } from './life-item';
import { findFreeSlot, type PlannedBlock } from './planner';
import { deriveRecoveryAction, type RecoveryActionKind } from './recovery-protocol';

export interface RecoverySlot {
  itemId:string;
  action:Exclude<RecoveryActionKind,'none'|'review_fixed'>;
  start:string;
  durationMin:number;
  priorityBoost:1|2;
}

export function planRecoverySlot(input:{
  item:LifeItem;
  consecutiveMisses:number;
  date:string;
  blocks:PlannedBlock[];
  normalDurationMin:number;
  minimumDurationMin:number;
  dayStart?:string;
  dayEnd?:string;
}):RecoverySlot|null{
  const recovery=deriveRecoveryAction({item:input.item,consecutiveMisses:input.consecutiveMisses});
  if(!recovery.shouldAutoSchedule||recovery.action==='none'||recovery.action==='review_fixed') return null;

  const normal=Math.max(1,Math.floor(input.normalDurationMin));
  const minimum=Math.max(1,Math.min(normal,Math.floor(input.minimumDurationMin)));
  const durationMin=recovery.action==='minimum_version'?minimum:normal;
  const start=findFreeSlot(input.blocks,input.date,durationMin,input.dayStart??'09:00',input.dayEnd??'23:00');
  if(!start) return null;

  return {
    itemId:input.item.id,
    action:recovery.action,
    start,
    durationMin,
    priorityBoost:recovery.priorityBoost as 1|2,
  };
}
