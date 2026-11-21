import {describe,it,expect} from 'vitest';
import captions from '../../../config/carousel-quiet-horror-captions.json';
import {createQuietHorrorCarousel,approveEditorialStep,setEditorialChecklistItem,editorialChecklistReady,
 editorialContentHash,reviseEditorialPost,editorialContrastRatio,createBaselinePauseCarousel,
 createDirectorQuestionCarousel,createPhotoArchiveCarousel,createMixedNarrativeCarousel} from './personaEditorialModel';
describe('Quiet horror draft',()=>{
 it('preserves all exact text, two captions and unapproved state',()=>{
  const p=createQuietHorrorCarousel();
  expect(p.slides.map(({kicker,headline,body,highlight})=>({kicker,headline,body,...(highlight===undefined?{}:{highlight})}))).toEqual([{"kicker": "КИНО И ЗВУК", "headline": "Почему самая страшная сцена часто тише всех", "body": ""}, {"kicker": "", "headline": "Мы привыкли, что страх нагнетается громкой музыкой.", "body": "", "highlight": "Но посмотрите на сцены, которые остаются с нами."}, {"kicker": "ФАКТ", "headline": "Меньше пяти минут.", "body": "В «Челюстях» акулу показывают меньше пяти минут. В «Тихом месте» почти нет диалогов. Оба фильма держат напряжение до конца."}, {"kicker": "", "headline": "Работает не то, что показано.", "body": "Пауза даёт ему время представить угрозу — и воображение оказывается страшнее любого кадра.", "highlight": "А то, что зритель достраивает сам."}, {"kicker": "", "headline": "Это тот же принцип, что в актёрской паузе.", "body": "Когда персонаж молчит не потому, что нечего сказать, а потому, что решает, говорить ли правду, — молчание становится действием."}, {"kicker": "МОЙ ОПЫТ", "headline": "Иногда моя работа — вовремя замолчать.", "body": "Как композитор и актёр я часто слышу: «здесь нужна музыка, чтобы стало страшнее». Но иногда лучший выбор — дать сцене звучать собственной тишиной."}, {"kicker": "", "headline": "Какая сцена в кино напугала вас сильнее всего?", "body": "", "highlight": "Та, где было тихо?"}, {"kicker": "", "headline": "Следующий разбор — про одну ноту.", "body": "Сохраните, если интересно."}]);
  expect(captions).toEqual({"active":"1","variants":{"1":"Страх в кино часто работает не через громкость, а через отсутствие. Пауза, тишина, недосказанность — это тоже партитура, и часто более точная, чем любой аккорд. В «Челюстях» Спилберг был вынужден почти не показывать акулу — сломался механизм. Случайность стала приёмом. Я думаю об этом и как композитор, и как актёр: иногда лучший выбор — не добавить, а убрать.","2":"Страх в кино часто работает не через громкость, а через отсутствие. Пауза и тишина — это тоже партитура. Я думаю об этом как композитор и актёр: иногда лучший выбор — не добавить, а убрать. В следующем разборе — про одну ноту, которая меняет финал."}});
  expect(p.caption).toBe(captions.variants['1']);
  expect(p.approvals).toMatchObject({topic:false,textApproved:false,designApproved:false});
  for(const s of p.slides)expect(s.text).not.toMatch(/[A-Za-z]/);
  for(const bg of ['#2B1D14','#1C1C1E'])for(const fg of ['#F2E9DC','#C9A882'])
   expect(editorialContrastRatio(bg,fg)).toBeGreaterThanOrEqual(4.5);
 });
 it('uses the existing gate and invalidates approval when text changes',()=>{
  let p=approveEditorialStep(approveEditorialStep(createQuietHorrorCarousel(),'topic'),'content');
  expect(()=>approveEditorialStep(p,'design')).toThrow();
  for(let i=0;i<6;i++)p=setEditorialChecklistItem(p,i,true);
  expect(editorialChecklistReady(p)).toBe(true);
  p=approveEditorialStep(p,'design');
  expect(p.approvals.contentHashAtApproval).toBe(editorialContentHash(p));
  const next=reviseEditorialPost(p,{slides:p.slides.map((s,i)=>i? s:{...s,headline:s.headline+' Ещё.'})});
  expect(next.approvals.textApproved).toBe(false);expect(next.approvals.designApproved).toBe(false);
 });
 it('keeps four historical carousels separate',()=>{
  const old=[createBaselinePauseCarousel(),createDirectorQuestionCarousel(),createPhotoArchiveCarousel(),createMixedNarrativeCarousel()];
  expect(old.map(p=>p.slides.length)).toEqual([6,6,6,6]);
  expect(old.some(p=>p.id===createQuietHorrorCarousel().id)).toBe(false);
 });
});
