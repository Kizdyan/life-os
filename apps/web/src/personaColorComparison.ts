/** Local-only proof for Persona color comparison. MP4 bytes are never persisted here. */
export const COLOR_VARIANT_PRESETS=[
 {id:'natural-clean',label:'Natural Clean',fileName:'A-natural-clean.mp4',filter:'colorbalance=rm=.006:gm=-.002:bm=.008:rh=.003:gh=-.001:bh=.004,eq=brightness=0:contrast=1.025:saturation=.99:gamma=1.015'},
 {id:'warm-cinematic',label:'Warm Cinematic',fileName:'B-warm-cinematic.mp4',filter:'colorbalance=rm=.006:gm=.002:bm=-.004:rh=.002:gh=.001:bh=-.001,eq=brightness=.003:contrast=1.035:saturation=1.01:gamma=1.008'},
 {id:'muted-filmic',label:'Muted Filmic',fileName:'C-muted-filmic.mp4',filter:'eq=brightness=-.005:contrast=1.05:saturation=.90'},
] as const;
// V1 comparison evidence binds the exact FFmpeg formula. Keep the two
// superseded formulas readable so an existing author decision is never
// treated as damaged merely because later local renders became more neutral.
const LEGACY_COLOR_VARIANT_FILTERS=[
 'eq=brightness=0:contrast=1.02:saturation=1',
 'eq=brightness=.01:contrast=1.04:saturation=1.03,colorbalance=rs=.02:gs=.01:bs=-.02',
 'eq=brightness=-.005:contrast=1.05:saturation=.90',
] as const;
export type PersonaColorVariantId=typeof COLOR_VARIANT_PRESETS[number]['id'];
type Variant={id:PersonaColorVariantId;label:string;fileName:string;filter:string;sha256:string};
export type PersonaColorReviewCategory='skin'|'glasses'|'lighting'|'detail'|'motion'|'audio'|'other';
export type PersonaColorReviewAssessment='good'|'issue';
export type PersonaColorReviewNote={
 variantId:PersonaColorVariantId;atSec:number;category:PersonaColorReviewCategory;
 assessment:PersonaColorReviewAssessment;note:string;createdAt:string;
};
type PersonaColorDecisionHistoryEntry={
 selectedVariantId?:PersonaColorVariantId;rejectedAll?:true;comment:string;decidedAt:string;
};
const REVIEW_CATEGORIES=['skin','glasses','lighting','detail','motion','audio','other'] as const;
export type PersonaColorComparisonRecord={
 version:1;
 kind:'persona-color-comparison-review-v1';
 sourceFileName:string;
 sourceSha256:string;
 variants:Variant[];
 importedAt:string;
 selectedVariantId?:PersonaColorVariantId;
 rejectedAll?:true;
 comment?:string;
 decidedAt?:string;
 decisionHistory?:PersonaColorDecisionHistoryEntry[];
 reviewNotes?:PersonaColorReviewNote[];
};
export type ComparisonFileEvidence={name:string;sha256:string;size:number};
const SHA=/^[a-f0-9]{64}$/;
function object(value:unknown):value is Record<string,unknown>{
 return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function basename(path:string):string{return path.split(/[\\/]/).pop()??''}
function timestamp(value:unknown):value is string{
 return typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
}
const fail=(message:string):never=>{throw Error('Comparison Studio: '+message)};
function knownPresetFilter(index:number,value:unknown):value is string{
 return typeof value==='string'&&(value===COLOR_VARIANT_PRESETS[index]?.filter||value===LEGACY_COLOR_VARIANT_FILTERS[index]);
}
export function readPersonaColorComparisonRecord(value:unknown):PersonaColorComparisonRecord|null{
 if(!object(value)||value.version!==1||value.kind!=='persona-color-comparison-review-v1'||
  typeof value.sourceFileName!=='string'||value.sourceFileName.length<1||value.sourceFileName.length>220||
  basename(value.sourceFileName)!==value.sourceFileName||!value.sourceFileName.toLowerCase().endsWith('.mp4')||
  typeof value.sourceSha256!=='string'||!SHA.test(value.sourceSha256)||
  !timestamp(value.importedAt)||!Array.isArray(value.variants)||value.variants.length!==3)return null;
 const shaSet=new Set([value.sourceSha256]);
 for(const [i,preset] of COLOR_VARIANT_PRESETS.entries()){
  const variant=value.variants[i];
  if(!object(variant)||variant.id!==preset.id||variant.label!==preset.label||
   variant.fileName!==preset.fileName||!knownPresetFilter(i,variant.filter)||
   typeof variant.sha256!=='string'||!SHA.test(variant.sha256)||shaSet.has(variant.sha256))return null;
  shaSet.add(variant.sha256);
 }
 const hasSelection=value.selectedVariantId!==undefined;
 const rejected=value.rejectedAll===true;
 if(value.rejectedAll!==undefined&&!rejected)return null;
 if(hasSelection&&rejected)return null;
 if(hasSelection&&!COLOR_VARIANT_PRESETS.some(preset=>preset.id===value.selectedVariantId))return null;
 if((hasSelection||rejected)&&
  (typeof value.comment!=='string'||value.comment.length>1000||
   (rejected&&!value.comment.trim())||!timestamp(value.decidedAt)))return null;
 if(!hasSelection&&!rejected&&(value.comment!==undefined||value.decidedAt!==undefined))return null;
 if(value.decisionHistory!==undefined){
  if(!Array.isArray(value.decisionHistory)||value.decisionHistory.length>20)return null;
  for(const item of value.decisionHistory){
   if(!object(item))return null;
   const chosen=COLOR_VARIANT_PRESETS.some(p=>p.id===item.selectedVariantId),declined=item.rejectedAll===true;
   if(chosen===declined||(item.rejectedAll!==undefined&&!declined)||
    typeof item.comment!=='string'||item.comment.length>1000||
    (declined&&!item.comment.trim())||!timestamp(item.decidedAt))return null;
  }
 }
 if(value.reviewNotes!==undefined){
  if(!Array.isArray(value.reviewNotes)||value.reviewNotes.length>30)return null;
  for(const item of value.reviewNotes){
   if(!object(item)||!COLOR_VARIANT_PRESETS.some(p=>p.id===item.variantId)||
    typeof item.atSec!=='number'||!Number.isFinite(item.atSec)||
    item.atSec<0||item.atSec>21600||!REVIEW_CATEGORIES.some(c=>c===item.category)||
    (item.assessment!=='good'&&item.assessment!=='issue')||
    typeof item.note!=='string'||!item.note.trim()||item.note.length>300||
    !timestamp(item.createdAt))return null;
  }
 }
 return value as PersonaColorComparisonRecord;
}
export function inspectPersonaColorComparisonManifest(
 manifest:unknown,files:ComparisonFileEvidence[],importedAt:string,
):PersonaColorComparisonRecord{
 if(!timestamp(importedAt))fail('invalid import timestamp');
 if(!object(manifest)||manifest.version!==1||manifest.kind!=='persona-color-variants-v1'||
  manifest.status!=='awaiting-author-comparison'||manifest.publicationApproved!==false||
  !object(manifest.source)||!Array.isArray(manifest.variants)||manifest.variants.length!==3)
  fail('COMPARISON.json has unsupported version, state or structure');
 const selected=new Map<string,ComparisonFileEvidence>();
 for(const file of files){
  if(!file||typeof file.name!=='string'||selected.has(file.name)||!SHA.test(file.sha256)||
    !Number.isFinite(file.size)||file.size<1024||file.size>160*1024*1024)
    fail('duplicate, invalid or oversized MP4');
  selected.set(file.name,file);
 }
 if(typeof manifest.source.path!=='string'||typeof manifest.source.sha256!=='string'||
  !SHA.test(manifest.source.sha256))fail('invalid source evidence');
 const sourceName=basename(manifest.source.path);
 if(!sourceName||sourceName.length>220||!sourceName.toLowerCase().endsWith('.mp4')||
   COLOR_VARIANT_PRESETS.some(p=>p.fileName===sourceName))fail('invalid original file name');
 if(selected.size!==4||!selected.has(sourceName))fail('select the original MP4 and all three rendered MP4s');
 const source=selected.get(sourceName)!;
 if(source.sha256!==manifest.source.sha256)fail('original MP4 SHA-256 differs from manifest');
 const unique=new Set<string>([source.sha256]);
 const variants:Variant[]=[];
 for(const [index,preset] of COLOR_VARIANT_PRESETS.entries()){
  const entry=manifest.variants[index];
  if(!object(entry)||entry.id!==preset.id||entry.label!==preset.label||
    !knownPresetFilter(index,entry.filter)||typeof entry.path!=='string'||
    basename(entry.path)!==preset.fileName||typeof entry.sha256!=='string'||!SHA.test(entry.sha256))
    fail('unexpected preset or variant metadata');
  const file=selected.get(preset.fileName);
  if(!file||file.sha256!==entry.sha256||unique.has(file.sha256))fail('variant missing, changed or duplicated: '+preset.id);
  unique.add(file.sha256);
  variants.push({...preset,filter:entry.filter,sha256:file.sha256});
 }
 const result:PersonaColorComparisonRecord={
  version:1,kind:'persona-color-comparison-review-v1',sourceFileName:sourceName,
  sourceSha256:source.sha256,variants,importedAt,
 };
 if(!readPersonaColorComparisonRecord(result))fail('invalid comparison evidence');
 return result;
}
export function samePersonaColorComparisonEvidence(a:PersonaColorComparisonRecord,b:PersonaColorComparisonRecord):boolean{
 return a.sourceSha256===b.sourceSha256&&a.variants.every((v,i)=>
   v.id===b.variants[i]?.id&&v.sha256===b.variants[i]?.sha256);
}
/** Reject mixing ANY artistic evidence with a different source or preset hashes. */
export function hasAuthoredPersonaColorReview(record:PersonaColorComparisonRecord):boolean{
 return Boolean(record.selectedVariantId||record.rejectedAll||
  record.reviewNotes?.length||record.decisionHistory?.length);
}
export function choosePersonaColorVariant(
 current:PersonaColorComparisonRecord,id:PersonaColorVariantId,comment:string,decidedAt:string,
):PersonaColorComparisonRecord{
 if(!readPersonaColorComparisonRecord(current)||!COLOR_VARIANT_PRESETS.some(v=>v.id===id)||
  typeof comment!=='string'||comment.length>1000||!timestamp(decidedAt))fail('invalid author decision');
 const legacyPrevious=current.decisionHistory===undefined&&current.selectedVariantId&&current.decidedAt
  ?[{selectedVariantId:current.selectedVariantId,comment:current.comment??'',decidedAt:current.decidedAt}]:[];
 const decisionHistory=[...(current.decisionHistory??legacyPrevious),{selectedVariantId:id,comment,decidedAt}].slice(-20);
 const {rejectedAll:_previousRejection,...withoutRejection}=current;
 const next={...withoutRejection,selectedVariantId:id,comment,decidedAt,decisionHistory};
 if(!readPersonaColorComparisonRecord(next))fail('invalid saved author decision');
 return next;
}


/** Explicit rejection of ALL grades (not publication approval); a concrete reason is mandatory. */
export function rejectPersonaColorVariants(
 current:PersonaColorComparisonRecord,comment:string,decidedAt:string,
):PersonaColorComparisonRecord{
 if(!readPersonaColorComparisonRecord(current)||typeof comment!=='string'||!comment.trim()||
  comment.length>1000||!timestamp(decidedAt))fail('rejection requires a concrete author comment and timestamp');
 const legacyPrevious:PersonaColorDecisionHistoryEntry[]=current.decisionHistory===undefined&&current.selectedVariantId&&current.decidedAt
  ?[{selectedVariantId:current.selectedVariantId,comment:current.comment??'',decidedAt:current.decidedAt}]:[];
 const decisionHistory:PersonaColorDecisionHistoryEntry[]=[
  ...(current.decisionHistory??legacyPrevious),{rejectedAll:true,comment,decidedAt},
 ].slice(-20);
 const {selectedVariantId:_previousChoice,...withoutChoice}=current;
 const next:PersonaColorComparisonRecord={...withoutChoice,rejectedAll:true,comment,decidedAt,decisionHistory};
 if(!readPersonaColorComparisonRecord(next))fail('invalid saved rejection');
 return next;
}
/** Evidence-bound author notes; a note never implies grade acceptance. */
export function addPersonaColorReviewNote(
 current:PersonaColorComparisonRecord,variantId:PersonaColorVariantId,atSec:number,
 category:PersonaColorReviewCategory,assessment:PersonaColorReviewAssessment,note:string,createdAt:string,
):PersonaColorComparisonRecord{
 if(!readPersonaColorComparisonRecord(current)||!COLOR_VARIANT_PRESETS.some(v=>v.id===variantId)||
  !Number.isFinite(atSec)||atSec<0||atSec>21600||
  !REVIEW_CATEGORIES.some(c=>c===category)||(assessment!=='good'&&assessment!=='issue')||
  typeof note!=='string'||!note.trim()||note.length>300||!timestamp(createdAt))
  fail('invalid evidence-bound author observation');
 const reviewNotes=[...(current.reviewNotes??[]),{
  variantId,atSec:Math.round(atSec*1000)/1000,category,assessment,note:note.trim(),createdAt,
 }].slice(-30);
 const next:PersonaColorComparisonRecord={...current,reviewNotes};
 if(!readPersonaColorComparisonRecord(next))fail('invalid saved author observation');
 return next;
}


/** Portable, content-free instruction artifact for a future V3 iteration.
 *  No binary media, local directory, browser URLs, or publication authorization.
 */
export function createPersonaColorReviewBrief(
 current:PersonaColorComparisonRecord,exportedAt:string,
):{
 version:1;kind:'persona-color-review-brief-v1';exportedAt:string;
 publicationApproved:false;artisticStatus:'awaiting-author-review'|'preferred-variant'|'rejected-all';
 source:{fileName:string;sha256:string};variants:Array<{id:PersonaColorVariantId;label:string;sha256:string;filter:string}>;
 decision:{selectedVariantId:PersonaColorVariantId|null;rejectedAll:boolean;comment:string|null;decidedAt:string|null};
 observations:PersonaColorReviewNote[];constraints:{noGenerativeFaceEdits:true;doNotOverwriteV2:true;authorApprovalRequired:true};
}{
 if(!readPersonaColorComparisonRecord(current)||!timestamp(exportedAt))fail('invalid review brief evidence');
 return {
  version:1,kind:'persona-color-review-brief-v1',exportedAt,publicationApproved:false,
  artisticStatus:current.rejectedAll?'rejected-all':
   current.selectedVariantId?'preferred-variant':'awaiting-author-review',
  source:{fileName:current.sourceFileName,sha256:current.sourceSha256},
  variants:current.variants.map(({id,label,sha256,filter})=>({id,label,sha256,filter})),
  decision:{selectedVariantId:current.selectedVariantId??null,rejectedAll:current.rejectedAll===true,
   comment:current.comment??null,decidedAt:current.decidedAt??null},
  observations:(current.reviewNotes??[]).map(note=>({...note})),
  constraints:{noGenerativeFaceEdits:true,doNotOverwriteV2:true,authorApprovalRequired:true},
 };
}


/** Untrusted local QC is displayed only after it matches all four verified MP4 hashes. */
export type PersonaComparisonQcSummary={
 technicalStatus:'pass'|'fail';
 variants:Array<{id:PersonaColorVariantId;technicalStatus:'pass'|'fail';problems:string[];jumpTimesSec:number[];temporalStatus?:'measured'|'not_measured';temporalJumpTimesSec:number[]}>;
};
export function readPersonaComparisonQcSummary(value:unknown,record:PersonaColorComparisonRecord):PersonaComparisonQcSummary|null{
 if(!readPersonaColorComparisonRecord(record)||!object(value)||value.kind!=='persona-comparison-quality-v1'||
  value.version!==1||value.publicationApproved!==false||value.artisticStatus!=='awaiting-author-review'||
  value.sourceSha256!==record.sourceSha256||!object(value.original)||
  value.original.sha256!==record.sourceSha256||
  (value.technicalStatus!=='pass'&&value.technicalStatus!=='fail')||
  !Array.isArray(value.variants)||value.variants.length!==3)return null;
 const rows:PersonaComparisonQcSummary['variants']=[];
 for(const [index,preset] of COLOR_VARIANT_PRESETS.entries()){
  const item=value.variants[index];
  if(!object(item)||item.id!==preset.id||item.fileName!==preset.fileName||
   item.sha256!==record.variants[index]?.sha256||
   (item.technicalStatus!=='pass'&&item.technicalStatus!=='fail')||
   !Array.isArray(item.technicalMismatches)||
   item.technicalMismatches.length>30||item.technicalMismatches.some(x=>typeof x!=='string'||x.length>100)||
   !Array.isArray(item.additionalSampledJumps)||
   item.additionalSampledJumps.length>10000)return null;
  const times:number[]=[];
  for(const event of item.additionalSampledJumps){
   if(!object(event)||typeof event.atSec!=='number'||!Number.isFinite(event.atSec)||
    event.atSec<0||event.atSec>21600||
    (event.kind!=='luma_jumps'&&event.kind!=='chroma_jumps'))return null;
   if(times.length<5)times.push(event.atSec);
  }
  const temporalJumpTimesSec:number[]=[];
  let temporalStatus:'measured'|'not_measured'|undefined;
  if(item.temporalFlicker!==undefined){
   const temporal=item.temporalFlicker;
   if(!object(temporal)||(temporal.status!=='measured'&&temporal.status!=='not_measured')||
    temporal.sampleRate!==12||typeof temporal.alignedSamples!=='number'||
    !Number.isInteger(temporal.alignedSamples)||temporal.alignedSamples<0||
    typeof temporal.coverage!=='number'||!Number.isFinite(temporal.coverage)||
    temporal.coverage<0||temporal.coverage>1||
    !Array.isArray(temporal.candidates)||temporal.candidates.length>20)return null;
   temporalStatus=temporal.status;
   for(const candidate of temporal.candidates){
    if(!object(candidate)||candidate.kind!=='potential_temporal_flicker'||
     typeof candidate.atSec!=='number'||!Number.isFinite(candidate.atSec)||
     candidate.atSec<0||candidate.atSec>21600||
     typeof candidate.amplitude!=='number'||!Number.isFinite(candidate.amplitude)||
     candidate.amplitude<0||candidate.amplitude>255)return null;
    if(temporalJumpTimesSec.length<5)temporalJumpTimesSec.push(candidate.atSec);
   }
  }
  rows.push({id:preset.id,technicalStatus:item.technicalStatus,
   problems:item.technicalMismatches,jumpTimesSec:times,temporalStatus,temporalJumpTimesSec});
 }
 return {technicalStatus:value.technicalStatus,variants:rows};
}
