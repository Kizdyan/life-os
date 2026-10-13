import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PrimeBuildCard from './PrimeBuildCard';
import { beginPrimeBuild, primeDate } from './primeBuild';

class S {
  private state = new Map<string,string>();
  getItem(k:string){return this.state.get(k) ?? null;}
  setItem(k:string,v:string){this.state.set(k,v);}
}
describe('Prime Build Today card — React render smoke',()=>{
  it('renders one prominent start action on an uninitialized iPhone Today',()=>{
    const s=new S();vi.stubGlobal('localStorage',s);
    try {
      const html=renderToStaticMarkup(createElement(PrimeBuildCard,{onChanged:()=>{}}));
      expect(html).toContain('Начать 30 дней');
      expect(html).toContain('Интерес — сразу');
      expect(html).not.toContain('PRIVATE_ANSWER');
    } finally {vi.unstubAllGlobals();}
  });
  it('renders weekly one-tap categories and the canonical nightly check-in',()=>{
    const s=new S();beginPrimeBuild(s,primeDate());vi.stubGlobal('localStorage',s);
    try{
      const html=renderToStaticMarkup(createElement(PrimeBuildCard,{onChanged:()=>{}}));
      expect(html).toContain('Тело / осанка');
      expect(html).toContain('Стиль / уход');
      expect(html).toContain('Сильный контекст');
      expect(html).toContain('Социальная жизнь');
      expect(html).toContain('Prime фото / видео');
      expect(html).toContain('Вечерние 2 минуты');
      expect(html).toContain('Что сегодня сделало меня сильнее?');
    }finally{vi.unstubAllGlobals();}
  });
});
