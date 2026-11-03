import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PersonaColorComparisonStudio} from './PersonaColorComparisonStudio';
import {describe,expect,it} from 'vitest';
import {
 COLOR_VARIANT_PRESETS,addPersonaColorReviewNote,choosePersonaColorVariant,createPersonaColorReviewBrief,rejectPersonaColorVariants,inspectPersonaColorComparisonManifest,
 readPersonaColorComparisonRecord,readPersonaComparisonQcSummary,samePersonaColorComparisonEvidence,
 type ComparisonFileEvidence,
} from './personaColorComparison';
import {createPersonaProject,loadPersonaProjects,savePersonaProject,selectPersonaProject,type PersonaProjectStorage} from './personaProjectStore';

const stamp='2026-11-02T20:10:00.000Z';
const hash=(letter:string)=>letter.repeat(64);
function fixture(){
 const files:ComparisonFileEvidence[]=[
  {name:'original.mp4',size:123456,sha256:hash('a')},
  ...COLOR_VARIANT_PRESETS.map((preset,index)=>({name:preset.fileName,size:123456,sha256:hash('bcde'[index])})),
 ];
 const manifest={
  version:1,kind:'persona-color-variants-v1',status:'awaiting-author-comparison',publicationApproved:false,
  source:{path:'C:\\videos\\original.mp4',sha256:files[0].sha256},
  variants:COLOR_VARIANT_PRESETS.map((preset,index)=>({
   id:preset.id,label:preset.label,filter:preset.filter,
   path:'C:\\videos\\new\\'+preset.fileName,sha256:files[index+1].sha256,
  })),
 };
 return {manifest,files};
}
describe('Persona color comparison import',()=>{
 it('accepts exactly four independently SHA-verified MP4s and discards filesystem paths',()=>{
  const {manifest,files}=fixture();
  const record=inspectPersonaColorComparisonManifest(manifest,files,stamp);
  expect(record.sourceFileName).toBe('original.mp4');
  expect(record.sourceSha256).toBe(hash('a'));
  expect(record.variants.map(variant=>variant.sha256)).toEqual(files.slice(1).map(file=>file.sha256));
  expect(JSON.stringify(record)).not.toContain('C:');
  expect(readPersonaColorComparisonRecord(JSON.parse(JSON.stringify(record)))).toEqual(record);
 });
 it('accepts the refined filters while preserving verified legacy comparison metadata',()=>{
  const {manifest,files}=fixture();
  const refined=structuredClone(manifest);
  refined.variants[0].filter='colorbalance=rm=.006:gm=-.002:bm=.008:rh=.003:gh=-.001:bh=.004,eq=brightness=0:contrast=1.025:saturation=.99:gamma=1.015';
  refined.variants[1].filter='colorbalance=rm=.006:gm=.002:bm=-.004:rh=.002:gh=.001:bh=-.001,eq=brightness=.003:contrast=1.035:saturation=1.01:gamma=1.008';
  const refinedRecord=inspectPersonaColorComparisonManifest(refined,files,stamp);
  expect(refinedRecord.variants.map(variant=>variant.filter)).toEqual(refined.variants.map(variant=>variant.filter));
  const legacy=structuredClone(manifest);
  legacy.variants[0].filter='eq=brightness=0:contrast=1.02:saturation=1';
  legacy.variants[1].filter='eq=brightness=.01:contrast=1.04:saturation=1.03,colorbalance=rs=.02:gs=.01:bs=-.02';
  const legacyRecord=inspectPersonaColorComparisonManifest(legacy,files,stamp);
  expect(legacyRecord.variants.map(variant=>variant.filter)).toEqual(legacy.variants.map(variant=>variant.filter));
  expect(readPersonaColorComparisonRecord(legacyRecord)).toEqual(legacyRecord);
 });
 it('rejects forged source hash and a modified rendered MP4',()=>{
  const {manifest,files}=fixture();
  expect(()=>inspectPersonaColorComparisonManifest(manifest,[{...files[0],sha256:hash('f')},...files.slice(1)],stamp)).toThrow('original MP4 SHA');
  expect(()=>inspectPersonaColorComparisonManifest(manifest,[files[0],{...files[1],sha256:hash('f')},...files.slice(2)],stamp)).toThrow('variant missing');
 });
 it('rejects duplicate, missing, extra and oversized files',()=>{
  const {manifest,files}=fixture();
  expect(()=>inspectPersonaColorComparisonManifest(manifest,files.slice(0,3),stamp)).toThrow('all three rendered MP4s');
  expect(()=>inspectPersonaColorComparisonManifest(manifest,[...files,files[1]],stamp)).toThrow('duplicate');
  expect(()=>inspectPersonaColorComparisonManifest(manifest,[...files.slice(0,2),{...files[2],size:161*1024*1024},files[3]],stamp)).toThrow('oversized');
 });
 it('rejects fake publication approval, unexpected preset and different output hashes',()=>{
  const {manifest,files}=fixture();
  expect(()=>inspectPersonaColorComparisonManifest({...manifest,publicationApproved:true},files,stamp)).toThrow();
  expect(()=>inspectPersonaColorComparisonManifest({...manifest,variants:[{...manifest.variants[0],filter:'hue=s=0'},...manifest.variants.slice(1)]},files,stamp)).toThrow('unexpected preset');
  expect(()=>inspectPersonaColorComparisonManifest({...manifest,variants:[manifest.variants[1],manifest.variants[0],manifest.variants[2]]},files,stamp)).toThrow('unexpected preset');
 });
 it('persists only explicit author selection with timestamp and comment',()=>{
  const {manifest,files}=fixture();
  const initial=inspectPersonaColorComparisonManifest(manifest,files,stamp);
  expect(initial.selectedVariantId).toBeUndefined();
  const chosen=choosePersonaColorVariant(initial,'warm-cinematic','Best skin tone','2026-11-02T21:00:00.000Z');
  expect(chosen.selectedVariantId).toBe('warm-cinematic');
  expect(chosen.comment).toBe('Best skin tone');
  expect(chosen.decisionHistory?.map(item=>item.selectedVariantId)).toEqual(['warm-cinematic']);
  const revised=choosePersonaColorVariant(chosen,'natural-clean','Neutral skin','2026-11-02T21:05:00.000Z');
  expect(revised.decisionHistory?.map(item=>item.selectedVariantId)).toEqual(['warm-cinematic','natural-clean']);
  expect(chosen.selectedVariantId).toBe('warm-cinematic');
  expect(readPersonaColorComparisonRecord({...revised,decisionHistory:[{selectedVariantId:'fake',comment:'?',decidedAt:stamp}]})).toBeNull();
  const oldRecord={...chosen,decisionHistory:undefined};
  expect(readPersonaColorComparisonRecord(oldRecord)).toEqual(oldRecord);
  expect(choosePersonaColorVariant(oldRecord,'muted-filmic','Legacy upgrade','2026-11-02T21:10:00.000Z')
   .decisionHistory?.map(item=>item.selectedVariantId)).toEqual(['warm-cinematic','muted-filmic']);
  expect(initial.selectedVariantId).toBeUndefined();
  expect(readPersonaColorComparisonRecord({...chosen,selectedVariantId:'other'})).toBeNull();
  expect(readPersonaColorComparisonRecord({...chosen,comment:'x'.repeat(1001)})).toBeNull();
 });
 it('rejects inheriting a choice after any MP4 changes',()=>{
  const {manifest,files}=fixture();
  const original=inspectPersonaColorComparisonManifest(manifest,files,stamp);
  const changed=inspectPersonaColorComparisonManifest(manifest,files,stamp);
  expect(samePersonaColorComparisonEvidence(original,changed)).toBe(true);
  const swapped={...changed,sourceSha256:hash('f')};
  expect(samePersonaColorComparisonEvidence(original,swapped)).toBe(false);
  const altered={...changed,variants:changed.variants.map((v,i)=>i===0?{...v,sha256:hash('f')}:v)};
  expect(samePersonaColorComparisonEvidence(original,altered)).toBe(false);
 });
 it('restores a choice from the real Persona project storage schema after reload',()=>{
  const {manifest,files}=fixture();
  const selected=choosePersonaColorVariant(inspectPersonaColorComparisonManifest(manifest,files,stamp),
   'muted-filmic','Prefer muted style','2026-11-02T21:00:00.000Z');
  const data=new Map<string,string>();
  const storage:PersonaProjectStorage={
   getItem:key=>data.get(key)??null,
   setItem:(key,value)=>{data.set(key,value)},
   removeItem:key=>{data.delete(key)},
  };
  const project=createPersonaProject({id:'color-test',title:'Test',contentType:'reel',sourceIdea:'Test',now:stamp});
  savePersonaProject(storage,{...project,colorComparison:selected},project.id);
  const restored=loadPersonaProjects(storage,()=> 'unused').projects[0].colorComparison;
  expect(restored).toEqual(selected);
  expect(readPersonaColorComparisonRecord(restored)?.selectedVariantId).toBe('muted-filmic');
 });
});

