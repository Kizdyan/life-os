import type{Item}from'./types';

export interface StorageLike{getItem(key:string):string|null;setItem(key:string,value:string):void}
export interface LocalPlanInput{title:string;planned_start:string;planned_end:string|null;kind?:string;carry_forward?:boolean}
interface LocalState{schemaVersion:1;items:Item[];plans:Record<string,string[]>}
export interface LocalEdit {title:string;planned_start:string;planned_end:string|null;resetToPlanned?:boolean}
const KEY='life-os:local-runtime:v1';

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
  if(key==='__proto__'||key==='constructor'||key==='prototype'||key.length>500)
    throw new Error('Недопустимый ключ плана.');
  const state=read(storage);
  const known=state.plans[key];
  if(known)return{applied:false,ids:[...known],replayed:true};

  const created:Item[]=inputs.map(input=>{
    validatePlan(input.title,input.planned_start,input.planned_end);

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

  const existingIds=new Set(state.items.map(x=>x.id));
  if(created.some(x=>!x.id||existingIds.has(x.id))||
     new Set(created.map(x=>x.id)).size!==created.length)
    throw Error('Ошибка создания ID задачи; план не сохранён.');
  ensureNoTimeOverlap(state.items,created);
  state.items.push(...created);
  state.plans[key]=created.map(item=>item.id);
  write(storage,state);
  return{applied:true,ids:created.map(item=>item.id),replayed:false};
}

/** Delete only a device-local task, leaving other tasks and plan IDs intact. */
export function deleteLocalTask(storage:StorageLike,id:string):boolean {
  if(!id.trim())throw new Error('Task ID is required');
  const state=read(storage);
  if(!state.items.some(item=>item.id===id))return false;
  state.items=state.items.filter(item=>item.id!==id);
  for(const [key,ids] of Object.entries(state.plans)){
    if(!ids.includes(id))continue;
    const left=ids.filter(itemId=>itemId!==id);
    if(left.length)state.plans[key]=left;
    else delete state.plans[key];
  }
  write(storage,state);
  return true;
}

/** Save an edit atomically. A conflict or invalid time leaves storage untouched. */
export function editLocalTask(storage:StorageLike,id:string,edit:LocalEdit):Item {
  const state=read(storage);
  const index=state.items.findIndex(x=>x.id===id);
  if(index<0)throw new Error('Задача не найдена; обнови расписание.');
  validatePlan(edit.title,edit.planned_start,edit.planned_end);
  const previous=state.items[index];
  if(edit.resetToPlanned&&previous.status!=='completed'&&previous.status!=='not_completed')
    throw Error('Возврат в план доступен только для завершённой или невыполненной задачи.');
  const revised:Item={
    ...previous,
    title:edit.title.trim(),
    planned_start:edit.planned_start,
    planned_end:edit.planned_end,
    status:edit.resetToPlanned?'planned':previous.status,
  };
  ensureNoTimeOverlap(state.items.filter(x=>x.id!==id),[revised]);
  state.items[index]=revised;
  write(storage,state);
  return revised;
}
export function findLocalTimeConflicts(storage:StorageLike,edit:LocalEdit,excludeId?:string):Item[] {
  validatePlan(edit.title,edit.planned_start,edit.planned_end);
  return conflicts(read(storage).items.filter(i=>i.id!==excludeId),edit);
}
function validatePlan(title:string,start:string,end:string|null|undefined){
  if(!title.trim()||title.length>1000)throw Error('Название задачи должно содержать от 1 до 1000 символов.');
  if(!start||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(start)||!Number.isFinite(Date.parse(start)))
    throw Error('Некорректная дата или время начала.');
  if(end!==null&&end!==undefined&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(end)||!Number.isFinite(Date.parse(end))||Date.parse(end)<=Date.parse(start)))
    throw Error('Время окончания должно быть позже начала.');
}
function conflicts(existing:Item[],candidate:LocalEdit):Item[] {
  if(candidate.planned_end===null)return[];
  const start=Date.parse(candidate.planned_start),end=Date.parse(candidate.planned_end);
  return existing.filter(x=>x.status==='planned'&&x.planned_start&&x.planned_end&&
    start<Date.parse(x.planned_end)&&end>Date.parse(x.planned_start));
}
function ensureNoTimeOverlap(existing:Item[],added:Item[]){
  for(let i=0;i<added.length;i++){
    if(added[i].status!=='planned')continue;
    const hit=conflicts([...existing,...added.slice(0,i)],{
      title:added[i].title,planned_start:added[i].planned_start!,
      planned_end:added[i].planned_end,
    })[0];
    if(hit)throw Error('Пересечение с задачей «'+hit.title+'» — измени время.');
  }
}

export function applyLocalOutcome(
  storage:StorageLike,
  item:Item,
  command:'complete'|'not_complete',
  createId:()=>string,
):{current:Item;successor:Item|null}{
  const state=read(storage);
  const index=state.items.findIndex(candidate=>candidate.id===item.id);
  if(index<0)throw Error('Задача не найдена; обнови расписание.');
  const existing=state.items[index];
  const target=command==='complete'?'completed':existing.carry_forward?'missed_time':'not_completed';
  if(existing.status===target)return{current:existing,successor:null};
  if(existing.status==='missed_time')throw Error('Задача уже перенесена. Проверь завтрашнее расписание.');
  const carry=command==='not_complete'&&existing.carry_forward===true;
  const current:Item={
    ...existing,
    status:target,
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

function read(storage:StorageLike):LocalState{
  // Malformed local state must NEVER be interpreted as empty and overwritten.
  const raw=storage.getItem(KEY);
  if(raw===null)return empty();
  let parsed:unknown;
  try{parsed=JSON.parse(raw)}catch{throw Error('Локальные данные повреждены. Не добавляй задачи, сначала сохрани копию данных.')}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Некорректное локальное хранилище Life OS.');
  const value=parsed as Partial<LocalState>;
  if(value.schemaVersion!==1||!Array.isArray(value.items)||!value.plans||
    typeof value.plans!=='object'||Array.isArray(value.plans))
    throw Error('Несовместимый формат локального хранилища Life OS.');
  if(value.items.some(x=>!x||typeof x.id!=='string'||typeof x.title!=='string'||
    typeof x.status!=='string')||
    Object.values(value.plans).some(v=>!Array.isArray(v)||v.some(id=>typeof id!=='string')))
    throw Error('Локальное хранилище содержит некорректные записи. Исходные данные сохранены.');
  return {schemaVersion:1,items:value.items,plans:value.plans};
}
function write(storage:StorageLike,state:LocalState){storage.setItem(KEY,JSON.stringify(state))}
function empty():LocalState{return{schemaVersion:1,items:[],plans:{}}}
function nextDay(date:string):string{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}
function shiftDate(value:string|null,nextDate:string):string|null{return value?`${nextDate}${value.slice(10)}`:null}
function localDate():string{const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return`${y}-${m}-${day}`}
