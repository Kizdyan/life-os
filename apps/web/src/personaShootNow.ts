/**
 * One-screen shoot execution data, not an approval or evidence of filmed media.
 * A project-specific checklist is scoped to the exact edited scene sequence.
 */
export type PersonaShootScene={
 id:string;seconds:number;line:string;action:string;
 framing:string;lighting:string;camera:string;performance:string;edit:string;
 sourceFileName?:string;
};
export type PersonaShootSetup={
 location:string;camera:string;lighting:string;sound:string;
 wardrobe:string;arrangement:string;
};
export type PersonaShootPlan={
 title:string;setup:PersonaShootSetup;scenes:PersonaShootScene[];
 status:'example'|'draft'|'approved';
};
export type PersonaShootProgress={
 version:1;fingerprint:string;completedIds:string[];updatedAt:string;
};
export const SHOOT_PROGRESS_PREFIX='persona:shoot-progress:v1:';

const isObject=(value:unknown):value is Record<string,unknown>=>
 value!==null&&typeof value==='object'&&!Array.isArray(value);
export function shootProgressKey(projectId:string):string{
 if(!/^[a-zA-Z0-9_-]{1,128}$/.test(projectId))throw Error('Invalid shoot project ID');
 return SHOOT_PROGRESS_PREFIX+projectId;
}
/** Stable, collision-resistant enough for UI version invalidation (not a cryptographic proof). */
export function shootPlanFingerprint(plan:PersonaShootPlan):string{
 return JSON.stringify(plan.scenes.map(s=>[s.id,s.seconds,s.line,s.action,s.framing,s.camera,s.lighting,s.performance,s.edit]));
}
export function readShootProgress(raw:unknown,plan:PersonaShootPlan):PersonaShootProgress|null{
 if(!isObject(raw)||raw.version!==1||raw.fingerprint!==shootPlanFingerprint(plan)||
  !Array.isArray(raw.completedIds)||raw.completedIds.length>plan.scenes.length||
  typeof raw.updatedAt!=='string'||!Number.isFinite(Date.parse(raw.updatedAt)))return null;
 const known=new Set(plan.scenes.map(s=>s.id)),seen=new Set<string>();
 for(const id of raw.completedIds){
  if(typeof id!=='string'||!known.has(id)||seen.has(id))return null;
  seen.add(id);
 }
 return raw as PersonaShootProgress;
}
export function markShootTake(
 plan:PersonaShootPlan,current:PersonaShootProgress|null,id:string,completed:boolean,now:string,
):PersonaShootProgress{
 if(!plan.scenes.some(s=>s.id===id)||!Number.isFinite(Date.parse(now)))throw Error('Invalid take mark');
 const base=readShootProgress(current,plan);
 const completedIds=new Set(base?.completedIds??[]);
 if(completed)completedIds.add(id);
 else completedIds.delete(id);
 return {version:1,fingerprint:shootPlanFingerprint(plan),
  completedIds:[...completedIds],updatedAt:now};
}
export function shootTimecode(plan:PersonaShootPlan,index:number):string{
 const total=plan.scenes.slice(0,index).reduce((s,scene)=>s+scene.seconds,0);
 return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
}
export function makeShootSheet(plan:PersonaShootPlan):string{
 const lines=[
  '# '+plan.title,
  '',
  plan.status==='approved'?'Сценарий и Production Brief отмечены как утверждённые в проекте.':
   'РАБОЧИЙ ПЛАН: редакторская приёмка ещё не выполнена; публикация не разрешена.',
  '',
  '## Перед первым дублем',
  'Локация: '+plan.setup.location,
  'Камера: '+plan.setup.camera,
  'Свет: '+plan.setup.lighting,
  'Звук: '+plan.setup.sound,
  'Костюм/реквизит: '+plan.setup.wardrobe,
  'Расстановка: '+plan.setup.arrangement,
  '',
  '## Что снимать по порядку',
  ...plan.scenes.flatMap((s,index)=>[
   '### '+(index+1)+'. '+s.id+' · '+shootTimecode(plan,index)+' · '+s.seconds+' с',
   'Сказать: '+s.line,
   'Действие: '+s.action,
   'План: '+s.framing,
   'Камера: '+s.camera,
   'Свет: '+s.lighting,
   'Игра: '+s.performance,
   'Монтаж: '+s.edit,
   ...(s.sourceFileName?['Имя файла: '+s.sourceFileName]:[]),
   '',
  ]),
  '## Перед монтажом',
  'Проверить речь и звук, снять дополнительные реакции, общий план и детали.',
  'Это съёмочный ориентир, а не автоматически проверенный или опубликованный ролик.',
 ];
 return lines.join('\n');
}