describe('Comparison Studio restored review',()=>{
 it('shows the saved author decision without pretending the old MP4s are still available',()=>{
  const {manifest,files}=fixture();
  const approved=choosePersonaColorVariant(
   inspectPersonaColorComparisonManifest(manifest,files,stamp),
   'warm-cinematic','Natural skin tones','2026-11-02T21:00:00.000Z');
  const markup=renderToStaticMarkup(React.createElement(PersonaColorComparisonStudio,{
   projectId:'color-test',record:approved,onSave:()=>true,
  }));
  expect(markup).toContain('Автор выбрал Warm Cinematic');
  expect(markup).toContain(String.raw`C:\Video\original.mp4`);
  expect(markup).toContain('[ffmpeg-dir]');
  expect(markup).not.toContain(String.raw`C:\\Video\\original.mp4`);
  expect(markup).toContain('Natural skin tones');
  expect(markup).toContain('повторно выберите пять исходных файлов');
  expect(markup).not.toContain('aria-label="Цветовой вариант для просмотра"');
  expect(markup).not.toContain('aria-label="Обработанное видео"');
  expect(markup).toMatch(/<textarea[^>]*disabled=""[^>]*>/);
  expect(markup).toMatch(/disabled=""[^>]*>Сохранить выбор:/);
 });
});

