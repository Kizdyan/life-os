import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PersonaColorComparisonStudio} from './PersonaColorComparisonStudio';
import {describe,expect,it} from 'vitest';
import {
 COLOR_VARIANT_PRESETS,choosePersonaColorVariant,inspectPersonaColorComparisonManifest,
 readPersonaColorComparisonRecord,samePersonaColorComparisonEvidence,
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
