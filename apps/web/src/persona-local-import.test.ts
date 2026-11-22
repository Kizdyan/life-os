import {describe,it,expect} from 'vitest';
import {readImportedPersonaJson} from './persona-local-import';
const example=()=>({
 kind:'persona-local-ai-result',version:1,source:'real-local-ollama-completion',status:'STRUCTURE_PASS',
 model:'qwen2.5-coder:7b',draft:{
 title:'За кулисами — неожиданный финал',
 hook:'Герой слышит аплодисменты в пустом зале',
 twist:'В финале оказывается, что это будильник',
 runtimeSec:36,
 shootingOrder:'Снимаем сперва общие, затем крупные планы.',
 productionNotes:'Установить телефон на полку и светить сбоку.',
 platforms:{instagram:'9:16 вертикальная версия',vk:'VK вертикальный клип',youtube:'YouTube Shorts версия'},
 scenes:[0,9,18,27].map((start,i)=>({
  startSec:start,endSec:start+9,
  action:'Реальное действие персонажа на сцене '+i,
  dialogue:'Полная реплика для актёра в этой сцене',
  camera:'iPhone на полке, средний план в движении',
  lighting:'Оконный свет слева по лицу героя',
  sound:'Звук театрального звонка и пауза',
  edit:'Резкая склейка в момент поворота',
 })),
}});
describe('client-side local AI script import',()=>{
 it('maps all scenes with full filming details without network',()=>{
  const v=readImportedPersonaJson(JSON.stringify(example()));
  expect(v.model).toBe('qwen2.5-coder:7b');
  expect(v.draft.slides).toHaveLength(4);
  expect(v.draft.slides[0].body).toContain('Камера:');
  expect(v.draft.assetInstruction).toContain('ФИНАЛ:');
  expect(v.draft.platformNotes.youtube).toContain('Shorts');
 });
 it('rejects synthetic template wrongly labeled as model output',()=>{
  const x=example();x.source='template';
  expect(()=>readImportedPersonaJson(JSON.stringify(x))).toThrow('экспортом');
 });
 it('rejects gaps, missing camera, insufficient runtime',()=>{
  const x=example();x.draft.scenes[1].startSec=8;
  expect(()=>readImportedPersonaJson(JSON.stringify(x))).toThrow('разрыв');
  x.draft.scenes[1].startSec=9;x.draft.scenes[2].camera='';
  expect(()=>readImportedPersonaJson(JSON.stringify(x))).toThrow('camera');
  x.draft.scenes[2].camera='iPhone крупный план сбоку';x.draft.runtimeSec=22;
  expect(()=>readImportedPersonaJson(JSON.stringify(x))).toThrow('30 до 45');
 });
 it('rejects oversized and arbitrary files',()=>{
  expect(()=>readImportedPersonaJson(' '.repeat(262145))).toThrow('256 КБ');
  expect(()=>readImportedPersonaJson('{bad')).toThrow('JSON');
 });
});