describe('Comparison decisions stay within their source project',()=>{
 it('does not transfer a saved color choice when another project is selected and saved',()=>{
  const {manifest,files}=fixture();
  const selected=choosePersonaColorVariant(
   inspectPersonaColorComparisonManifest(manifest,files,stamp),
   'warm-cinematic','Keep the warm grade','2026-11-02T21:00:00.000Z');
  const data=new Map<string,string>();
  const storage:PersonaProjectStorage={
   getItem:key=>data.get(key)??null,
   setItem:(key,value)=>{data.set(key,value)},
   removeItem:key=>{data.delete(key)},
  };
  const first=createPersonaProject({id:'project-a',title:'A',contentType:'reel',sourceIdea:'A',now:stamp});
  const second=createPersonaProject({id:'project-b',title:'B',contentType:'reel',sourceIdea:'B',now:stamp});
  savePersonaProject(storage,first,first.id);
  savePersonaProject(storage,second,second.id);
  savePersonaProject(storage,{...first,revision:2,colorComparison:selected},first.id);
  selectPersonaProject(storage,second.id);
  savePersonaProject(storage,{...second,revision:2},second.id);
  const loaded=loadPersonaProjects(storage,()=> 'unused');
  expect(loaded.activeProjectId).toBe(second.id);
  expect(loaded.projects.find(project=>project.id===first.id)?.colorComparison).toEqual(selected);
  expect(loaded.projects.find(project=>project.id===second.id)?.colorComparison).toBeUndefined();
  expect(()=>savePersonaProject(storage,{...second,revision:2,colorComparison:selected},second.id))
   .toThrow('persona_project_stale_save');
 });
});

