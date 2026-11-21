import {describe,it,expect} from 'vitest';
import baselineCaptions from '../../../config/carousel-baseline-pause-captions.json';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {
 SEED_CAROUSELS,TOPIC_CHOICES,createSeedEditorialCarousel,createEditorialFromTopic,
 proposeTopics,editorialStage,editorialStageLabel,approveEditorialStep,reviseEditorialPost,
 loadEditorialStore,saveEditorialPost,loadStoryNotes,saveStoryNotes,EDITORIAL_KEY,STORY_KEY,
 createBaselinePauseCarousel,editorialChecklistReady,editorialChecklistState,
 setEditorialChecklistItem,editorialContentHash,editorialContrastRatio,
 CAROUSEL_002_ID,createDirectorQuestionCarousel,
 CAROUSEL_003_ID,CAROUSEL_004_ID,createPhotoArchiveCarousel,createMixedNarrativeCarousel,
 editorialArchiveProvenancePass,applyChatCarouselApproval,editorialDesignHash,editorialTextHash,
 publicationDesignApproved,UNAPPROVED_DESIGN_MESSAGE,carouselEditorialWarnings
} from './personaEditorialModel';
function storage(){
 const values=new Map<string,string>();
 return {getItem:(k:string)=>values.get(k)??null,
  setItem:(k:string,v:string)=>{values.set(k,v)},removeItem:(k:string)=>{values.delete(k)}};
}
describe('Persona Editorial Content Planner',()=>{
 it('preserves exact 10 existing PHOTO seed topics and 40 distinct short slide captions',()=>{
  expect(SEED_CAROUSELS).toHaveLength(10);
  expect(SEED_CAROUSELS.flatMap(s=>s.slides)).toHaveLength(40);
  expect(SEED_CAROUSELS[0].id).toBe('PHOTO-001');
  expect(SEED_CAROUSELS[0].slides[0]).toBe('Он ещё верит');
  expect(SEED_CAROUSELS[9].slides[3]).toBe('В центре — одна история');
  for(const seed of SEED_CAROUSELS){
   const post=createSeedEditorialCarousel(seed.id,'2026-11-18T10:00:00Z');
   expect(post.kind).toBe('carousel');
   expect(post.slides.map(s=>s.text)).toEqual(seed.slides);
   expect(post.caption.length).toBeGreaterThan(40);
   expect(post.approvals).toMatchObject({topic:false,content:false,design:false,checklist:[false,false,false,false,false,false,false]});
   expect(editorialStage(post)).toBe('topic');
  }
 });
 it('offers real editorial suggestions without claiming they are AI trend research',()=>{
  expect(proposeTopics('photo')).toHaveLength(10);
  expect(proposeTopics('carousel')).toHaveLength(4);
  const idea=TOPIC_CHOICES[0];
  const posts=proposeTopics('photo',[idea.title]);
  expect(posts.find(x=>x.title===idea.title)).toBeUndefined();
  expect(posts.length).toBe(9);
 });
 it('enforces topic -> written slides/caption -> design gates and revokes downstream approvals on edits',()=>{
  const start=createSeedEditorialCarousel('PHOTO-001');
  expect(()=>approveEditorialStep(start,'content')).toThrow();
  const topic=approveEditorialStep(start,'topic');
  expect(editorialStageLabel(topic)).toBe('Текст на утверждении');
  expect(()=>approveEditorialStep(topic,'design')).toThrow();
  const copy=approveEditorialStep(topic,'content');
  expect(editorialStage(copy)).toBe('design');
  expect(()=>approveEditorialStep(copy,'design')).toThrow(/чек-лист|контраст/i);
  const checked=[0,1,2,3,4,5].reduce((p,i)=>setEditorialChecklistItem(p,i,true),copy);
  expect(editorialChecklistReady(checked)).toBe(true);
  const ready=approveEditorialStep(checked,'design');
  expect(editorialStage(ready)).toBe('production');
  expect(ready.approvals).toMatchObject({topic:true,content:true,design:true,checklist:[true,true,true,true,true,true,true]});
  const designEdit=reviseEditorialPost(ready,{preset:'chocolate'});
  expect(designEdit.approvals).toMatchObject({topic:true,content:true,design:false});
  const photoVisual=reviseEditorialPost(ready,{slides:ready.slides.map((slide,i)=>
   i===1?{...slide,visual:'archive-photo' as const}:slide)});
  expect(photoVisual.approvals).toMatchObject({topic:true,content:true,design:false});
  const editedSlide=reviseEditorialPost(ready,{slides:ready.slides.map((slide,i)=>
   i===1?{...slide,text:'Обновлённая мысль'}:slide)});
  expect(editedSlide.approvals).toMatchObject({topic:true,content:false,design:false});
  const captionEdit=reviseEditorialPost(ready,{caption:'Новый текст поста'});
  expect(captionEdit.approvals).toMatchObject({topic:true,content:false,design:false});
  const topicEdit=reviseEditorialPost(ready,{topic:'Другое наблюдение'});
  expect(topicEdit.approvals).toMatchObject({topic:false,content:false,design:false});
  expect(()=>approveEditorialStep(reviseEditorialPost(topic,{caption:''}),'content')).toThrow(/подпись|основной/i);
 });
 it('photo posts can have no title burned on an archive photo, but background needs text',()=>{
  const choice=TOPIC_CHOICES.find(x=>x.kind==='photo')!;
  const created=createEditorialFromTopic('photo-week-01',choice);
  expect(created.kind).toBe('photo');
  expect(created.slides).toHaveLength(1);
  expect(created.slides[0].visual).toBe('archive-photo');
  const approved=approveEditorialStep(created,'topic');
  const captionOnly=reviseEditorialPost(approved,{slides:[{...approved.slides[0],text:''}]});
  const result=approveEditorialStep(captionOnly,'content');
  expect(result.approvals.content).toBe(true);
  const background=reviseEditorialPost(approved,{slides:[{...approved.slides[0],text:'',visual:'background'}]});
  expect(()=>approveEditorialStep(background,'content')).toThrow();
 });
 it('stores user decisions without duplicating or overwriting authored revisions',()=>{
  const memory=storage();
  const orig=createSeedEditorialCarousel('PHOTO-001');
  const next=saveEditorialPost(memory,orig);
  expect(next.posts).toHaveLength(1);
  expect(loadEditorialStore(memory).posts).toHaveLength(1);
  expect(()=>saveEditorialPost(memory,orig)).toThrow(/revision conflict/i);
  const updated=reviseEditorialPost(orig,{caption:'Проверенный авторский текст'});
  saveEditorialPost(memory,updated);
  const again=loadEditorialStore(memory);
  expect(again.posts).toHaveLength(1);
  expect(again.posts[0].revision).toBe(2);
  expect(again.posts[0].caption).toBe('Проверенный авторский текст');
  expect(memory.getItem(EDITORIAL_KEY)).toContain('PHOTO-001');
 });
 it('refuses to destroy a corrupted or forward-version local editorial store',()=>{
  const broken=storage();
  broken.setItem(EDITORIAL_KEY,'{"version":88,"posts":[{"id":"author-work"}]}');
  expect(()=>saveEditorialPost(broken,createSeedEditorialCarousel('PHOTO-001'))).toThrow(/refusing to overwrite/);
  expect(broken.getItem(EDITORIAL_KEY)).toBe('{"version":88,"posts":[{"id":"author-work"}]}');
  const raw=storage();raw.setItem(EDITORIAL_KEY,'{truncated');
  expect(()=>saveEditorialPost(raw,createSeedEditorialCarousel('PHOTO-001'))).toThrow(/refusing to overwrite/);
  const scheduled=createSeedEditorialCarousel('PHOTO-001');
  expect(()=>reviseEditorialPost(scheduled,{scheduledDate:'2026-02-30'})).toThrow();
 });
 it('saves independently scheduled posts and opt-in Stories without false publication states',()=>{
  const memory=storage(),choice=TOPIC_CHOICES.find(x=>x.kind==='photo')!;
  const post=createEditorialFromTopic('editorial-photo-example',choice);
  saveEditorialPost(memory,reviseEditorialPost(post,{scheduledDate:'2026-11-25'}));
  expect(loadEditorialStore(memory).posts[0].scheduledDate).toBe('2026-11-25');
  saveStoryNotes(memory,[{id:'story-1',date:'2026-11-18',text:'Короткий бэкстейдж',
   state:'idea',createdAt:'2026-11-18T10:00:00Z'}]);
  expect(loadStoryNotes(memory)).toHaveLength(1);
  expect(loadStoryNotes(memory)[0].state).toBe('idea');
  expect(memory.getItem(STORY_KEY)).not.toBeNull();
 });
 it('initializes the text-only pause fixture without approval, photos or duplicate seed jobs',()=>{
  const post=createBaselinePauseCarousel('2026-11-19T01:00:00Z');
  expect(post.id).toBe('carousel-baseline-pause');
  expect(post.kind).toBe('carousel');
  expect(post.slides).toHaveLength(6);
  expect(post.slides.every(s=>s.visual==='background')).toBe(true);
  expect(post.slides.map(s=>s.text)).toEqual([
   'Пауза — это не отсутствие текста.','Персонаж уже знает ответ.',
   'Но сказать правду — значит что-то потерять.','Поэтому он задерживает слово.',
   'Зритель замечает этот выбор.','Так молчание становится действием.'
  ]);
  expect(post.preset).toBe('chocolate-graphite');
  expect(post.approvals).toMatchObject({topic:false,content:false,design:false,checklist:[false,false,false,false,false,false,false]});
  expect(post.approvals.content).toBe(false);
  expect(post.caption).toBe(baselineCaptions.variants.medium);
  expect(baselineCaptions.active).toBe('medium');
  expect(post.fontPreset).toBe('playfair-inter');
  expect(Object.keys(baselineCaptions.variants).sort()).toEqual(['long','medium','short']);
  for(const candidate of Object.values(baselineCaptions.variants))
   expect(candidate).not.toMatch(/а вы как думаете|подпишись/iu);
  expect(SEED_CAROUSELS).toHaveLength(10);
 });
 it('disables final approval until all six author choices and automatic contrast pass',()=>{
  const draft=createBaselinePauseCarousel();
  const content=approveEditorialStep(approveEditorialStep(draft,'topic'),'content');
  expect(()=>approveEditorialStep(content,'design')).toThrow();
  let checked=content;
  for(let i=0;i<5;i++)checked=setEditorialChecklistItem(checked,i,true);
  expect(editorialChecklistReady(checked)).toBe(false);
  expect(()=>approveEditorialStep(checked,'design')).toThrow();
  checked=setEditorialChecklistItem(checked,5,true);
  expect(editorialChecklistState(checked)).toEqual([true,true,true,true,true,true,true]);
  expect(()=>setEditorialChecklistItem(checked,6,true)).toThrow(/автоматически/);
  expect(editorialContrastRatio('#777777','#777777')).toBe(1);
  expect(editorialContrastRatio('#F2E9DC','#2B1D14')).toBeGreaterThan(4.5);
  expect(editorialContrastRatio('#C9A882','#1C1C1E')).toBeGreaterThan(3);
  expect(approveEditorialStep(checked,'design').approvals.checkedBy).toBe('Автор');
 });
 it('persists acceptance hash and revokes final approval on edits or stale loaded snapshots',()=>{
  const memory=storage();
  const start=createBaselinePauseCarousel('2026-11-19T01:00:00Z');
  const content=approveEditorialStep(approveEditorialStep(start,'topic'),'content');
  const checked=[0,1,2,3,4,5].reduce((p,i)=>setEditorialChecklistItem(p,i,true),content);
  const approved=approveEditorialStep(checked,'design','2026-11-19T01:05:00Z');
  expect(approved.approvals.checkedAt).toBe('2026-11-19T01:05:00Z');
  expect(approved.approvals.contentHashAtApproval).toBe(editorialContentHash(approved));
  saveEditorialPost(memory,approved);
  expect(loadEditorialStore(memory).posts[0].approvals.contentHashAtApproval).toBe(approved.approvals.contentHashAtApproval);
  const edited=reviseEditorialPost(approved,{slides:approved.slides.map((slide,i)=>
   i===0?{...slide,text:'Другая реплика'}:slide)});
  expect(edited.approvals.content).toBe(false);
  expect(edited.approvals.design).toBe(false);
  expect(editorialStageLabel(edited)).toBe('Требует повторного утверждения');
  const tampered=JSON.parse(memory.getItem(EDITORIAL_KEY)!);
  tampered.posts[0].slides[0].text='Подмена после утверждения';
  memory.setItem(EDITORIAL_KEY,JSON.stringify(tampered));
  expect(loadEditorialStore(memory).posts[0].approvals.design).toBe(false);
 });

 it('initializes Carousel 002 with six exact text-only slides, draft caption and an existing research doc',()=>{
  const post=createDirectorQuestionCarousel('2026-11-19T01:00:00Z');
  expect(post.id).toBe(CAROUSEL_002_ID);
  expect(post.id).toBe('carousel-why-director-leaves-question');
  expect(post.title).toBe('Зачем режиссёру оставлять зрителя без ответа');
  expect(post.kind).toBe('carousel');
  expect(post.preset).toBe('chocolate-graphite');
  expect(post.slides.map(s=>s.text)).toEqual([
   'Открытый финал — не отсутствие ответа, а другой его адрес.',
   'Зритель достраивает смысл, которого режиссёр не сказал.',
   'Но пустота работает, только если она изнутри логична.',
   'Хороший финал отвечает почти на всё — оставляет один вопрос.',
   'Вопрос держит зрителя после экрана. Это и есть работа.',
   'Режиссёр оставляет вопрос, когда ответ был бы ложью.'
  ]);
  expect(post.slides).toHaveLength(6);
  expect(post.slides.every(s=>s.visual==='background')).toBe(true);
  expect(post.caption).toBe([
   'Открытый финал — не то же самое, что отсутствие финала. Зритель прощает недосказанность, если чувствует, что режиссёр знал ответ и сознательно его не произнёс. И не прощает, когда чувствует, что ответа не было. Разница не в количестве информации, а в её наличии за кадром.',
   'Брук называет пустое пространство приглашением к воображению. Нолан уточняет: неоднозначность должна вырастать из неспособности персонажа знать, а не из небрежности автора. Макки разделяет открытый финал и размытость: открытый финал оставляет один вопрос, размытость — снимает правила мира. Мамет напоминает, что задача драматурга — держать зрителя в вопросе "что будет дальше", а не объяснять, что было.',
   'Практический вывод простой: оставляйте открытым вопрос, но не мотивацию, не ставки и не логику мира. Тогда молчание финала продолжает работать после экрана — это и есть его задача.'
  ].join('\n\n'));
  expect(post.approvals).toMatchObject({
   topic:false,content:false,design:false,checklist:[false,false,false,false,false,false,false]
  });
  expect(post.researchSourceDoc).toBe('docs/carousel-002-research-sources.md');
  expect(existsSync(resolve(process.cwd(),post.researchSourceDoc!))).toBe(true);
  expect(createBaselinePauseCarousel().id).toBe('carousel-baseline-pause');
 });
 it('preserves Carousel 002 approval hash and invalidates its approval after a slide edit',()=>{
  const start=createDirectorQuestionCarousel('2026-11-19T01:00:00Z');
  const content=approveEditorialStep(approveEditorialStep(start,'topic'),'content');
  expect(()=>approveEditorialStep(content,'design')).toThrow(/пункты 1–6/i);
  const sixChecked=[0,1,2,3,4,5].reduce((p,index)=>setEditorialChecklistItem(p,index,true),content);
  expect(editorialChecklistReady(sixChecked)).toBe(true);
  expect(editorialChecklistState(sixChecked)).toEqual([true,true,true,true,true,true,true]);
  const approved=approveEditorialStep(sixChecked,'design','2026-11-19T02:00:00Z');
  expect(approved.approvals.contentHashAtApproval).toBe(editorialContentHash(approved));
  expect(approved.approvals.checkedAt).toBe('2026-11-19T02:00:00Z');
  const mem=storage();saveEditorialPost(mem,approved);
  const restored=loadEditorialStore(mem).posts[0];
  expect(restored.researchSourceDoc).toBe('docs/carousel-002-research-sources.md');
  expect(restored.approvals.contentHashAtApproval).toBe(editorialContentHash(restored));
  const changed=reviseEditorialPost(restored,{slides:restored.slides.map((s,i)=>i===0?{...s,text:'Другой финал.'}:s)});
  expect(changed.approvals.content).toBe(false);
  expect(changed.approvals.design).toBe(false);
  expect(editorialStageLabel(changed)).toBe('Требует повторного утверждения');
  expect(changed.researchSourceDoc).toBe(restored.researchSourceDoc);
 });

});


