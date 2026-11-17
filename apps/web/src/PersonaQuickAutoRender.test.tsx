import {describe,it,expect} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import PersonaQuickAutoRender,{checkQuickRenderFiles} from './PersonaQuickAutoRender';
const file=(name:string,size=5_000):File=>({name,size} as File);
describe('one-click dashboard intake',()=>{
 it('renders one dropzone, one prompt and single prominent submit action',()=>{
  const html=renderToStaticMarkup(<PersonaQuickAutoRender/>);
  expect(html).toContain('Быстрый автомонтаж');
  expect(html).toContain('Сделать всё');
  expect(html).toContain('Перетащи сюда видео');
  expect(html).toContain('с шагом');
  expect(html).toContain('2,5');
  expect(html).toContain('При доступном OpenRouter');
  expect(html).toContain('При включённых текстовых акцентах запускается локальный Whisper');
  expect(html).toContain('генерируется отдельным платным текстовым запросом');
  expect(html).toContain('платных запросов');
  expect(html).toContain('data-testid="persona-quick-auto-render"');
  expect(html).toContain('id="persona-quick-fast-draft"');
  expect(html).toContain('type="checkbox" checked=""');
  expect(html).toContain('Быстрый черновик');
  expect(html).toContain('Автовыбор стиля ИИ');
  expect(html).toContain('id="persona-quick-auto-style"');
  expect(html).toContain('Director Agent изучит 3–5 кадров');
  expect(html).not.toContain('aria-label="Стиль и цвет"');
  expect(html).not.toContain('id="persona-quick-style"');
  expect(html).not.toContain('id="persona-quick-color"');
  expect((html.match(/<select/g)||[])).toHaveLength(0);
  expect(html).toContain('Добавлять текстовые акценты (ИИ)');
  expect(html).toContain('id="persona-quick-text-accents"');
  expect((html.match(/type="checkbox" checked=""/g)||[])).toHaveLength(3);
  expect(html).not.toContain('PRODUCTIONJOB /');
  expect(html).toContain('Как обрабатываются файлы и когда включается Vision');
  expect(html).toContain('disabled=""');
  expect(html).toContain('type="file"');
  expect((html.match(/<textarea/g)||[])).toHaveLength(1);
 });
 it('permits 1–4 original video files and one optional personal music file',()=>{
  expect(checkQuickRenderFiles([file('a.mp4')])).toEqual([{kind:'video',name:'a.mp4',size:5_000}]);
  expect(checkQuickRenderFiles([file('a.MOV'),file('my-music.wav')])).toEqual([
   {kind:'video',name:'a.MOV',size:5_000},{kind:'audio',name:'my-music.wav',size:5_000}]);
  expect(()=>checkQuickRenderFiles([file('song.mp3')])).toThrow(/видео/);
  expect(()=>checkQuickRenderFiles([file('a.mp4'),file('b.exe')])).toThrow();
  expect(()=>checkQuickRenderFiles([file('a.mp4'),file('b.mp3'),file('c.wav')])).toThrow();
  expect(()=>checkQuickRenderFiles([file('a.mp4',501*1024*1024)])).toThrow(/500 МБ/);
  expect(()=>checkQuickRenderFiles([])).toThrow();
 });
});
