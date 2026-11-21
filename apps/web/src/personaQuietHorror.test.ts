import {describe,it,expect} from 'vitest';
import captions from '../../../config/carousel-quiet-horror-captions.json';
import {createQuietHorrorCarousel,approveEditorialStep,setEditorialChecklistItem,editorialChecklistReady,
 editorialContentHash,reviseEditorialPost,editorialContrastRatio,createBaselinePauseCarousel,
 createDirectorQuestionCarousel,createPhotoArchiveCarousel,createMixedNarrativeCarousel} from './personaEditorialModel';
describe('Quiet horror draft',()=>{
 it('preserves all exact text, two captions and unapproved state',()=>{
  const p=createQuietHorrorCarousel();
  expect(p.slides.map(({kicker,headline,body,highlight})=>({kicker,headline,body,...(highlight===undefined?{}:{highlight})}))).toEqual([{"kicker": "", "headline": "Самый сильный страх в кино звучит тише всего.", "body": ""}, {"kicker": "", "headline": "Мы привыкли, что страх нагнетается громкой музыкой.", "body": "Но сцены, которые остаются с нами, часто работают иначе."}, {"kicker": "", "headline": "Меньше пяти минут.", "body": "В «Челюстях» акулу показывают меньше пяти минут. В «Тихом месте» почти нет диалогов. Они держат нас в напряжении до конца."}, {"kicker": "", "headline": "Работает не то, что показано.", "body": "А то, что зритель достраивает сам. Пауза даёт ему время представить угрозу — и воображение оказывается страшнее любого кадра."}, {"kicker": "", "headline": "Это тот же принцип, что в актёрской паузе.", "body": "Когда персонаж молчит не потому, что нечего сказать, а потому, что решает, говорить ли правду, — молчание становится действием."}, {"kicker": "", "headline": "Иногда моя работа — вовремя замолчать.", "body": ""}, {"kicker": "", "headline": "Какая сцена напугала вас сильнее всего?", "body": "Та, где было тихо?"}, {"kicker": "", "headline": "Тишина в кадре — это не пустота.", "body": "Это решение. В следующем разборе — про одну ноту."}]);
  expect(captions).toEqual({"active": "1", "variants": {"1": "Страх в кино часто работает не через громкость, а через отсутствие. Пауза, тишина, недосказанность — это тоже партитура, и часто более точная, чем любой аккорд. В «Челюстях» Спилберг был вынужден почти не показывать акулу — сломался механизм. Случайность стала приёмом. Я думаю об этом и как композитор, и как актёр: иногда лучший выбор — не добавить, а убрать.\n\nКак композитор и актёр я часто слышу: «здесь нужна музыка, чтобы стало страшнее». Но иногда моя работа — вовремя замолчать и дать сцене звучать собственной тишиной.", "2": "Страх в кино часто работает не через громкость, а через отсутствие. Пауза и тишина — это тоже партитура. Я думаю об этом как композитор и актёр: иногда лучший выбор — не добавить, а убрать. В следующем разборе — про одну ноту, которая меняет финал.\n\nКак композитор и актёр я часто слышу: «здесь нужна музыка, чтобы стало страшнее». Но иногда моя работа — вовремя замолчать и дать сцене звучать собственной тишиной."}});
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
