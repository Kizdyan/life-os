import React from 'react';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import LifeOSContentHub from './LifeOSContentHub';
import {PUBLICATION_ANALYTICS_KEY} from './personaPublicationAnalytics';
afterEach(()=>vi.unstubAllGlobals());
describe('content observation recovery',()=>{
 it('shows a damaged history immediately and preserves its bytes',()=>{
  const data=new Map([[PUBLICATION_ANALYTICS_KEY,'{broken']]);
  vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)});
  const html=renderToStaticMarkup(<LifeOSContentHub/>);
  expect(html).toContain('Не удалось прочитать статистику');
  expect(data.get(PUBLICATION_ANALYTICS_KEY)).toBe('{broken');
 });
});
