import {it,expect} from 'vitest';
import {createFridgeHumCarousel,fridgeHumSourceEvidence} from './personaProductionCarousel';
import {editorialSourcesPass,approveEditorialStep,validatePost,reviseEditorialPost} from './personaEditorialModel';
import {validCinematicBackground} from './personaEditorialBackgrounds';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import PersonaEditorialStudio from './PersonaEditorialStudio';
it('does not offer fields that a headline-only production composition cannot render',()=>{
 const p=approveEditorialStep(createFridgeHumCarousel(),'topic');
 const html=renderToStaticMarkup(React.createElement(PersonaEditorialStudio,{posts:[p],targetId:p.id,
  onCreate:()=>{},onChange:()=>{},onSelect:()=>{},onClose:()=>{}}));
 expect(html).not.toContain('Кикер');expect(html).not.toContain('Курсивный акцент');
 expect(html).not.toContain('maxLength="350"');
 expect(html).toContain('Заголовок слайда');
});
it('opens seven sourced production slides without making any author decision',()=>{
 const p=createFridgeHumCarousel('2026-11-21T00:00:00Z');
 expect(p.slides).toHaveLength(7);expect(()=>validatePost(p)).not.toThrow();
 expect(p.slides[0].text).toBe('Зачем композитору\nгул холодильника?');
 expect(p.slides.every(s=>validCinematicBackground(s.background))).toBe(true);
 expect(new Set(p.slides.map(s=>s.background?.sha256)).size).toBe(7);
 expect(p.approvals).toMatchObject({topic:false,content:false,design:false,textApproved:false,designApproved:false});
 expect(editorialSourcesPass(p)).toBe(false);
 expect(p.research?.sourceItems.every(s=>s.url==='https://www.carterburwell.com/projects/ncfom/'&&!s.reviewed)).toBe(true);
 expect(p.research?.interpretationSlides).toEqual(['slide-6','slide-7']);
 expect(()=>approveEditorialStep(approveEditorialStep(p,'topic'),'content')).toThrow(/SOURCE_PASS/);
});
it('accepts honest built-in generation provenance rather than claiming a Worker API call',()=>{
 expect(validCinematicBackground({libraryId:'empty-stage',generatedRef:'carousel-fridge-hum/bg-test',sha256:'a'.repeat(64),
  provenance:{provider:'codex-imagegen',model:'not-exposed-by-tool',prompt:'A text-free coin image',createdAt:'2026-11-21T00:00:00Z'}})).toBe(true);
});
it('never presents the original source audit as validation of subsequently edited copy',()=>{
 const p=createFridgeHumCarousel();
 expect(fridgeHumSourceEvidence(p).status).toBe('MATCHES_CHECKED_COPY');
 const edited=reviseEditorialPost(p,{caption:p.caption+' Другой факт.'});
 expect(fridgeHumSourceEvidence(edited).status).toBe('NEEDS_RECHECK');
});
