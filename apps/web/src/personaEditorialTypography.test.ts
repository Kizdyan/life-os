import {it,expect} from 'vitest';
import {createQuietHorrorCarousel,approveEditorialStep,setEditorialChecklistItem,reviseEditorialPost,editorialContentHash} from './personaEditorialModel';
import {wrapEditorialText,HIERARCHY_LAYOUTS} from './personaEditorialTypography';
it('keeps Russian prepositions attached without changing copy',()=>{
 const text='Музыка в кадре и пауза на сцене';
 const lines=wrapEditorialText(text,120,s=>s.length*10);
 expect(lines.join(' ')).toBe(text);
 for(const line of lines)expect(line).not.toMatch(/(?:^|\s)(в|и|на)$/u);
});
it('all zones honor 100px margins, body width and the 32px/1.6 scale',()=>{
 for(const layout of HIERARCHY_LAYOUTS)for(const role of ['kicker','headline','highlight','body'] as const){
  const z=layout[role];if(!z)continue;
  expect(z.x).toBeGreaterThanOrEqual(100);expect(z.x+z.width).toBeLessThanOrEqual(980);
  expect(z.y).toBeGreaterThanOrEqual(100);expect(z.y+z.height).toBeLessThanOrEqual(1250);
  if(role==='body'){expect(z.size).toBe(32);expect(z.width).toBeLessThanOrEqual(1080*.7)}
 }
});
it('quiet horror has the requested hierarchy and exact hook',()=>{
 const p=createQuietHorrorCarousel();
 expect(p.slides[0]).toMatchObject({kicker:'КИНО И ЗВУК',headline:'Почему самая страшная сцена часто тише всех',body:''});
 expect(p.slides[2]).toMatchObject({kicker:'ФАКТ',headline:'Меньше пяти минут.'});
 expect(p.slides[5].kicker).toBe('МОЙ ОПЫТ');
 expect(p.slides[7]).toMatchObject({headline:'Следующий разбор — про одну ноту.',body:'Сохраните, если интересно.'});
});
it('editing a hierarchy field changes the fingerprint and clears approval',()=>{
 let p=approveEditorialStep(approveEditorialStep(createQuietHorrorCarousel(),'topic'),'content');
 for(let i=0;i<6;i++)p=setEditorialChecklistItem(p,i,true);
 p=approveEditorialStep(p,'design');
 const q=reviseEditorialPost(p,{slides:p.slides.map((s,i)=>i?s:{...s,headline:'Новый заголовок'})});
 expect(editorialContentHash(q)).not.toBe(editorialContentHash(p));
 expect(q.approvals.textApproved).toBe(false);expect(q.approvals.designApproved).toBe(false);
 expect(q.slides[0].text).toContain('Новый заголовок');
});
