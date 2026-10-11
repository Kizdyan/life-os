export type Status='planned'|'completed'|'partial'|'moved'|'missed_time'|'not_completed';

export interface Item{
  id:string;
  title:string;
  kind:string;
  status:Status;
  planned_start:string|null;
  planned_end:string|null;
  carry_forward?:boolean;
  version?:number;
}
