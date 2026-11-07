#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const required=(x,key)=>{if(typeof x!=='string'||!x.trim()||x.length>700)throw Error('Invalid '+key);return x.trim()};
export function buildBrief({idea,authorApproved=false,goal='Профессиональное позиционирование',durationSec=35}={}){
 if(!idea||typeof idea!=='object')throw Error('Missing idea');
 const id=required(idea.id,'id'),title=required(idea.title,'title'),hook=required(idea.hook,'hook'),angle=required(idea.angle,'angle');
 if(!Number.isInteger(durationSec)||durationSec<15||durationSec>90)throw Error('Invalid duration');
 goal=required(goal,'goal');
 const boundaries=[0,Math.round(durationSec*.16),Math.round(durationSec*.42),Math.round(durationSec*.75),durationSec];
 const shots=[
  {number:1,startSec:boundaries[0],endSec:boundaries[1],purpose:'Хук',action:hook,frame:'Крупный план, взгляд в объектив',sound:'Чистая речь, без музыки в первые секунды'},
  {number:2,startSec:boundaries[1],endSec:boundaries[2],purpose:'Актёрская демонстрация',action:'Показать действие, которое раскрывает: '+angle,frame:'Средний план, контролировать фон',sound:'Записать отдельный чистый дубль голоса'},
  {number:3,startSec:boundaries[2],endSec:boundaries[3],purpose:'Музыкальный контрапункт',action:'Показать реальное исполнение или процесс сочинения; без имитации навыка',frame:'Деталь рук и инструмента; B-roll только с разрешением',sound:'Записать живой звук инструмента и room tone'},
  {number:4,startSec:boundaries[3],endSec:boundaries[4],purpose:'Развязка и приглашение',action:'Завершить историю и предложить зрителю познакомиться с работами автора',frame:'Возврат к лицу, удержать взгляд',sound:'Не перекрывать речь музыкой'}
 ];
 return {schemaVersion:1,kind:'persona-production-brief',ideaId:id,title,goal,durationSec,format:'9:16',status:authorApproved?'READY_FOR_SHOOT_REVIEW':'AWAITING_AUTHOR_IDEA_SELECTION',shots,requirements:{location:'Тихая комната с управляемым светом',gear:['Камера или смартфон','Штатив','Постоянный источник света','Внешний микрофон по возможности'],quality:['Проверить баланс белого и экспозицию до дубля','Сохранить исходники без изменений','Записать 10 секунд тишины','Проверить отсутствие клиппинга и чёрных кадров','Не менять геометрию лица при цветокоррекции'],deliverables:['Исходники','Монтажный черновик','MP4 9:16','Субтитры','Отчёт о качестве']},authorApproval:{ideaApproved:Boolean(authorApproved),shootApproved:false,publicationApproved:false}};
}
export function renderBrief(b){return ['# Persona — Съёмочный лист','',`**${b.ideaId} · ${b.title}**`,`Цель: ${b.goal}`,`Хронометраж: ${b.durationSec} с · ${b.format}`,`Статус: ${b.status}`,'','## Кадры',...b.shots.flatMap(s=>['',`### ${s.number}. ${s.purpose} (${s.startSec}–${s.endSec} с)`,`Действие: ${s.action}`,`Кадр: ${s.frame}`,`Звук: ${s.sound}`]),'','## Подготовка',`Локация: ${b.requirements.location}`,...b.requirements.gear.map(x=>'- '+x),'','## Контроль качества',...b.requirements.quality.map(x=>'- '+x),'','## Результат',...b.requirements.deliverables.map(x=>'- '+x),'','**Съёмка и публикация требуют отдельного согласования.**',''].join('\n')}
export async function run({input,output,approved=false,goal,durationSec}){const obj=JSON.parse(await readFile(resolve(input),'utf8'));const idea=obj.idea??obj;const b=buildBrief({idea,authorApproved:approved,goal,durationSec});const dir=resolve(output);await mkdir(dir,{recursive:true});await writeFile(join(dir,'production-brief.json'),JSON.stringify(b,null,2)+'\n');await writeFile(join(dir,'production-brief.md'),renderBrief(b));return {status:b.status,output:dir}}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args=process.argv.slice(2);const flag=k=>args[args.indexOf(k)+1];const input=flag('--input'),output=flag('--output');if(!input||!output||input.startsWith('--')||output.startsWith('--')){console.error('Usage: node tools/persona-production-brief.mjs --input idea.json --output dir [--approved]');process.exit(2)}run({input,output,approved:args.includes('--approved')}).then(console.log).catch(e=>{console.error(e.message);process.exitCode=1})}