describe('Malformed optional comparison evidence must not erase other projects',()=>{
 it('preserves the raw damaged record and all projects without quarantining the collection',()=>{
  const {manifest,files}=fixture();
  const valid=inspectPersonaColorComparisonManifest(manifest,files,stamp);
  const malformed={...valid,variants:valid.variants.map((variant,index)=>
   index===0?{...variant,sha256:'invalid'}:variant)};
  expect(readPersonaColorComparisonRecord(malformed)).toBeNull();
  const data=new Map<string,string>();
  const storage:PersonaProjectStorage={
   getItem:key=>data.get(key)??null,
   setItem:(key,value)=>{data.set(key,value)},
   removeItem:key=>{data.delete(key)},
  };
  const damaged=createPersonaProject({id:'damaged-evidence',title:'Original project',contentType:'reel',sourceIdea:'Original',now:stamp});
  const safe=createPersonaProject({id:'other-project',title:'Other project',contentType:'reel',sourceIdea:'Other',now:stamp});
  savePersonaProject(storage,{...damaged,colorComparison:malformed as never},damaged.id);
  savePersonaProject(storage,safe,safe.id);
  let restored=loadPersonaProjects(storage,()=> 'unused');
  expect(restored.projects.map(project=>project.id)).toEqual([damaged.id,safe.id]);
  expect(restored.projects[0].colorComparison).toEqual(malformed);
  expect(data.get('lifeos:persona:projects:v1:corrupt')).toBeUndefined();
  savePersonaProject(storage,{...safe,revision:2,title:'Other updated'},safe.id);
  restored=loadPersonaProjects(storage,()=> 'unused');
  expect(restored.projects[0].colorComparison).toEqual(malformed);
  expect(restored.projects[1].title).toBe('Other updated');
  expect(data.get('lifeos:persona:projects:v1:corrupt')).toBeUndefined();
 });
});



