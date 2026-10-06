export type Status='planned'|'completed'|'partial'|'moved'|'missed_time'|'not_completed';
export type Priority='low'|'normal'|'high';
export interface Item{
 id:string;title:string;kind:string;status:Status;planned_start:string|null;planned_end:string|null;
 actual_start?:string|null;actual_end?:string|null;deep_work?:boolean;carry_forward?:boolean;version?:number;
 priority?:Priority;project_id?:string|null;goal_id?:string|null;notes?:string|null;
}
export interface LifeProject{id:string;title:string;status:'active'|'completed'|'paused';goal_id?:string|null;version?:number}
export interface LifeGoal{id:string;title:string;status:'active'|'completed'|'paused';version?:number}