describe('Carousel 003/004 archived-photo fixtures and existing editorial gate',()=>{
 const readyForDesign=(post:ReturnType<typeof createPhotoArchiveCarousel>)=>{
  const topic=approveEditorialStep(post,'topic');
  return approveEditorialStep(topic,'content');
 };
 const fullyApprove=(post:ReturnType<typeof createPhotoArchiveCarousel>)=>{
  let current=readyForDesign(post);
  for(let i=0;i<5;i++)current=setEditorialChecklistItem(current,i,true);
  expect(editorialChecklistState(current)[5]).toBe(true,'Archive provenance is automatic');
  expect(editorialChecklistState(current)[6]).toBe(true,'WCAG preset contrast is automatic');
  return approveEditorialStep(current,'design','2026-11-19T10:00:00Z');
 };
 it('initializes exact six-slide fixtures with named format, chocolate-graphite and draft captions',()=>{
  const photo=createPhotoArchiveCarousel(),mixed=createMixedNarrativeCarousel();
  expect(photo.id).toBe(CAROUSEL_003_ID);
  expect(mixed.id).toBe(CAROUSEL_004_ID);
  expect(photo.carouselFormat).toBe('photo-led');
  expect(mixed.carouselFormat).toBe('mixed');
  for(const post of [photo,mixed]){
   expect(post.slides).toHaveLength(6);
   expect(post.preset).toBe('chocolate-graphite');
   expect(post.caption.length).toBeGreaterThan(100);
   expect(post.approvals).toMatchObject({topic:false,content:false,design:false});
   expect(post.slides.every(s=>s.visual==='background'&&s.photoRef===undefined)).toBe(true);
   expect(editorialArchiveProvenancePass(post,[])).toBe(true,'Empty archive permits text-only fallback');
  }
  expect(photo.slides.map(s=>s.text)).toEqual([
   'Стул — не мебель. Это обстоятельство.',
   'Первый персонаж садится, потому что устал.',
   'Второй — потому что должен ждать.',
   'Третий не садится вовсе.',
   'Одна и та же точка в кадре, три разных решения.',
   'Тело актёра читается раньше слов.'
  ]);
  expect(mixed.slides.map(s=>s.text)).toEqual([
   'До первой реплики герой уже что-то решил.',
   'Зритель ещё не знает что.',
   'Тело уже выдаёт решение — плечи, взгляд, дыхание.',
   'Слово только подтверждает то, что уже произошло.',
   'Поэтому первая реплика — не начало, а следствие.',
   'Сцена начинается раньше, чем произносится первое слово.'
  ]);
 });
 it('uses unchanged step approvals, hash and auto-check item 6 for text-only fallback',()=>{
  const approved=fullyApprove(createMixedNarrativeCarousel());
  expect(approved.approvals.contentHashAtApproval).toBe(editorialContentHash(approved));
  expect(editorialChecklistState(approved)).toEqual([true,true,true,true,true,true,true]);
  expect(()=>setEditorialChecklistItem(readyForDesign(createPhotoArchiveCarousel()),5,true))
   .toThrow(/автоматически/);
  const adjusted=reviseEditorialPost(approved,{slides:approved.slides.map((s,i)=>
   i===0?{...s,text:'Новое действие'}:s)});
  expect(adjusted.approvals.content).toBe(false);
  expect(adjusted.approvals.design).toBe(false);
  const legacy=createBaselinePauseCarousel();
  expect(editorialContentHash(legacy)).toMatch(/^fnv1a32:[a-f0-9]{8}$/);
  expect(editorialChecklistState(readyForDesign(legacy))[5]).toBe(false,
   'Existing fixture still has manually checked item 6');
 });
 it('photo ID is in approval hash; mutation revokes design; missing original blocks provenance',()=>{
  const src='PHOTO-001/slide-2',other='photo-week-01/slide-1';
  const base=createPhotoArchiveCarousel();
  const withImage=reviseEditorialPost(base,{slides:base.slides.map((s,i)=>i===0?
   {...s,visual:'archive-photo' as const,photoRef:src}:s)});
  expect(editorialArchiveProvenancePass(withImage,[])).toBe(false);
  expect(editorialArchiveProvenancePass(withImage,[src])).toBe(true);
  expect(editorialChecklistState(withImage)[5]).toBe(true);
  const approved=fullyApprove(withImage);
  const originalHash=approved.approvals.contentHashAtApproval;
  const altered=reviseEditorialPost(approved,{slides:approved.slides.map((s,i)=>i===0?
   {...s,photoRef:other}:s)});
  expect(altered.approvals.design).toBe(false);
  expect(altered.approvals.contentHashAtApproval).toBe(originalHash,
   'Audit retains old fingerprint until author reapproves');
  expect(editorialContentHash(altered)).not.toBe(originalHash);
  expect(editorialArchiveProvenancePass(altered,[src])).toBe(false);
  const noRef=reviseEditorialPost(withImage,{slides:withImage.slides.map((s,i)=>i===0?
   {...s,photoRef:undefined}:s)});
  expect(editorialChecklistState(noRef)[5]).toBe(false);
  expect(editorialChecklistReady(readyForDesign(noRef))).toBe(false);
  const restored=reviseEditorialPost(noRef,{slides:noRef.slides.map((s,i)=>i===0?
   {...s,visual:'background' as const}:s)});
  expect(editorialArchiveProvenancePass(restored,[])).toBe(true);
 });
});

