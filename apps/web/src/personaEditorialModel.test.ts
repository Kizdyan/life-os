import {describe,it,expect} from 'vitest';
import {
 SEED_CAROUSELS,TOPIC_CHOICES,createSeedEditorialCarousel,createEditorialFromTopic,
 proposeTopics,editorialStage,editorialStageLabel,approveEditorialStep,reviseEditorialPost,
 loadEditorialStore,saveEditorialPost,loadStoryNotes,saveStoryNotes,EDITORIAL_KEY,STORY_KEY,
 createBaselinePauseCarousel,editorialChecklistReady,editorialChecklistState,
 setEditorialChecklistItem,editorialContentHash,editorialContrastRatio,editorialStageLabel
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
  expect(post.caption).toContain('Разница между ними — не в длительности');
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

});
