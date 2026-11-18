import {describe,it,expect} from 'vitest';
import {
 REFERENCE_INSIGHTS,REFERENCE_LAB_KEY,emptyReferenceLab,validateReferenceLab,
 saveReferenceLab,loadReferenceLab,reviseReferenceLab,researchPrompt,scenarioPrompt,
 makeFactoryBatch,makeTrialCampaign,trialObservations,captureChecklist,editsSupport
} from './personaReferenceWorkflows';
import {createResearchedEditorialPost,approveEditorialStep,editorialStage} from './personaEditorialModel';
const storage=()=>{
 const map=new Map<string,string>();
 return {getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v)},
  removeItem:(k:string)=>{map.delete(k)}};
};
describe('Persona: five media reference adaptations',()=>{
 it('contains five independently inspected source contracts, with limitations',()=>{
  expect(REFERENCE_INSIGHTS.map(x=>x.id)).toEqual([
   'audience-prompts','batch-production','trial-reels','edits-mcp','blackmagic-camera'
  ]);
  expect(REFERENCE_INSIGHTS.every(x=>x.file.endsWith('.mp4')&&x.observed&&x.adaptation&&x.limit)).toBe(true);
 });
 it('uses actual audience problems and source-backed research, never guarantees viral results',()=>{
  const first=researchPrompt('Актёрская пауза','industry');
  expect(first).toMatch(/10 конкретных/);
  expect(first).toMatch(/ссылка на первоисточник/);
  expect(first).toMatch(/Актёрская пауза/);
  const second=scenarioPrompt('Актёрская пауза','Реальная история с репетиции');
  expect(second).toMatch(/конфликт/i);expect(second).toMatch(/под каруселью/i);
  expect(second).toMatch(/Реальная история с репетиции/);
 });
 it('batch processing creates only idea queue, never invented completed MP4',()=>{
  const out=makeFactoryBatch('История без слов\nРоль и пауза\nИстория без слов','reel',1);
  expect(out).toHaveLength(2);expect(out[0].state).toBe('idea');
  expect(out[0].id).toBe('batch-1-1');
  expect(()=>makeFactoryBatch('','reel')).toThrow();
  expect(()=>makeFactoryBatch('a'.repeat(161),'carousel')).toThrow();
 });
 it('trial experiment has five different hooks, never auto-posts, compares only observed metrics',()=>{
  const campaign=makeTrialCampaign('Пробный Reel','2026-11-19T08:00:00Z','trial-1');
  expect(campaign.variants).toHaveLength(5);
  expect(campaign.variants.every(v=>v.state==='draft'&&v.views===undefined)).toBe(true);
  expect(campaign.variants.map(v=>v.plannedDate)).toEqual([
   '2026-11-19','2026-11-26','2026-12-03','2026-12-10','2026-12-17'
  ]);
  expect(trialObservations(campaign)).toEqual([]);
  campaign.variants[0]={...campaign.variants[0],views:100,shares:3};
  campaign.variants[1]={...campaign.variants[1],views:200,shares:2};
  expect(trialObservations(campaign).map(v=>[v.id,v.shareRate])).toEqual([['trial-1-v1',3],['trial-1-v2',1]]);
 });
 it('gates Edits by actual operating system and cautions on Blackmagic profile support',()=>{
  expect(editsSupport('windows').supported).toBe(false);
  expect(editsSupport('mac').supported).toBe(true);
  const p=emptyReferenceLab().capture;
  expect(p).toMatchObject({codec:'hevc',resolution:'4k',fps:30,whiteBalanceLocked:true});
  expect(captureChecklist({...p,codec:'prores'}).warnings.join(' ')).toMatch(/ProRes/);
  expect(captureChecklist({...p,fps:60}).warnings.join(' ')).toMatch(/60 fps/);
 });
 it('persists decisions across reload and detects corrupted or conflicting revisions',()=>{
  const mem=storage();const initial=loadReferenceLab(mem);
  const next=reviseReferenceLab(initial,{topic:'Новая проверяемая тема'});
  saveReferenceLab(mem,next);
  expect(loadReferenceLab(mem).topic).toBe('Новая проверяемая тема');
  expect(()=>saveReferenceLab(mem,next)).toThrow(/Конфликт версий/);
  const bad={...next,sources:[{id:'x',url:'http://insecure',finding:'bad',status:'unverified'}]} as typeof next;
  expect(()=>validateReferenceLab(bad)).toThrow();
  mem.setItem(REFERENCE_LAB_KEY,'{broken');
  expect(()=>loadReferenceLab(mem)).toThrow(/повреждены/);
 });
 it('research -> actual existing Editorial Desk, with three separate author approvals',()=>{
  const post=createResearchedEditorialPost('editorial-research-001','Неудавшаяся реплика','Проверить причину и конфликт');
  expect(post.kind).toBe('carousel');
  expect(post.origin).toBe('researched-topic');
  expect(post.slides).toHaveLength(5);
  expect(editorialStage(post)).toBe('topic');
  expect(post.approvals).toMatchObject({topic:false,content:false,design:false});
  const topic=approveEditorialStep(post,'topic');
  expect(()=>approveEditorialStep(topic,'content')).toThrow(/подпись|основной/i);
  const ai=createResearchedEditorialPost('editorial-research-002','Пауза героя','Актёрский опыт',
   {caption:'Полноценная подпись к карусели',slides:[{title:'Кто здесь прав?',body:'Конфликт'}, {title:'Противоречие',body:'Действие'},{title:'Поворот',body:'Смысл'}]});
  expect(ai.approvals.content).toBe(false);
  expect(ai.slides).toHaveLength(3);
 });
});
