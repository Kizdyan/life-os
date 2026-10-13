import { describe, expect, it } from 'vitest';
import { existingFirstPostDraft, generateWithAI } from './persona-ai';
import { runFinalQA } from './persona-factory';

function check(title:string) {
  const draft=existingFirstPostDraft({id:'first-p0',title});
  expect(draft).not.toBeNull();
  if(!draft)throw Error('Missing first-post draft');
  expect(draft.topicId).toBe('first-p0');
  const qa=runFinalQA({
    title:draft.title, publicText:draft.caption, format:'carousel',
    platforms:['instagram'], assets:[],
    slides:draft.slides.map(({title,body})=>({title,body})),
  });
  expect(qa.issues).toEqual([]);
  expect(qa.pass).toBe(true);
  expect(draft.slides).toHaveLength(6);
  expect(JSON.stringify(draft)).not.toMatch(/\bPERSONA\b|\bПЕРСОНА\b/iu);
  return draft;
}

describe('First real Instagram publication — authored iPhone carousel',()=>{
  it('creates the preexisting actor/process manifesto without fabricating private context',()=>{
    const draft=check('Почему я не хочу показывать только результат');
    expect(draft.caption).toContain('театр');
    expect(draft.caption).not.toContain('отношени');
    expect(draft.caption).not.toContain('девуш');
  });
  it('can publish a distinct theatre-format carousel without requiring video recording',()=>{
    check('Что происходит за минуту до выхода на сцену');
  });
  it('reuses the established musical motif carousel',()=>{
    check('Как четыре ноты становятся сценой');
  });
  it('returns no invented draft for unrecognized topics',()=>{
    expect(existingFirstPostDraft({id:'x',title:'Случайная неизвестная тема'})).toBeNull();
  });
  it('marks the template as deterministic quality check, not a fictitious AI generation',async()=>{
    const result=await generateWithAI({
      id:'manifesto',title:'Почему я не хочу показывать только результат',format:'carousel',
    });
    expect(result.qa.pass).toBe(true);
    expect(result.qa.kind).toBe('deterministic');
    expect(result.summary).toContain('не генерация ИИ');
  });
});
