export type Status='planned'|'completed'|'partial'|'moved'|'missed_time'|'not_completed';
export interface Item{id:string;title:string;kind:string;status:Status;planned_start:string|null;planned_end:string|null;actual_start?:string|null;actual_end?:string|null;deep_work?:boolean;carry_forward?:boolean;version?:number}
