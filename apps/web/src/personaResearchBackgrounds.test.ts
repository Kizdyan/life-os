import {it,expect} from 'vitest';
import {importResearchCarousel,RESEARCH_CAROUSEL_EXAMPLE} from './personaResearchCarousel';
import {approveEditorialStep,setEditorialSourceReviewed,setEditorialPublicCopyReviewed,setEditorialInterpretationReviewed,setEditorialChecklistItem,reviseEditorialPost,editorialSourcesPass,editorialContentHash} from './personaEditorialModel';
import {libraryBackground} from './personaEditorialBackgrounds';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import PersonaEditorialStudio from './PersonaEditorialStudio';
it('keeps the manual source review pane reachable after cinematic tools are integrated',()=>{
 const post=approveEditorialStep(importResearchCarousel('research-pane-integration',JSON.stringify(RESEARCH_CAROUSEL_EXAMPLE)),'topic');
 const html=renderToStaticMarkup(React.createElement(PersonaEditorialStudio,{posts:[post],targetId:post.id,
  onCreate:()=>{},onChange:()=>{},onSelect:()=>{},onClose:()=>{}}));
 expect(html).toContain('editorial-source-review');
 expect(html).toContain('research-public-copy-review');
 expect(html).toContain('Проверено по оригиналу');
 expect(html).toContain('Добавить как непроверенный');
 expect(html).toContain('UNVERIFIED');
 expect(html).toContain('maxLength="260"');
});
it('image changes retain reviewed source evidence but revoke visual approval; changed claims revoke sources',()=>{
 let p=approveEditorialStep(importResearchCarousel('research-image-integration',JSON.stringify(RESEARCH_CAROUSEL_EXAMPLE)),'topic');
 for(const s of p.research!.sourceItems)p=setEditorialSourceReviewed(p,s.slideId,s.url,true);
 for(const s of p.slides.filter(s=>!p.research!.sourceItems.some(x=>x.slideId===s.id)))p=setEditorialInterpretationReviewed(p,s.id,true);
 p=setEditorialPublicCopyReviewed(p,true);p=approveEditorialStep(p,'content');
 for(let i=0;i<6;i++)p=setEditorialChecklistItem(p,i,true);
 p=approveEditorialStep(p,'design');
 const q=reviseEditorialPost(p,{slides:p.slides.map((s,i)=>i?s:{...s,background:libraryBackground(0)})});
 expect(q.research?.sourceItems).toEqual(p.research?.sourceItems);
 expect(editorialSourcesPass(q)).toBe(true);expect(q.approvals.content).toBe(true);expect(q.approvals.designApproved).toBe(false);
 expect(editorialContentHash(q)).not.toBe(editorialContentHash(p));
 const changed=reviseEditorialPost(q,{slides:q.slides.map((s,i)=>i?s:{...s,text:'Другой фактический тезис'})});
 expect(editorialSourcesPass(changed)).toBe(false);expect(changed.approvals.content).toBe(false);
 expect(changed.research?.sourceItems.filter(s=>s.slideId===changed.slides[0].id).every(s=>!s.reviewed)).toBe(true);
});
