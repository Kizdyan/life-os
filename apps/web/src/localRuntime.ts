import type{Item}from'./types';

export interface StorageLike{getItem(key:string):string|null;setItem(key:string,value:string):void}
export interface LocalPlanInput{title:string;planned_start:string;planned_end:string|null;kind?:string;carry_forward?:boolean}
interface LocalState{schemaVersion:1;items:Item[];plans:Record<string,string[]>}
const KEY='life-os:local-runtime:v1';
const MOVE_UNDO_KEY='life-os:local-move-undo:v1';

/** All locally persisted tasks, including dates outside Today. */
export function readLocalItems(storage:StorageLike):Item[] {
  return [...read(storage).items].sort((a,b)=>(a.planned_start??'').localeCompare(b.planned_start??''));
}

export function readLocalToday(storage:StorageLike,date:string):Item[]{
  return read(storage).items
    .filter(item=>item.planned_start?.slice(0,10)===date)
    .sort((a,b)=>(a.planned_start??'').localeCompare(b.planned_start??''));
}

export function applyLocalPlan(
  storage:StorageLike,
  idempotencyKey:string,
  inputs:LocalPlanInput[],
  createId:()=>string,
):{applied:boolean;ids:string[];replayed:boolean}{
  const key=idempotencyKey.trim();
  if(!key)throw new Error('Idempotency key is required');
  const state=read(storage);
  const known=state.plans[key];
  if(known)return{applied:false,ids:[...known],replayed:true};

  const created:Item[]=inputs.map(input=>{
    if(!input.title.trim())throw new Error('Plan title is required');
    if(!input.planned_start)throw new Error('planned_start is required');
    return{
      id:createId(),
      title:input.title.trim(),
      kind:input.kind?.trim()||'task',
      status:'planned',
      planned_start:input.planned_start,
      planned_end:input.planned_end??null,
      carry_forward:input.carry_forward===true,
    };
  });

  state.items.push(...created);
  state.plans[key]=created.map(item=>item.id);
  write(storage,state);
  return{applied:true,ids:created.map(item=>item.id),replayed:false};
}

export function applyLocalOutcome(
  storage:StorageLike,
  item:Item,
  command:'complete'|'not_complete',
  createId:()=>string,
):{current:Item;successor:Item|null}{
  const state=read(storage);
  const index=state.items.findIndex(candidate=>candidate.id===item.id);
  const existing=index>=0?state.items[index]:item;
  const carry=command==='not_complete'&&existing.carry_forward===true;
  const current:Item={
    ...existing,
    status:command==='complete'?'completed':carry?'missed_time':'not_completed',
  };
  if(index>=0)state.items[index]=current;else state.items.push(current);

  let successor:Item|null=null;
  if(carry){
    const nextDate=nextDay(existing.planned_start?.slice(0,10)??localDate());
    successor={
      ...existing,
      id:createId(),
      status:'planned',
      planned_start:shiftDate(existing.planned_start,nextDate),
      planned_end:shiftDate(existing.planned_end,nextDate),
    };
    state.items.push(successor);
  }

  write(storage,state);
  return{current,successor};
}

export interface LocalMoveUndo{itemId:string;before:string|undefined;after:string;revision:string}

export function moveLocalItem(storage:StorageLike,itemId:string,plannedStart:string):{item:Item;undo:LocalMoveUndo}{
  if(!plannedStart)throw new Error('planned_start is required');
  const state=read(storage);const index=state.items.findIndex(item=>item.id===itemId);
  if(index<0)throw new Error('item not found');
  const before=state.items[index];const revision=`${itemId}:${before.planned_start??''}:${plannedStart}`;
  const item={...before,planned_start:plannedStart};state.items[index]=item;write(storage,state);
  const persisted=read(storage).items.find(candidate=>candidate.id===itemId);
  if(!persisted||persisted.planned_start!==plannedStart)throw new Error('move persistence failed');
  const undo={itemId,before:before.planned_start,after:plannedStart,revision};
  storage.setItem(MOVE_UNDO_KEY,JSON.stringify(undo));
  return{item:persisted,undo};
}

export function undoLocalMove(storage:StorageLike,undo:LocalMoveUndo):Item{
  const state=read(storage);const index=state.items.findIndex(item=>item.id===undo.itemId);
  if(index<0||state.items[index].planned_start!==undo.after)throw new Error('stale move undo');
  const item={...state.items[index],planned_start:undo.before};state.items[index]=item;write(storage,state);
  const persisted=read(storage).items.find(candidate=>candidate.id===undo.itemId);
  if(!persisted||persisted.planned_start!==undo.before)throw new Error('undo persistence failed');
  storage.setItem(MOVE_UNDO_KEY,'');
  return persisted;
}

export function readLocalMoveUndo(storage:StorageLike):LocalMoveUndo|null{
  try{const value=JSON.parse(storage.getItem(MOVE_UNDO_KEY)||'null');return value&&typeof value.itemId==='string'&&typeof value.after==='string'&&typeof value.revision==='string'?value:null}catch{return null}
}

function read(storage:StorageLike):LocalState{
  try{
    const raw=storage.getItem(KEY);
    if(!raw)return empty();
    const parsed=JSON.parse(raw) as Partial<LocalState>;
    if(parsed.schemaVersion!==1||!Array.isArray(parsed.items)||!parsed.plans||typeof parsed.plans!=='object')return empty();
    return{schemaVersion:1,items:parsed.items as Item[],plans:parsed.plans as Record<string,string[]>};
  }catch{return empty()}
}
function write(storage:StorageLike,state:LocalState){storage.setItem(KEY,JSON.stringify(state))}
function empty():LocalState{return{schemaVersion:1,items:[],plans:{}}}
function nextDay(date:string):string{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}
function shiftDate(value:string|null,nextDate:string):string|null{return value?`${nextDate}${value.slice(10)}`:null}
function localDate():string{const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return`${y}-${m}-${day}`}
