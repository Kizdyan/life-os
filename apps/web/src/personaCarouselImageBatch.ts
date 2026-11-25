import {reviseEditorialPost,type EditorialPost} from './personaEditorialModel';
import {validCinematicBackground,type CinematicBackground} from './personaEditorialBackgrounds';

type BackgroundResult={status:'READY'|'BLOCKED';background?:CinematicBackground;message:string};
type Options={
 post:EditorialPost;
 authorizedCalls:number;
 readCurrent:()=>EditorialPost|undefined;
 persist:(post:EditorialPost)=>void;
 generate:(post:EditorialPost,index:number)=>Promise<BackgroundResult>;
 active?:()=>boolean;
 progress?:(done:number,total:number)=>void;
};
export function missingAutonomousBackgrounds(post:EditorialPost):number[]{
 if(post.research?.discovery?.mode!=='discover'||post.kind!=='carousel'||post.slides.length<5||post.slides.length>8)
  throw Error('Пакет доступен только для новой самостоятельно исследованной карусели');
 if(post.approvals.design)throw Error('Утверждённое оформление нельзя менять автоматически');
 if(post.slides.some(s=>s.visual!=='background'||!s.photoDirection.trim()))throw Error('Нужны визуальные задания для всех слайдов, без замены личных фотографий');
 // Never replace an existing image. A library asset or an invalid image does not count as new generation.
 if(post.slides.some(s=>s.background&&(!validCinematicBackground(s.background)||!s.background.generatedRef||s.background.provenance?.provider!=='openai')))
  throw Error('Имеющиеся фоны не будут заменены автоматически; проверьте их происхождение');
 return post.slides.flatMap((s,i)=>s.background?[]:[i]);
}
export async function generateMissingAutonomousBackgrounds({post,authorizedCalls,readCurrent,persist,generate,active=()=>true,progress}:Options){
 const indices=missingAutonomousBackgrounds(post);
 if(!Number.isInteger(authorizedCalls)||authorizedCalls!==indices.length||authorizedCalls<1||authorizedCalls>8)
  throw Error('Нужно явное согласие ровно на число недостающих изображений');
 let current=post,attempted=0,completed=0;
 const same=(x:EditorialPost|undefined)=>Boolean(x&&JSON.stringify(x)===JSON.stringify(current));
 for(const index of indices){
  if(!active()||!same(readCurrent()))throw Error('Редакция изменилась; генерация остановлена, ранее сохранённые фоны оставлены');
  attempted++;
  const result=await generate(current,index);
  if(!active()||!same(readCurrent()))throw Error('Редакция изменилась; результат не применён, дальнейших запросов нет');
  if(result.status!=='READY'||!result.background||!validCinematicBackground(result.background)||!result.background.generatedRef||
   result.background.provenance?.provider!=='openai')
   return {status:'BLOCKED' as const,attempted,completed,message:result.message};
  if(current.slides.some(s=>s.background?.sha256===result.background!.sha256))
   return {status:'BLOCKED' as const,attempted,completed,message:'Генератор вернул уже имеющееся изображение. Повтор не применён.'};
  const next=reviseEditorialPost(current,{slides:current.slides.map((s,i)=>i===index?{...s,background:result.background}:s)});
  persist(next);
  current=next;
  if(!same(readCurrent()))throw Error('Не удалось подтвердить сохранение; дальнейших запросов нет');
  completed++;progress?.(completed,indices.length);
 }
 return {status:'READY' as const,attempted,completed,message:'Все недостающие фоны сохранены. Требуется независимая и авторская проверка.'};
}
