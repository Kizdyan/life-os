import {it,expect} from 'vitest';
import {createFridgeHumCarousel} from './personaProductionCarousel';
import {createFridgeHumV2,fridgeHumV2Evidence} from './personaEditorialV2';
import {editorialContentHash,editorialDesignHash,publicationDesignApproved,reviseEditorialPost,validatePost} from './personaEditorialModel';
import {editorialHierarchyLayout} from './personaEditorialTypography';
import style from '../../../config/carousel-fridge-hum-v2.json';
it('keeps V1 intact and creates a separate unapproved V2 with two honest cover hooks',()=>{
 const first=createFridgeHumCarousel('2026-11-21T00:00:00Z'),saved=JSON.stringify(first);
 const a=createFridgeHumV2('a'),b=createFridgeHumV2('b');
 expect(JSON.stringify(first)).toBe(saved);expect(a.id).not.toBe(first.id);expect(b.id).not.toBe(a.id);
 expect(a.slides).toHaveLength(7);
 const copy=(p:typeof a)=>p.slides.slice(1).map(s=>[s.text,s.background?.sha256]);
 expect(copy(b)).toEqual(copy(a));
 expect(a.slides[0].headline).not.toBe(b.slides[0].headline);
 for(const p of [a,b]){expect(()=>validatePost(p)).not.toThrow();expect(p.approvals).toMatchObject({topic:false,content:false,design:false});}
 expect(a.research?.interpretationSlides).toContain('slide-7');
 expect(a.slides[5].body).toContain('Ливсей');expect(a.slides[6].body).toContain('Мой актёрский вывод');
});
it('puts both hooks above the protected coin and gives every text role a real zone',()=>{
 const p=createFridgeHumV2('a');
 for(let i=0;i<7;i++){
  const layout=editorialHierarchyLayout(p,i);
  for(const role of ['headline','body'] as const)if(p.slides[i][role])expect(layout[role]).toBeDefined();
 }
 const cover=editorialHierarchyLayout(p,0);
 expect(cover.headline.y+cover.headline.height).toBeLessThan(850);
 expect(cover.body!.y+cover.body!.height).toBeLessThan(850);
});
it('fingerprints layout changes and never carries author approval into a new composition',()=>{
 const p=createFridgeHumV2('a'),v1={...p,compositionPreset:undefined};
 expect(editorialContentHash(p)).not.toBe(editorialContentHash(v1));
 const q=reviseEditorialPost({...p,approvals:{...p.approvals,design:true,designApproved:true}}, {compositionPreset:undefined});
 expect(q.approvals.design).toBe(false);expect(q.approvals.designApproved).toBe(false);
 expect(editorialDesignHash(q)).not.toBe(editorialDesignHash(p));
 expect(fridgeHumV2Evidence(p).status).toBe('MATCHES_CHECKED_COPY');
 expect(fridgeHumV2Evidence(reviseEditorialPost(p,{caption:'Другой текст'})).status).toBe('NEEDS_RECHECK');
});
it('invalidates the actual design fingerprint when hidden composition settings change',()=>{
 const p=createFridgeHumV2(),before=editorialDesignHash(p),size=style.layouts[0].headline.size;
 const reviewed={...p,approvals:{...p.approvals,design:true,designApproved:true,contentHashAtDesignApproval:before}};
 expect(publicationDesignApproved(reviewed)).toBe(true);
 try{style.layouts[0].headline.size+=4;expect(editorialDesignHash(p)).not.toBe(before);expect(publicationDesignApproved(reviewed)).toBe(false)}finally{style.layouts[0].headline.size=size}
});
it('does not describe replacement Worker backgrounds as preserved V1 illustrations',()=>{
 const p=createFridgeHumV2();p.slides[0].background={...p.slides[0].background!,sha256:'a'.repeat(64),
  provenance:{provider:'openai',model:'gpt-image-2.5-sunburst',prompt:'A new photograph',createdAt:'2026-11-22T00:00:00Z'}};
 expect(fridgeHumV2Evidence(p).imageTreatment).toContain('Some backgrounds differ');
});