describe('explicit author rejection and timecoded artistic observations',()=>{
 it('rejects all presets with required reason, preserves history, and allows later selection',()=>{
  const {manifest,files}=fixture();
  const imported=inspectPersonaColorComparisonManifest(manifest,files,stamp);
  expect(()=>rejectPersonaColorVariants(imported,'   ','2026-11-02T21:00:00.000Z')).toThrow();
  expect(()=>rejectPersonaColorVariants(imported,'No suitable look','not-date')).toThrow();
  const rejected=rejectPersonaColorVariants(imported,'Skin too yellow; glasses lose definition','2026-11-02T21:00:00.000Z');
  expect(rejected.rejectedAll).toBe(true);
  expect(rejected.selectedVariantId).toBeUndefined();
  expect(rejected.comment).toContain('glasses');
  expect(rejected.decisionHistory?.[0]?.rejectedAll).toBe(true);
  expect(readPersonaColorComparisonRecord(rejected)).toEqual(rejected);
  expect(readPersonaColorComparisonRecord({...rejected,selectedVariantId:'natural-clean'})).toBeNull();
  expect(readPersonaColorComparisonRecord({...rejected,rejectedAll:false})).toBeNull();
  expect(readPersonaColorComparisonRecord({...rejected,comment:'   '})).toBeNull();
  const chosen=choosePersonaColorVariant(rejected,'natural-clean','Looks better now','2026-11-02T22:00:00.000Z');
  expect(chosen.rejectedAll).toBeUndefined();
  expect(chosen.selectedVariantId).toBe('natural-clean');
  expect(chosen.decisionHistory?.map(item=>item.rejectedAll?'reject-all':item.selectedVariantId))
   .toEqual(['reject-all','natural-clean']);
  const rejectedAgain=rejectPersonaColorVariants(chosen,'Still not good enough','2026-11-02T23:00:00.000Z');
  expect(rejectedAgain.rejectedAll).toBe(true);
  expect(rejectedAgain.selectedVariantId).toBeUndefined();
  expect(chosen.selectedVariantId).toBe('natural-clean','original state remains untouched');
 });
 it('stores source-specific timecoded positive and negative observations and refuses malformed notes',()=>{
  const {manifest,files}=fixture();
  const imported=inspectPersonaColorComparisonManifest(manifest,files,stamp);
  const withNote=addPersonaColorReviewNote(imported,'natural-clean',34.925,'skin','issue',
   'Face has yellow-green cast',stamp);
  expect(withNote.reviewNotes?.[0].atSec).toBe(34.925);
  expect(withNote.selectedVariantId).toBeUndefined();
  expect(readPersonaColorComparisonRecord(withNote)).toEqual(withNote);
  const withSecond=addPersonaColorReviewNote(withNote,'warm-cinematic',69.8,'glasses','good',
   'Frames retain detail','2026-11-02T21:00:00.000Z');
  expect(withSecond.reviewNotes?.length).toBe(2);
  expect(()=>addPersonaColorReviewNote(withSecond,'natural-clean',Infinity,'skin','issue','Bad',stamp)).toThrow();
  expect(()=>addPersonaColorReviewNote(withSecond,'natural-clean',1,'skin','issue',' ',stamp)).toThrow();
  expect(readPersonaColorComparisonRecord({...withSecond,reviewNotes:[{...withSecond.reviewNotes?.[0],variantId:'other'}]})).toBeNull();
  const other={...withSecond,sourceSha256:hash('f')};
  expect(samePersonaColorComparisonEvidence(withSecond,other)).toBe(false);
  expect(imported.reviewNotes).toBeUndefined();
 });
 it('saves rejection and observations to a project, but not to another package',()=>{
  const {manifest,files}=fixture();
  const imported=inspectPersonaColorComparisonManifest(manifest,files,stamp);
  const annotated=addPersonaColorReviewNote(imported,'natural-clean',0.45,'lighting','issue','Too warm',stamp);
  const rejected=rejectPersonaColorVariants(annotated,'All variants rejected','2026-11-02T21:00:00.000Z');
  const data=new Map<string,string>();
  const storage:PersonaProjectStorage={
   getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value)},
   removeItem:key=>{data.delete(key)},
  };
  const first=createPersonaProject({id:'review-a',title:'A',contentType:'reel',sourceIdea:'A',now:stamp});
  savePersonaProject(storage,{...first,colorComparison:rejected},first.id);
  const restored=loadPersonaProjects(storage,()=> 'unused').projects[0].colorComparison;
  expect(readPersonaColorComparisonRecord(restored)?.rejectedAll).toBe(true);
  expect(readPersonaColorComparisonRecord(restored)?.reviewNotes?.[0].note).toBe('Too warm');
  const newPackage=structuredClone(manifest);
  newPackage.source.sha256=hash('f');
  const reverified=inspectPersonaColorComparisonManifest(newPackage,[{...files[0],sha256:hash('f')},...files.slice(1)],stamp);
  expect(samePersonaColorComparisonEvidence(rejected,reverified)).toBe(false);
  expect(reverified.rejectedAll).toBeUndefined();
  expect(reverified.reviewNotes).toBeUndefined();
 });
 it('renders rejected state and notes without requiring MP4 bytes after reload',()=>{
  const {manifest,files}=fixture();
  const initial=inspectPersonaColorComparisonManifest(manifest,files,stamp);
  const noted=addPersonaColorReviewNote(initial,'natural-clean',34.925,'skin','issue','Too yellow',stamp);
  const rejected=rejectPersonaColorVariants(noted,'No suitable grade','2026-11-02T21:00:00.000Z');
  const markup=renderToStaticMarkup(React.createElement(PersonaColorComparisonStudio,{
   projectId:'rejected',record:rejected,onSave:()=>true,
  }));
  expect(markup).toContain('Автор отклонил все три обработки');
  expect(markup).toContain('Замечания по кадрам (1)');
  expect(markup).toContain('Too yellow');
  expect(markup).toContain('No suitable grade');
  expect(markup).toContain('Отклонены все варианты');
  expect(markup).toMatch(/disabled=""[^>]*>Отклонить все три обработки/);
 });
});