describe('2026-11-20 author approvals imported through existing gate',()=>{
 const factories=[createBaselinePauseCarousel,createDirectorQuestionCarousel,
  createPhotoArchiveCarousel,createMixedNarrativeCarousel];
 it('author-approved hashes match all canonical texts and the existing checklist',()=>{
  for(const factory of factories){
   const draft=factory('2026-11-20T00:00:00.000Z');
   expect(draft.approvals.design).toBe(false);
   const approved=applyChatCarouselApproval(draft);
   expect(approved.approvals).toMatchObject({
    topic:true,content:true,design:false,textApproved:true,designApproved:false,
    checkedBy:'Author (chat confirmation 2026-11-20)',
    contentHashAtApproval:editorialContentHash(draft),
    checklist:[true,true,true,true,true,true,true]
   });
   expect(editorialChecklistReady(approved)).toBe(true);
   expect(editorialStage(approved)).toBe('design');
  }
 });
 it('hydrates stored drafts, but changed slides immediately require reapproval',()=>{
  const draft=createPhotoArchiveCarousel('2026-11-20T00:00:00.000Z');
  const memory=storage();
  memory.setItem(EDITORIAL_KEY,JSON.stringify({version:1,posts:[draft]}));
  const approved=loadEditorialStore(memory).posts[0];
  expect(approved.approvals.design).toBe(false);
  const manuallyApproved=approveEditorialStep(approved,'design');
  expect(manuallyApproved.approvals.designApproved).toBe(true);
  const edited=reviseEditorialPost(manuallyApproved,{slides:approved.slides.map((s,i)=>
   i===0?{...s,text:'Текст изменён после утверждения'}:s)});
  expect(edited.approvals.design).toBe(false);
  memory.setItem(EDITORIAL_KEY,JSON.stringify({version:1,posts:[edited]}));
  const loaded=loadEditorialStore(memory).posts[0];
  expect(loaded.approvals.design).toBe(false);
  expect(editorialStageLabel(loaded)).toBe('Требует повторного утверждения');
  expect(loaded.approvals.contentHashAtApproval).not.toBe(editorialContentHash(loaded));
 });
 it('text-only approval prevents publication; visual button approves a signed design',()=>{
  const draft=createBaselinePauseCarousel();
  const reviewed=applyChatCarouselApproval(draft);
  expect(reviewed.approvals.textApproved).toBe(true);
  expect(reviewed.approvals.designApproved).toBe(false);
  expect(publicationDesignApproved(reviewed)).toBe(false);
  expect(UNAPPROVED_DESIGN_MESSAGE).toBe('Оформление не утверждено. Посмотрите PNG и подтвердите');
  const signed=approveEditorialStep(reviewed,'design','2026-11-20T12:00:00Z');
  expect(signed.approvals.designApproved).toBe(true);
  expect(publicationDesignApproved(signed)).toBe(true);
  expect(signed.approvals.contentHashAtDesignApproval).toBe(editorialDesignHash(signed));
  expect(signed.approvals.designApprovedAt).toBe('2026-11-20T12:00:00Z');
  const preset=reviseEditorialPost(signed,{preset:'filmic'});
  expect(preset.approvals.textApproved).toBe(true);
  expect(preset.approvals.content).toBe(true);
  expect(preset.approvals.designApproved).toBe(false);
  expect(editorialTextHash(preset)).toBe(editorialTextHash(signed));
  const font=reviseEditorialPost(signed,{fontPreset:'legacy'});
  expect(font.approvals.textApproved).toBe(true);
  expect(font.approvals.designApproved).toBe(false);
  expect(editorialDesignHash(font)).not.toBe(editorialDesignHash(signed));
  const caption=reviseEditorialPost(signed,{caption:'Другой текст'});
  expect(caption.approvals.textApproved).toBe(false);
  expect(caption.approvals.designApproved).toBe(false);
  const copy=reviseEditorialPost(signed,{slides:signed.slides.map((s,i)=>i===0?
   {...s,text:'Изменённый тезис'}:s)});
  expect(copy.approvals.textApproved).toBe(false);
  expect(copy.approvals.designApproved).toBe(false);
 });
 it('supports an eight-slide story and flags dense text without granting author approval',()=>{
  const draft=createSeedEditorialCarousel('PHOTO-001');
  const slides=Array.from({length:8},(_,i)=>({
   id:'new-slide-'+i,text:i===0?'Почему режиссёр намеренно оставил актёра в абсолютной тишине на самой важной сцене именно этого фильма':i===7?'Сохраните и подпишитесь':i===3?'Здесь '+Array(30).fill('очень').join(' '):'Новая мысль '+i,
   visual:'background' as const,photoDirection:''
  }));
  const eight=reviseEditorialPost(draft,{slides});
  expect(eight.slides).toHaveLength(8);
  const warnings=carouselEditorialWarnings(eight).join(' ');
  expect(warnings).toMatch(/Обложка/);
  expect(warnings).toMatch(/Слайд 4/);
  expect(warnings).toMatch(/шаблонным/);
  expect(eight.approvals.design).toBe(false);
 });

});
