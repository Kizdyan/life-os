import {it,expect} from 'vitest';
import {createQuietHorrorCarousel,approveEditorialStep,setEditorialChecklistItem,reviseEditorialPost,editorialContentHash} from './personaEditorialModel';
import {wrapEditorialText,HIERARCHY_LAYOUTS,paintEditorialHierarchy} from './personaEditorialTypography';
it('refuses nonempty text without a layout zone instead of silently omitting it',()=>{
 const canvas={} as CanvasRenderingContext2D;
 expect(()=>paintEditorialHierarchy(canvas,{kicker:'',headline:'Заголовок',body:'Нельзя скрыть этот текст'},0)).toThrow(/нет зоны body/);
 expect(()=>paintEditorialHierarchy(canvas,{kicker:'',headline:'Заголовок',body:'Нельзя скрыть этот текст'},5)).toThrow(/нет зоны body/);
});
it('keeps Russian prepositions attached without changing copy',()=>{
 const text='Музыка в кадре и пауза на сцене';
 const lines=wrapEditorialText(text,120,s=>s.length*10);
 expect(lines.join(' ')).toBe(text);
 for(const line of lines)expect(line).not.toMatch(/(?:^|\s)(в|и|на)$/u);
});
it('all zones honor 100px margins, body width and the larger 44–48px scale',()=>{
 for(const layout of HIERARCHY_LAYOUTS)for(const role of ['kicker','headline','highlight','body'] as const){
  const z=layout[role];if(!z)continue;
  expect(z.x).toBeGreaterThanOrEqual(100);expect(z.x+z.width).toBeLessThanOrEqual(980);
  expect(z.y).toBeGreaterThanOrEqual(100);expect(z.y+z.height).toBeLessThanOrEqual(1250);
  if(role==='body'){expect(z.size).toBeGreaterThanOrEqual(44);expect(z.size).toBeLessThanOrEqual(48);expect(z.width).toBeLessThanOrEqual(1080*.7)}
 }
});
it('quiet horror has the requested hierarchy and exact hook',()=>{
 const p=createQuietHorrorCarousel();
 expect(p.slides[0]).toMatchObject({kicker:'',headline:'Самый сильный страх в кино звучит тише всего.',body:''});
 expect(p.slides[2]).toMatchObject({kicker:'',headline:'Меньше пяти минут.'});
 expect(p.slides[5]).toMatchObject({kicker:'',body:'',headline:'Иногда моя работа — вовремя замолчать.'});
 expect(p.slides[7]).toMatchObject({headline:'Тишина в кадре — это не пустота.',body:'Это решение. В следующем разборе — про одну ноту.'});
 expect(p.slides.every(s=>!s.kicker&&!s.highlight)).toBe(true);
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
