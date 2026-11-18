#!/usr/bin/env node
/**
 * Seed 10 authored PHOTO-001…PHOTO-010 carousels as real Persona Quick Render
 * ProductionJobs in WAITING_FOR_FOOTAGE. Does not fabricate or upload photographs.
 *
 * Default root matches the LOCAL Media Worker, not a hosted database:
 *   node tools/seed_carousels.mjs
 *   node tools/seed_carousels.mjs --output-root "C:\path\to\quick-renders"
 *
 * Idempotent by deterministic project ID. Never overwrite existing author work.
 */
import {createHash,randomUUID} from 'node:crypto';
import {access,mkdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ProductionJob} from './persona_orchestrator.mjs';
import {defaultPersonaStrategy} from '../packages/core/src/persona-strategy.mjs';
import {quickRenderRoot} from './persona-quick-render.mjs';
import {normalizeCarouselSlides} from './persona-quick-platforms.mjs';

// Verbatim author-approved ideas, slide titles, photo instructions and presets
// from the conversation. Photo descriptions are NOT fabricated image assets.
export const carouselPlan={
 collection:"Persona Photo Carousels Vol. 1",version:1,
 defaults:{contentType:"photo-carousel",carouselAspect:"4:5",resolution:[1080,1350],
  subtitlePreset:"signature-gold",textAccents:true,authorReviewRequired:true},
 projects:[
  {id:"PHOTO-001",title:"Четыре секунды до выбора",
   goal:"Показать актерский диапазон и психологическую выразительность",colorPreset:"DetailCinematic",
   slides:[
    {text:"Он ещё верит",photo:"Крупный портрет. Открытый взгляд, едва заметная надежда."},
    {text:"Теперь он сомневается",photo:"Тот же ракурс. Сдержанное напряжение, взгляд немного в сторону."},
    {text:"Улыбка ничего не объясняет",photo:"Полуулыбка при напряженном взгляде. Противоречие между эмоциями."},
    {text:"Решение уже принято",photo:"Спокойный прямой взгляд. Статичность, холодный боковой свет."}
   ]},
  {id:"PHOTO-002",title:"Пока нота не стала сценой",
   goal:"Показать композиторский процесс",colorPreset:"SoftCinematic",
   slides:[
    {text:"Здесь пока тихо",photo:"Чистый нотный лист на деревянном столе. Мягкий оконный свет."},
    {text:"Но ритм уже есть",photo:"Рука с карандашом над нотной бумагой, несколько набросков."},
    {text:"Пальцы ищут форму",photo:"Крупный план рук на клавишах фортепиано."},
    {text:"Пауза обрела голос",photo:"Портрет за пианино, взгляд в партитуру. Теплый контровой свет."}
   ]},
  {id:"PHOTO-003",title:"Один стул, три человека",
   goal:"Показать актерскую трансформацию",colorPreset:"DetailCinematic",
   slides:[
    {text:"Предмет всегда один",photo:"Один стул в пустом пространстве. Минимальная сценография."},
    {text:"Один ждёт ответа",photo:"Актер сидит на краю стула, слегка наклонившись вперед."},
    {text:"Другой прячет вину",photo:"Та же одежда и стул. Закрытая поза, руки сцеплены."},
    {text:"Третий больше не ждёт",photo:"Актер сидит свободно. Прямой взгляд, расслабленные плечи."}
   ]},
  {id:"PHOTO-004",title:"Кадр умеет скрывать",
   goal:"Продемонстрировать режиссерское мышление",colorPreset:"SoftCinematic",
   slides:[
    {text:"Сначала важна дистанция",photo:"Общий план комнаты с одиноким персонажем."},
    {text:"Потом один жест",photo:"Деталь руки персонажа. Остальное пространство скрыто."},
    {text:"За границей кадра — выбор",photo:"Портрет с большим пустым пространством перед взглядом."},
    {text:"Зритель сам делает шаг",photo:"Крупный план глаз. Направленный свет, прямой контакт."}
   ]},
  {id:"PHOTO-005",title:"Одна секунда на экране",
   goal:"Показать профессиональный процесс создания кадра",colorPreset:"DetailCinematic",
   slides:[
    {text:"В кадре — одна секунда",photo:"Выразительный финальный портрет или кадр из собственной съемки."},
    {text:"За кадром — работа",photo:"Сценарий с пометками, блокинг или режиссерские записи."},
    {text:"Свет проверяет детали",photo:"Световой прибор, отражатель или настройка света на площадке."},
    {text:"Остаётся только взгляд",photo:"Итоговый портрет из той же съемочной сцены."}
   ]},
  {id:"PHOTO-006",title:"Музыка спорит с текстом",
   goal:"Показать соединение музыки и драматургии",colorPreset:"SoftCinematic",
   slides:[
    {text:"Мелодии недостаточно",photo:"Лист нотной партитуры, рядом черновик сценария."},
    {text:"Ей нужен конфликт",photo:"Контраст света и тени на клавиатуре фортепиано."},
    {text:"Герою — причина молчать",photo:"Постановочный портрет молчащего персонажа."},
    {text:"Нота становится поступком",photo:"Руки на клавишах и открытая партитура, выразительная композиция."}
   ]},
  {id:"PHOTO-007",title:"История без диалога",
   goal:"Заинтересовать зрителя визуальной загадкой",colorPreset:"DetailCinematic",
   slides:[
    {text:"Ключ лежит неслучайно",photo:"Один ключ на темном деревянном столе."},
    {text:"Дверь всё ещё закрыта",photo:"Закрытая дверь в коридоре, свет из соседней комнаты."},
    {text:"В прихожей горит свет",photo:"Пустая прихожая, источник теплого света вне кадра."},
    {text:"Кого здесь ждут?",photo:"Силуэт человека возле двери. Лица не видно."}
   ]},
  {id:"PHOTO-008",title:"Свет меняет характер",
   goal:"Показать выразительность портрета и световой режиссуры",colorPreset:"SoftCinematic",
   slides:[
    {text:"Один человек",photo:"Нейтральный портрет, ровный мягкий свет."},
    {text:"Свет меняет вопрос",photo:"Тот же портрет с жестким боковым освещением."},
    {text:"Тень скрывает ответ",photo:"Половина лица в тени, остальное освещено."},
    {text:"Но взгляд всё тот же",photo:"Тот же ракурс с мягким контровым светом."}
   ]},
  {id:"PHOTO-009",title:"Мюзикл без занавеса",
   goal:"Показать процесс работы над авторским мюзиклом",colorPreset:"SoftCinematic",
   slides:[
    {text:"Сначала — чужое решение",photo:"Фрагмент собственного сценария или либретто, без раскрытия ключевого поворота."},
    {text:"Потом — новая мелодия",photo:"Фрагмент авторской партитуры на пюпитре."},
    {text:"Два голоса врозь",photo:"Две партии на нотной странице или две символически разделенные фигуры."},
    {text:"Сцена требует ответа",photo:"Пустая театральная сцена или личный режиссерский эскиз."}
   ]},
  {id:"PHOTO-010",title:"Не резюме. Четыре кадра.",
   goal:"Представить профессиональную идентичность актера, композитора и режиссера",colorPreset:"DetailCinematic",
   slides:[
    {text:"В кадре — актёр",photo:"Сильный актерский портрет в кинематографичном свете."},
    {text:"За клавишами — композитор",photo:"Реальное фото за фортепиано, руки и лицо в кадре."},
    {text:"За кадром — режиссёр",photo:"Фото с режиссерским сценарием, раскадровкой или на репетиции."},
    {text:"В центре — одна история",photo:"Цельный авторский портрет, спокойный прямой взгляд."}
   ]}
 ]
};

