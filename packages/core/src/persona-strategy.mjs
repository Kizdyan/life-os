/** Persona strategy #134: project-level creative intent, never media or publication approval. */
export const PERSONA_STRATEGY_FIELDS=Object.freeze([
 ['worldview','Взгляд','◈'],['visualStyle','Образ','◇'],['delivery','Подача','◉'],
 ['targetAudience','Аудитория','◎'],['formatType','Формат','▤'],
 ['mainGoal','Цель','✦'],['retentionStrategy','Удержание','↻']
]);
const keys=PERSONA_STRATEGY_FIELDS.map(([key])=>key);
export function isPersonaStrategy(value){
 return Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&
  keys.every(key=>typeof value[key]==='string'&&value[key].trim().length>=3&&value[key].length<=600));
}
export function defaultPersonaStrategy(){
 return {
  worldview:'Истории через актёрскую игру, авторскую музыку и режиссуру; без выдуманных биографических фактов.',
  visualStyle:'Сдержанный Quiet Luxury как основа; костюм, свет и пластика меняются ради достоверности персонажа.',
  delivery:'Осмысленные актёрские действия, интонации и паузы вместо пустого позирования.',
  targetAudience:'Кастинг-директора, режиссёры, продюсеры, бренды и широкая публика.',
  formatType:'Кинематографическая зарисовка / актёрская миниатюра / музыкальная драматургия.',
  mainGoal:'Показать профессиональный потенциал актёра и композитора, получить предложения и развивать узнаваемость.',
  retentionStrategy:'Завязка, конфликт, музыкальное развитие, поворот и эмоциональная развязка; эффекты вторичны.',
 };
}
const focuses=Object.freeze({
 'reel-01':['Режиссёры, кастинг-директора, зрители драматического кино.','Показать драматический диапазон: внутреннее событие героя, выразительная пауза и музыкальная тема.','Кинематографическая драматическая миниатюра.'],
 'reel-02':['Кастинг-директора, режиссёры, бренды, ценящие характер.','Продемонстрировать переключение между двумя образами актёра и композитора.','Актёрская миниатюра с самоиронией.'],
 'reel-03':['Режиссёры и продюсеры кино, заказчики киномузыки.','Показать способность создавать музыку к конкретному драматическому обстоятельству.','Музыкальная драматургия / режиссёрская зарисовка.'],
 'reel-04':['Режиссёры, музыкальные руководители, продюсеры.','Показать вариативность актёрской интонации и композиции на одном тексте.','Актёрский и композиторский эксперимент.'],
 'reel-05':['Режиссёры, продюсеры кино, музыкальные супервайзеры.','Показать авторский процесс рождения музыкальной темы без заявлений о реальном заказе.','Композиторская миниатюра.'],
 'reel-06':['Режиссёры, аудитория авторской музыки, музыкальные заказчики.','Продемонстрировать превращение эмоционального конфликта в музыкальную форму.','Музыкальная драматургия.'],
 'reel-07':['Кастинг-директора, режиссёры, зрители камерной драмы.','Показать работу с подтекстом, паузой и эмоциональной музыкой.','Актёрская драматическая зарисовка.'],
 'reel-08':['Режиссёры, кастинг-директора, съёмочные группы.','Передать сосредоточенность перед вымышленным дублем, не выдавая сцену за документальное событие.','Кинематографическая актёрская миниатюра.'],
 'reel-09':['Режиссёры, продюсеры, ценители лирической музыки.','Показать тонкую эмоцию и композиторское мышление через невысказанное.','Кинематографическая музыкальная зарисовка.'],
 'reel-10':['Режиссёры, бренды, заказчики музыки к кино.','Продемонстрировать способность создать атмосферу ночной сцены минимальными средствами.','Режиссёрский музыкальный эксперимент.']
});
export function strategyForArchitect(item){
 const focus=focuses[item?.id];
 if(!focus)throw Error('unknown_architect_strategy_id');
 return {...defaultPersonaStrategy(),targetAudience:focus[0],mainGoal:focus[1],formatType:focus[2]};
}
export function strategyAuditInput(project){
 const brief=project?.shootingPlan?.materials?.productionBrief;
 const beats=project?.scenarioWorkspace?.script?.currentRevision?.beats;
 return {
  title:String(project?.title??''),sourceIdea:String(project?.sourceIdea??''),
  strategy:project?.strategy??null,
  scenes:Array.isArray(beats)?beats.map(({line,action,durationSec})=>({line,action,durationSec})):
   Array.isArray(brief?.script)?brief.script.map(({line,action,durationSec})=>({line,action,durationSec})):[],
  musicalDirection:project?.architectSeed?.source?.music??brief?.capture?.audio?.recording??null,
 };
}
export function strategySnapshot(project){return JSON.stringify(strategyAuditInput(project))}
export function readPersonaStrategyAudit(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||
  !['PASS','WARNING','BLOCKED'].includes(value.status)||
  typeof value.recommendation!=='string'||!value.recommendation.trim()||value.recommendation.length>2000||
  typeof value.snapshot!=='string'||value.snapshot.length>24000||
  typeof value.provider!=='string'||!['openrouter','openai'].includes(value.provider)||
  typeof value.model!=='string'||value.model.length<1||value.model.length>120||
  typeof value.checkedAt!=='string'||!Number.isFinite(Date.parse(value.checkedAt)))return null;
 return value;
}
export function currentPersonaStrategyAudit(project){
 const audit=readPersonaStrategyAudit(project?.strategyAudit);
 return audit&&isPersonaStrategy(project?.strategy)&&audit.snapshot===strategySnapshot(project)?audit:null;
}
