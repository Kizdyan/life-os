// Reproducible, explicitly launched zero-credit creative benchmark for a local Ollama model.
// Never called on production page load; never upgrades, pulls models or uses cloud APIs.
import {mkdir,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {generatePersonaLocalScenario} from './persona-local-scenario.mjs';

export const CREATIVE_CASES=[
 {key:'acting-comedy',label:'Актёрская комедия',input:{
   kind:'persona-scenario-local-input-v1',version:1,
   idea:{id:'benchmark-acting',title:'Человек, который уже подъехал',
    angle:'Один актёр играет две версии человека, опоздавшего на важную встречу; конфликт должен развиваться через реальные действия, а не общие шутки.',format:'reel'},
   storyOutline:{
    premise:'Актёр пытается доказать, что уже приехал, хотя стоит перед закрытой дверью дома.',
    hook:'В телефон он произносит «я уже подъехал», но на экране видны домашние тапочки.',
    protagonistGoal:'Сохранить доверие человека, который ждёт на другом конце города.',
    obstacle:'Звонящий просит назвать предмет перед входом, который герой не может видеть.',
    escalation:'Герой придумывает оправдания и делает вид, что описывает фасад здания.',
    turn:'В дверь квартиры звонит человек, который должен был ждать на улице.',
    payoff:'Герой открывает дверь и оказывается единственным, кто действительно опоздал.',
    actingAction:'Скрыть обман, постепенно осознавая, что он становится очевидным.',
    visualMoment:'На общем плане актёр разговаривает торжественно, стоя в смешных тапочках.'
   }
 }},
 {key:'music-comedy',label:'Актёр и музыка',input:{
   kind:'persona-scenario-local-input-v1',version:1,
   idea:{id:'benchmark-music',title:'Фортепиано разоблачает героя',
    angle:'Музыка действует как полноценный персонаж. Мини-сцена должна развиваться через оригинальные аккорды, а не использовать известную песню.',format:'reel'},
   storyOutline:{
    premise:'Музыкант хочет скрыть истинные чувства после неприятного телефонного разговора.',
    hook:'Он спокойно обещает, что всё отлично, но пианино отвечает резко диссонирующим аккордом.',
    protagonistGoal:'Убедить собеседника и самого себя, что ничего не случилось.',
    obstacle:'Каждая попытка произнести спокойную реплику сопровождается более тревожной музыкой.',
    escalation:'Герой пытается заглушить звучание, но сам начинает подыгрывать этому состоянию.',
    turn:'В момент честного признания музыка неожиданно становится простой и тихой.',
    payoff:'Оказывается, первый спокойный звук рождается тогда, когда герой перестал притворяться.',
    actingAction:'Контролировать лицо, затем постепенно уступить внутреннему переживанию.',
    visualMoment:'Переход от крупного плана спокойного лица к нервно играющим пальцам.'
   }
 }},
 {key:'cinematic',label:'Короткая кинематографичная сцена',input:{
   kind:'persona-scenario-local-input-v1',version:1,
   idea:{id:'benchmark-drama',title:'Последняя реплика',
    angle:'Короткая оригинальная сценка с актёрским конфликтом и неожиданной, но причинной развязкой без банальной морали.',format:'reel'},
   storyOutline:{
    premise:'Актёр репетирует сцену прощания перед видеозвонком с важным человеком.',
    hook:'Он повторяет одно и то же «прощай», но каждый раз удаляет записанный дубль.',
    protagonistGoal:'Найти слова, которые сохранят достоинство и не причинят другому боль.',
    obstacle:'Каждый записанный вариант звучит как чужая роль, а не собственная речь.',
    escalation:'Он пробует разные интонации, жесты и музыкальные подкладки, теряя искренность.',
    turn:'Поступает короткое сообщение, которое меняет всю ситуацию и делает репетицию ненужной.',
    payoff:'Вместо заготовленного монолога герой записывает три простых слова, впервые глядя в камеру.',
    actingAction:'Убедить отсутствующего партнёра, не скрывая уязвимость.',
    visualMoment:'На лице актёра отражается свет выключенного экрана; пауза важнее слов.'
   }
 }}
];

export async function benchmarkPersonaLocalModel({model='qwen2.5-coder:7b',outputDirectory,
 generator=generatePersonaLocalScenario}){
 if(typeof outputDirectory!=='string'||!outputDirectory.trim())throw Error('Укажи существующий или новый локальный каталог отчётов.');
 const dir=resolve(outputDirectory);await mkdir(dir,{recursive:true});
 if((await readdir(dir)).length)throw Error('Каталог результатов должен быть пустым: существующие файлы не перезаписываются.');
 const reports=[];
 for(const item of CREATIVE_CASES){
  const started=Date.now();
  try{
   const result=await generator(item.input,{model});
   const report={key:item.key,label:item.label,state:'generated',
    elapsedMs:Date.now()-started,model,
    scriptBeats:result.brief.script.length,totalDurationSec:result.brief.adaptations.reels.durationSec,
    editorialNotes:result.review.notes,
    humanReview:{status:'pending',originality:null,dialogue:null,dramaticConflict:null,
     actingPotential:null,shootability:null,notes:''}};
   await writeFile(resolve(dir,item.key+'.brief.json'),JSON.stringify(result.brief,null,2),{flag:'wx'});
   await writeFile(resolve(dir,item.key+'.review.json'),JSON.stringify(result.review,null,2),{flag:'wx'});
   reports.push(report);
  }catch(error){
   reports.push({key:item.key,label:item.label,state:'failed',elapsedMs:Date.now()-started,
    error:error instanceof Error?error.message:'local_model_unavailable',model});
  }
 }
 const summary={kind:'persona-local-creative-benchmark-v1',generatedAt:new Date().toISOString(),
  cost:'0 paid API credits',model,cases:reports,
  notice:'Model output and timings are technical evidence only. Artistic quality requires a human review; scores are never fabricated.'};
 await writeFile(resolve(dir,'benchmark-report.json'),JSON.stringify(summary,null,2),{flag:'wx'});
 return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),index=args.indexOf('--out'),modelIndex=args.indexOf('--model');
 if(index<0||!args[index+1]){console.error('Usage: node tools/persona-local-creative-benchmark.mjs --out ./benchmark-results [--model qwen2.5-coder:7b]');process.exitCode=2;}
 else benchmarkPersonaLocalModel({outputDirectory:args[index+1],model:modelIndex>=0?args[modelIndex+1]:'qwen2.5-coder:7b'})
  .then(result=>{console.log(JSON.stringify(result,null,2));if(result.cases.some(x=>x.state!=='generated'))process.exitCode=1;},
    error=>{console.error('Benchmark not started: '+error.message);process.exitCode=1;});
}
