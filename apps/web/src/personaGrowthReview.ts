export type GrowthGoal = 'reach'|'followers'|'saves';
export interface GrowthSlide {title:string;body:string;eyebrow:string}
export interface GrowthReview {score:number;checks:{id:string;label:string;passed:boolean;weight:number}[];recommendations:string[];goal:GrowthGoal}
const normalize=(value:string)=>value.trim().replace(/\s+/g,' ');
const hasQuestion=(text:string)=>/[?？]/.test(text);
const hasSpecificity=(text:string)=>/\d|[«»:]|например|почему|как |ошибк|секрет|способ|причин|шаг|вместо|до\/после/i.test(text);
export function reviewCarouselGrowth(slides:GrowthSlide[],goal:GrowthGoal):GrowthReview{
 const first=slides[0]||{title:'',body:'',eyebrow:''};
 const last=slides[slides.length-1]||first;
 const body=slides.map(s=>normalize(s.title+' '+s.body)).join(' ');
 const checks=[
  {id:'hook',label:'Первый экран: короткий читаемый заголовок',passed:normalize(first.title).length>=12&&normalize(first.title).length<=75,weight:20},
  {id:'curiosity',label:'Есть конкретика, вопрос или интрига',passed:hasQuestion(first.title)||hasSpecificity(first.title),weight:15},
  {id:'depth',label:'Материал раскрывается на 4–10 карточках',passed:slides.length>=4&&slides.length<=10,weight:15},
  {id:'readability',label:'Карточки без чрезмерно длинного текста',passed:slides.every(s=>normalize(s.title).length<=85&&normalize(s.body).length<=280),weight:15},
  {id:'value',label:'Есть конкретные примеры или практическая польза',passed:hasSpecificity(body),weight:15},
  {id:'cta',label:'Финальная карточка предлагает следующее действие',passed:/подпиш|сохран|отправ|подел|напиши|расскажи|продолжени|следующ|коммент|листай/i.test(last.title+' '+last.body),weight:20},
 ];
 const score=checks.reduce((sum,c)=>sum+(c.passed?c.weight:0),0);
 const recommendations=checks.filter(c=>!c.passed).map(c=>c.label);
 if(goal==='followers'&&!/подпиш|продолжени|следующ/i.test(last.title+' '+last.body))recommendations.push('Для подписок: объясни, зачем человеку следить за следующими публикациями');
 if(goal==='saves'&&!/сохран/i.test(last.title+' '+last.body))recommendations.push('Для сохранений: добавь полезную памятку или предложи сохранить');
 if(goal==='reach'&&!hasQuestion(first.title))recommendations.push('Для охвата: протестируй альтернативный первый экран с сильным вопросом');
 return {score,checks,recommendations,goal};
}
