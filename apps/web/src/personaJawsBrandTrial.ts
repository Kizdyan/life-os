import job from '../../../config/persona-jaws-old-money-editorial-v1.json';
import {importResearchCarousel} from './personaResearchCarousel';
import {validatePost,type EditorialPost,type EditorialSlide} from './personaEditorialModel';
export const JAWS_BRAND_TRIAL_ID=job.id;
export const JAWS_BRAND_RENDER_VERSION='old-money-local-illustration-v1';
const sourceTitles=['Spielberg — Vanity Fair','Williams / Spielberg — Vanity Fair','University of Sydney — musical analysis'];
// Evidence is unreviewed on import. The final slide is explicitly an interpretation.
export function createJawsBrandTrial(now=new Date().toISOString()):EditorialPost{
 const packet={title:job.slides[0].headline,angle:'Кино и музыка: как партитура управляет ожиданиями зрителя',
 caption:'В «Челюстях» Джон Уильямс превращает знакомый мотив в предупреждение. В сцене ложной тревоги отсутствие этого мотива становится не менее важным, чем его появление. Музыка работает как часть драматургии, а не просто как атмосфера. «Челюсти» (1975), режиссёр Стивен Спилберг, композитор Джон Уильямс.',
 slides:job.slides.map((s,i)=>({
  text:[s.headline,('context' in s?s.context+' · ':'')+s.body].join('\n\n'),
  visualDirection:'Old Money Editorial, кремовая бумага или шоколадный фон, сдержанная гравюрная иллюстрация без надписей. Мотив: '+s.art,
  ...(i===6?{interpretation:true}:{sources:(i===1?[0]:i===2?[1,2]:i===5?[0]:[0,2]).map(k=>({title:sourceTitles[k],url:job.sourceUrls[k]}))})
 }))};
 const draft=importResearchCarousel(JAWS_BRAND_TRIAL_ID,JSON.stringify(packet),now);
 const post={...draft,scheduledDate:job.targetDate};
 validatePost(post);return post;
}
export function isLocalBrandTrialSlide(post:EditorialPost,slide:EditorialSlide):boolean{
 return post.id===JAWS_BRAND_TRIAL_ID&&post.preset==='chocolate-graphite'&&slide.visual==='background'&&!slide.background;
}
export function brandTrialArt(slideId:string){
 const n=/^slide-([1-7])$/.exec(slideId);if(!n)throw Error('Неизвестный слайд бренд-теста');
 return job.slides[Number(n[1])-1];
}
