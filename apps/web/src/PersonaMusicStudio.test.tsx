import React from 'react';
import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';

vi.mock('./PersonaProducer',()=>({
 PersonaShotList:()=>null,PersonaHookTests:()=>null,PersonaSocialCopy:()=>null
}));
import PersonaMusicStudio from './PersonaMusicStudio';

describe('Persona subtitle preset selector',()=>{
 it('renders three existing and new choices; Cinematic remains the default',()=>{
  const html=renderToStaticMarkup(<PersonaMusicStudio/>);
  expect(html).toContain('Стиль титров');
  expect(html).toContain('value="cinematic"');
  expect(html).toContain('Cinematic (Cormorant)');
  expect(html).toContain('value="dynamic-interview"');
  expect(html).toContain('Dynamic Interview (Montserrat)');
  expect(html).toContain('value="signature-gold"');
  expect(html).toContain('Signature Gold · Quiet Luxury v1.0');
  expect(html).toMatch(/<option[^>]*value="cinematic"[^>]*selected/);
  expect((html.match(/<option[^>]*value="signature-gold"/g)||[]).length).toBe(1);
 });
});
