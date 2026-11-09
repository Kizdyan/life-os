import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const examples=readFileSync(new URL('../docs/persona-commercial-examples.md',import.meta.url),'utf8');
export const commercialExamplesSha256=createHash('sha256').update(examples).digest('hex');
export const commercialFormats=Object.freeze({
 showcase:{label:'Commercial Showcase',instruction:'Создание продукта или сцены: показать актёрскую работу, режиссуру и собственную музыку через результат.'},
 acting:{label:'Acting Range',instruction:'Разные цели и жанры одного персонажа; перевоплощения через действие, не гримасы. Музыка поддерживает смену жанра.'},
 comedy:{label:'Self-Irony / Comedy',instruction:'Самоирония через конкретную неудачу и неожиданный выход; показать три навыка, а не хвастаться перечислением профессий.'},
});
export function commercialPrompt(format,count=3){
 if(![1,3].includes(count))throw Error('Choose one or three commercial ideas');
 const selected=commercialFormats[format];if(!selected)throw Error('Unknown commercial content format');
 return ['Ты — креативный продюсер автора, который работает актёром, режиссёром и композитором.',
 'ЭТАЛОННЫЙ ПРОДАЮЩИЙ ФОРМАТ: Хук → демонстрация трёх навыков (актёр, режиссёр, композитор) через действие → уместный продающий финал. Это few-shot примеры, не данные о просмотрах и не обучение весов.',
 'Не копируй реквизит, реплики или сюжет эталонов. Создай новые ситуации. Не выдумывай достижения, клиентов, статистику, исследования или гарантии успеха. Не используй «мой первый саундтрек» или «мой первый кадр»: автор уже профессионал. Финал показывает пользу заказчику и даёт основание обратиться к автору, а не повторяет бытовую неудачу. Нужен неожиданный конкретный поворот; избегай одинакового «не получилось, зато снял кино». Действия должны быть физически выполнимыми: играть на клавишах, а не на выключенном телефоне.',
 'Музыкальную драматургию и конкретные актёрские цели нужно сохранить в новой идее. У автора остаётся выбор; автоматически ничего не утверждать.',
 'Выбранный формат: '+selected.label+'. '+selected.instruction,
 '<author_examples>',examples,'</author_examples>',
 'Верни только JSON с ideas: ровно '+count+' разных идей. Каждая: title (4–140), angle (8–650), hook (4–180), skills: ровно три объекта {role:"actor"|"director"|"composer",action: конкретное экранное действие}, music (музыкальное развитие), actingTask (цель персонажа), sellingEnding (точный финальный титр или реплика). Все строки на русском. По одному краткому конкретному предложению в каждом поле. Не пиши рассказ вместо JSON.',
 ].join('\n');
}
export function readCommercialIdeaDetails(raw){
 const roles=['actor','director','composer'];
 const text=(v,max=700)=>typeof v==='string'&&v.trim().length>=4&&v.length<=max;
 if(!raw||!Array.isArray(raw.skills)||raw.skills.length!==3||new Set(raw.skills.map(s=>s?.role)).size!==3||raw.skills.some(s=>!roles.includes(s?.role)||!text(s?.action))||!text(raw.music)||!text(raw.actingTask)||!text(raw.sellingEnding))throw Error('Incomplete three-skill commercial idea');
 return {skills:raw.skills.map(s=>({role:s.role,action:s.action.trim()})),music:raw.music.trim(),actingTask:raw.actingTask.trim(),sellingEnding:raw.sellingEnding.trim()};
}