const json=v=>JSON.stringify(v,null,2)+'\n';
const seedSha=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
export const seededQuickId=id=>{
 if(!/^PHOTO-0(?:0[1-9]|10)$/.test(id))throw Error('Invalid carousel source ID');
 const h=createHash('sha256').update('persona-carousel-v1:'+id).digest('hex');
 return [h.slice(0,8),h.slice(8,12),'5'+h.slice(13,16),'a'+h.slice(17,20),h.slice(20,32)].join('-');
};
export function assertCarouselPlan(plan=carouselPlan){
 if(plan?.version!==1||!Array.isArray(plan.projects)||plan.projects.length!==10)
  throw Error('Ten carousel projects required');
 const ids=new Set();
 for(const p of plan.projects){
  if(!/^PHOTO-0(?:0[1-9]|10)$/.test(p.id)||ids.has(p.id)||
   !p.title?.trim()||!p.goal?.trim()||!['SoftCinematic','DetailCinematic'].includes(p.colorPreset))
   throw Error('Invalid carousel project: '+p.id);
  ids.add(p.id);
  if(!Array.isArray(p.slides)||p.slides.length<3||p.slides.length>5)
   throw Error('Carousel must contain 3–5 slide descriptions');
  normalizeCarouselSlides(p.slides,p.slides.length);
 }
 if(ids.size!==10||[...Array(10)].some((_,i)=>!ids.has('PHOTO-'+String(i+1).padStart(3,'0'))))
  throw Error('Carousel IDs are not contiguous');
 return plan;
}
async function seedOne(root,p){
 const id=seededQuickId(p.id),folder=join(root,'quick-'+id),expected=seedSha(p);
 let exists=false;
 try{await access(folder);exists=true}catch(e){if(e.code!=='ENOENT')throw e}
 if(exists){
  const meta=JSON.parse(await readFile(join(folder,'quick-state.json'),'utf8'));
  const stored=JSON.parse(await readFile(join(folder,'output','carousel-seed.json'),'utf8'));
  const state=await new ProductionJob(folder).read();
  if(state.contentType!=='photo-carousel'||meta.id!==id||meta.seedKey!==p.id||stored.seedSha256!==expected||
    seedSha(stored.project)!==expected||!Array.isArray(meta.slides)||
    JSON.stringify(meta.slides)!==JSON.stringify(p.slides))
   throw Error('Existing seeded project has changed: '+p.id+'; not overwriting');
  return {seedKey:p.id,id,title:p.title,created:false,status:state.status,
   slides:meta.slides.length,directory:folder};
 }
 const temp=join(root,'.pending-'+p.id+'-'+randomUUID());
 let own=false;
 try{
  const job=await ProductionJob.create(temp,{title:p.title,strategy:defaultPersonaStrategy(),contentType:'photo-carousel'});
  own=true;
  const meta={version:1,id,title:p.title,prompt:p.goal,seedKey:p.id,
   contentType:'photo-carousel',carouselAspect:'4:5',coverTitle:'',
   slides:p.slides,goal:p.goal,files:[],uploads:[],appearance:{styleChoice:'signature-gold',
    colorPreset:p.colorPreset,stylePack:'Cinematic',subtitlePreset:'signature-gold'},
   autoStyle:false,textAccents:true,fastDraft:false,directFull:true,
   sourceConsent:false,stage:'Ожидает фотографии',createdAt:new Date().toISOString(),
   updatedAt:new Date().toISOString()};
  await writeFile(join(temp,'quick-state.json'),json(meta),{flag:'wx'});
  await writeFile(join(temp,'output','carousel-seed.json'),json({
   version:1,seedKey:p.id,seedSha256:expected,project:p,
   publicationApproved:false,footageAvailable:false,requestedStatus:'WAITING_FOR_FOOTAGE'}),{flag:'wx'});
  const ready=await job.transition('WAITING_FOR_FOOTAGE',{
   reason:'Carousel editorial brief imported: 4 author slides, photos pending, no publishing approval'});
  await rename(temp,folder);
  return {seedKey:p.id,id,title:p.title,created:true,status:ready.status,
   slides:p.slides.length,directory:folder};
 }catch(error){if(own)await rm(temp,{recursive:true,force:true}).catch(()=>{});throw error}
}
export async function seedCarousels(outputRoot=quickRenderRoot()){
 assertCarouselPlan();
 const root=resolve(outputRoot);
 await mkdir(root,{recursive:true});
 const jobs=[];
 for(const project of carouselPlan.projects)jobs.push(await seedOne(root,project));
 return {root,count:jobs.length,created:jobs.filter(j=>j.created).length,
  existing:jobs.filter(j=>!j.created).length,waiting:jobs.filter(j=>j.status==='WAITING_FOR_FOOTAGE').length,
  totalSlides:jobs.reduce((n,j)=>n+j.slides,0),jobs};
}

const runningAsCli=process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]);
if(runningAsCli){
 const args=process.argv.slice(2),idx=args.indexOf('--output-root');
 if(args.some((x,i)=>x.startsWith('--')&&(x!=='--output-root'||i!==idx))||
   (idx>=0&&(!args[idx+1]||args.length!==2))||(idx<0&&args.length))
  {console.error('Usage: node tools/seed_carousels.mjs [--output-root PATH]');process.exitCode=2}
 else seedCarousels(idx>=0?args[idx+1]:quickRenderRoot())
  .then(x=>console.log(JSON.stringify({status:'PASS',...x},null,2)))
  .catch(e=>{console.error('Carousel seed failed: '+e.message);process.exitCode=1});
}
