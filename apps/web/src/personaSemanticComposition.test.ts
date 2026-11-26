import {expect,it} from 'vitest';
import {createFridgeHumV3} from './personaEditorialV3';
import {semanticEditorialComposition,semanticEditorialCopy,suggestEvidenceHook,hierarchyCopy,paintEditorialHierarchy} from './personaEditorialTypography';
import {reviseEditorialPost,composeEditorialByMeaning,editorialDesignHash,validatePost} from './personaEditorialModel';
import {importResearchCarousel,RESEARCH_CAROUSEL_EXAMPLE} from './personaResearchCarousel';
it('tries the exact readable minimum when a 4px decrement would skip it',()=>{
 const c={save(){},restore(){},measureText(){return {width:10}},fillText(){}} as unknown as CanvasRenderingContext2D;
 const result=paintEditorialHierarchy(c,{kicker:'',headline:'Тезис',body:'Пояснение'},0,
  {headline:{x:100,y:100,width:800,height:102,size:102},body:{x:100,y:500,width:800,height:76,size:62}},'literata-golos',true);
 expect(result.map(x=>x.size)).toEqual([88,60]);
});
it('normal research intake can adopt semantic layout without losing paragraphs or needing another editor',()=>{
 const raw=importResearchCarousel('native-research',JSON.stringify(RESEARCH_CAROUSEL_EXAMPLE));
 const post=reviseEditorialPost(raw,{fontPreset:'literata-golos',compositionPreset:'semantic-editorial-v1',
  slides:raw.slides.map(s=>({...s,...semanticEditorialCopy(s)}))});
 expect(()=>validatePost(post)).not.toThrow();
 expect(post.slides.map(s=>s.text)).toEqual(raw.slides.map(s=>s.text));
 const text='Короткий заголовок.\n\nПервое пояснение.\n\nВторое пояснение.';
 expect(hierarchyCopy(semanticEditorialCopy({text}))).toBe(text);
 expect(()=>semanticEditorialCopy({text:'Не скрыть',headline:'Тезис',highlight:'Важный акцент'})).toThrow(/Исходный текст сохранён/);
});
it('a derived cover keeps the fact slide source link rather than inheriting an unrelated old cover citation',()=>{
 const p=createFridgeHumV3(),fact=p.slides[2].id;
 p.research!.sourceItems=p.research!.sourceItems.map(s=>s.slideId===fact?{...s,url:'https://example.org/verified-frequency'}:s);
 const q=composeEditorialByMeaning(p),cover=q.slides[0].id;
 expect(q.research!.sourceItems.filter(s=>s.slideId===cover)).toMatchObject([{url:'https://example.org/verified-frequency',reviewed:false}]);
 expect(q.approvals.content).toBe(false);expect(q.approvals.design).toBe(false);
 expect(p.slides[0].headline).not.toBe(q.slides[0].headline);
});
it('selects semantic roles and different geometry without changing copy or depending on a project id',()=>{
 const p=createFridgeHumV3(),before=JSON.stringify(p);
 const plan=p.slides.map((_,i)=>semanticEditorialComposition(p,i));
 expect(plan.map(x=>x.role)).toEqual(['hook','scene','number','contrast','process','turn','takeaway']);
 expect(new Set(plan.map(x=>JSON.stringify(x.layout))).size).toBe(7);
 expect(plan.every(x=>!x.layout.body||x.layout.body.size>=60)).toBe(true);
 expect(semanticEditorialComposition({...p,id:'another-project'},2)).toEqual(plan[2]);
 expect(JSON.stringify(p)).toBe(before);
});
it('classifies a numeric fact by meaning after reorder, not hardcoded slide positions',()=>{
 const p=createFridgeHumV3(),slides=[p.slides[0],p.slides[3],p.slides[1],p.slides[2],p.slides[4],p.slides[5],p.slides[6]];
 expect(semanticEditorialComposition({...p,slides},3).role).toBe('number');
 expect(semanticEditorialComposition({...p,slides},1).role).toBe('contrast');
});
it('makes a frequency question only from an explicit sourced claim and leaves approval to author',()=>{
 const p=createFridgeHumV3(),hook=suggestEvidenceHook(p);
 expect(hook?.headline).toBe('Зачем композитору\nчастота холодильника?');
 expect(hook?.sourceSlideId).toBe(p.slides[2].id);
 expect(hook?.requiresAuthorReview).toBe(true);
 expect(suggestEvidenceHook({...p,research:undefined})).toBeUndefined();
 expect(suggestEvidenceHook({...p,slides:p.slides.map(s=>({...s,body:'Нет утверждения о частоте.'}))})).toBeUndefined();
});
it('composition changes invalidate visual approval without silently changing saved V3 copy',()=>{
 const p=createFridgeHumV3(),old=JSON.stringify(p);
 const q=reviseEditorialPost(p,{compositionPreset:'semantic-editorial-v1',fontPreset:'literata-golos'});
 expect(()=>validatePost(q)).not.toThrow();expect(q.approvals.designApproved).toBe(false);
 expect(editorialDesignHash(q)).not.toBe(editorialDesignHash(p));expect(q.slides).toEqual(p.slides);
 expect(JSON.stringify(p)).toBe(old);
});
