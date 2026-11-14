import React from 'react';
import {readFileSync} from 'node:fs';
import {renderToString} from 'react-dom/server';
import {expect,it} from 'vitest';
import {PersonaAiMediaWorker} from './PersonaAiMediaWorker.tsx';
import {importPersonaProductionBrief} from '../../../packages/core/src/persona-production-pipeline';
it('offers explicit burned-in captions on new renders without claiming old video already contains them',()=>{
 const fixture=JSON.parse(readFileSync(new URL('../../../docs/persona-delivery/editorial-candidate-production-brief.json',import.meta.url),'utf8'));
 const html=renderToString(<PersonaAiMediaWorker projectId="test" pipeline={importPersonaProductionBrief({brief:fixture})} hasUnsavedDraft={false} record={null} onSave={()=>false}/>);
 expect(html).toContain('Вшить субтитры в MP4');
 expect(html).toMatch(/aria-label="Вшить субтитры в MP4"[^>]*checked=""/);
 expect(html).toContain('2–3 слова');
 expect(html).toMatch(/aria-label="Авто-режиссура \(ИИ\)"[^>]*checked=""/);
 expect(html).not.toContain('aria-label="Ручной визуальный пресет"');
 expect(html).toContain('Повторить анализ Qwen');
 expect(html).toMatch(/<button[^>]+disabled=""[^>]*>Запустить Автономный Монтаж<\/button>/);
});
