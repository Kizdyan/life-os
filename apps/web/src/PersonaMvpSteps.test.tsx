import {describe,it,expect} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import PersonaMvpSteps,{REEL_MVP_STEPS,reelMvpIndex} from './PersonaMvpSteps';

describe('Persona Reel five-stage navigation',()=>{
 it('shows exactly five visible stages, not seven legacy states',()=>{
  expect(REEL_MVP_STEPS.map(([,label])=>label)).toEqual(['Идея','Сценарий','Съёмка','Монтаж','Выпуск']);
  const html=renderToStaticMarkup(<PersonaMvpSteps step="idea" onSelect={()=>{}}/>);
  expect((html.match(/<button/g)||[])).toHaveLength(5);
  expect(html).toContain('Пять этапов создания Reels');
 });
 it('groups the legacy shoot and final-review substeps without discarding them',()=>{
  expect(reelMvpIndex('guide')).toBe(2);
  expect(reelMvpIndex('assets')).toBe(2);
  expect(reelMvpIndex('review')).toBe(4);
  expect(reelMvpIndex('export')).toBe(4);
  expect(renderToStaticMarkup(<PersonaMvpSteps step="export" onSelect={()=>{}}/>)).toContain('aria-current="step"');
 });
});
