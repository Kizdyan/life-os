import type { LifeItemStatus } from './life-item';

export const STATUS_LABELS:Record<LifeItemStatus,string>={
 planned:'Запланировано',
 completed:'Выполнено',
 partial:'Частично',
 moved:'Перенесено',
 missed_time:'Не выполнено вовремя',
 not_completed:'Не выполнено вообще',
};

export function isOnSchedule(status:LifeItemStatus){return status==='completed';}