describe('portable offline artistic review brief',()=>{
 it('exports only SHA-bound decision and notes, not MP4s, paths or publication permission',()=>{
  const {manifest,files}=fixture();
  const imported=inspectPersonaColorComparisonManifest(manifest,files,stamp);
  const noted=addPersonaColorReviewNote(imported,'natural-clean',34.925,'skin','issue',
   'Please fix yellow-green skin cast',stamp);
  const rejected=rejectPersonaColorVariants(noted,'Not cinematic enough','2026-11-02T21:00:00.000Z');
  const brief=createPersonaColorReviewBrief(rejected,'2026-11-03T12:00:00.000Z');
  expect(brief.kind).toBe('persona-color-review-brief-v1');
  expect(brief.artisticStatus).toBe('rejected-all');
  expect(brief.publicationApproved).toBe(false);
  expect(brief.decision.rejectedAll).toBe(true);
  expect(brief.decision.selectedVariantId).toBeNull();
  expect(brief.observations[0].atSec).toBe(34.925);
  expect(brief.observations[0].category).toBe('skin');
  expect(brief.variants.map(v=>v.sha256)).toEqual(rejected.variants.map(v=>v.sha256));
  expect(brief.source.sha256).toBe(rejected.sourceSha256);
  expect(brief.constraints).toEqual({
   noGenerativeFaceEdits:true,doNotOverwriteV2:true,authorApprovalRequired:true,
  });
  const json=JSON.stringify(brief);
  expect(json).not.toContain('C:');
  expect(json).not.toContain('MOV');
  expect(json).not.toContain('objectUrl');
  expect(()=>createPersonaColorReviewBrief(rejected,'invalid')).toThrow();
  const old=choosePersonaColorVariant(imported,'warm-cinematic','looks good','2026-11-02T21:00:00.000Z');
  const selected=createPersonaColorReviewBrief(old,stamp);
  expect(selected.artisticStatus).toBe('preferred-variant');
  expect(selected.publicationApproved).toBe(false);
  expect(selected.decision.selectedVariantId).toBe('warm-cinematic');
  const pending=createPersonaColorReviewBrief(imported,stamp);
  expect(pending.artisticStatus).toBe('awaiting-author-review');
 });
});

describe('Persona QC report admission',()=>{
 it('accepts only an unapproved QC report tied to all four imported MP4 hashes',()=>{
  const {manifest,files}=fixture();
  const record=inspectPersonaColorComparisonManifest(manifest,files,stamp);
  const qc={
   version:1,kind:'persona-comparison-quality-v1',sourceSha256:record.sourceSha256,
   publicationApproved:false,artisticStatus:'awaiting-author-review',technicalStatus:'pass',
   original:{sha256:record.sourceSha256},
   variants:COLOR_VARIANT_PRESETS.map((preset,index)=>({
    id:preset.id,fileName:preset.fileName,sha256:record.variants[index].sha256,
    technicalStatus:'pass',technicalMismatches:[],
    additionalSampledJumps:[{atSec:4.25,delta:53,kind:'luma_jumps'}],
   })),
  };
  const loaded=readPersonaComparisonQcSummary(qc,record);
  expect(loaded?.technicalStatus).toBe('pass');
  expect(loaded?.variants[0].jumpTimesSec).toEqual([4.25]);

  const withTemporal={
   ...qc,variants:qc.variants.map(variant=>({
    ...variant,temporalFlicker:{
     status:'measured',sampleRate:12,alignedSamples:20,coverage:1,
     candidates:[{atSec:1.25,amplitude:16.5,events:5,kind:'potential_temporal_flicker'}],
    },
   })),
  };
  expect(readPersonaComparisonQcSummary(withTemporal,record)?.variants[0].temporalJumpTimesSec).toEqual([1.25]);
  expect(readPersonaComparisonQcSummary({...withTemporal,variants:[
   {...withTemporal.variants[0],temporalFlicker:{...withTemporal.variants[0].temporalFlicker,candidates:[{atSec:Infinity,amplitude:16,kind:'potential_temporal_flicker'}]}},
   ...withTemporal.variants.slice(1),
  ]},record)).toBeNull();

  expect(readPersonaComparisonQcSummary({...qc,publicationApproved:true},record)).toBeNull();
  expect(readPersonaComparisonQcSummary({...qc,sourceSha256:hash('f')},record)).toBeNull();
  expect(readPersonaComparisonQcSummary({...qc,variants:[{...qc.variants[0],sha256:hash('f')},...qc.variants.slice(1)]},record)).toBeNull();
  expect(readPersonaComparisonQcSummary({...qc,variants:[qc.variants[1],qc.variants[0],qc.variants[2]]},record)).toBeNull();
  expect(readPersonaComparisonQcSummary({...qc,variants:[{...qc.variants[0],additionalSampledJumps:[{atSec:Infinity,kind:'luma_jumps'}]},...qc.variants.slice(1)]},record)).toBeNull();
 });
});
