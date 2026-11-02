import type {PersonaProductionBrief} from '../../../packages/core/src/persona-production-brief';
import {readPersonaFinishedRenderRecord,parsePersonaVideoQuality,isPersonaVideoQualitySummary,type PersonaFinishedRenderRecord,type PersonaVideoQualitySummary} from './personaFinishedRenderImport';

export type PersonaLocalRenderRecord={
 version:1;kind:'persona-local-render-review-v1';projectId:string;briefIdeaId:string;briefSnapshot:string;
 briefFingerprintSha256:string;mp4Sha256:string;mp4Bytes:number;mp4Name:'draft-reel.mp4';durationSec:number;
 width:1080;height:1920;fps:30;timingStatus:string;status:'awaiting-author-review';importedAt:string;
 qaProvenance:'locally-imported-report-not-independently-attested';publicationApproved:false;
 finished?:PersonaFinishedRenderRecord;
 quality?:PersonaVideoQualitySummary;
};
/** Editorial approval is versioned by its own decision timestamp, not just by
 * the JSON contents of the brief. Reapproving an identical brief must NOT revive
 * an old MP4 and its former final-cut review without a new explicit import. */
export function isPersonaDraftCurrentForApproval(input:{
 record:PersonaLocalRenderRecord|null;
 projectId:string;briefSnapshot:string|null;handoffAllowed:boolean;
 approvalDecidedAt:string|null;
}):boolean{
 const {record,projectId,briefSnapshot,handoffAllowed,approvalDecidedAt}=input;
 if(!record||!handoffAllowed||!briefSnapshot||!approvalDecidedAt||
  record.projectId!==projectId||record.briefSnapshot!==briefSnapshot)return false;
 const imported=Date.parse(record.importedAt),approved=Date.parse(approvalDecidedAt);
 return Number.isFinite(imported)&&Number.isFinite(approved)&&imported>=approved;
}
type MediaFileInfo={name:string;size:number;sha256:string;durationSec?:number;width?:number;height?:number};
/** Template is intentionally unapproved; the author must edit and review SRT. */
export function buildPersonaFinishOptionsTemplate(record:PersonaLocalRenderRecord){
 if(!readPersonaLocalRenderRecord(record))throw Error('Invalid saved Persona render evidence');
 return {version:1 as const,kind:'persona-finish-choices-v1' as const,
  publicationApproved:false as const,sourceSha256:record.mp4Sha256,
  captionsReviewed:false as const,
  captionsPath:'REPLACE_WITH_ABSOLUTE_PATH_TO_captions.reviewed.srt',
  color:{brightness:0,contrast:1,saturation:1}};
}

const hashPattern=/^[a-f0-9]{64}$/i;
const fail=(text:string):never=>{throw new Error(text)};
const obj=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
/** Avoid silently treating an unknown fourth JSON file as an optional
 * video-quality report. The file picker is an exact evidence bundle. */
export function validatePersonaMediaImportFileNames(
 names:readonly string[],kind:'draft'|'finished',
):void{
 const required=kind==='draft'
  ?['RESULT.json','qa.json','draft-reel.mp4']
  :['FINISH-RESULT.json','finish-qa.json','finished-candidate.mp4'];
 const allowed=new Set([...required,'video-quality.json']);
 if(![3,4].includes(names.length)||new Set(names).size!==names.length)
  fail('Выберите три обязательных файла без повторов и необязательный video-quality.json.');
 const unknown=names.find(name=>!allowed.has(name));
 if(unknown)fail('Неизвестный файл для проверки MP4: '+unknown+'. Выберите только файлы текущего результата монтажа.');
 const missing=required.filter(name=>!names.includes(name));
 if(missing.length)fail('Отсутствуют обязательные файлы: '+missing.join(', '));
}
const endWith=(text:unknown,name:string)=>typeof text==='string'&&text.split(/[\\/]/).at(-1)===name;
export function readPersonaLocalRenderRecord(value:unknown):PersonaLocalRenderRecord|null{
 const v=obj(value);
 return v.version===1&&v.kind==='persona-local-render-review-v1'&&typeof v.projectId==='string'&&
 typeof v.briefIdeaId==='string'&&typeof v.briefSnapshot==='string'&&v.briefSnapshot.length<=150000&&
 typeof v.briefFingerprintSha256==='string'&&hashPattern.test(v.briefFingerprintSha256)&&
 typeof v.mp4Sha256==='string'&&hashPattern.test(v.mp4Sha256)&&v.mp4Name==='draft-reel.mp4'&&
 typeof v.mp4Bytes==='number'&&Number.isSafeInteger(v.mp4Bytes)&&v.mp4Bytes>0&&typeof v.durationSec==='number'&&Number.isFinite(v.durationSec)&&v.durationSec>0&&
 v.width===1080&&v.height===1920&&v.fps===30&&typeof v.importedAt==='string'&&Number.isFinite(Date.parse(v.importedAt))&&
 typeof v.timingStatus==='string'&&v.status==='awaiting-author-review'&&v.publicationApproved===false&&
 v.qaProvenance==='locally-imported-report-not-independently-attested'&&
 (v.quality===undefined||isPersonaVideoQualitySummary(v.quality,v.mp4Sha256 as string))&&
 (v.finished===undefined||Boolean(readPersonaFinishedRenderRecord(v.finished))&&
  readPersonaFinishedRenderRecord(v.finished)?.sourceDraftSha256===v.mp4Sha256&&
  readPersonaFinishedRenderRecord(v.finished)?.briefFingerprintSha256===v.briefFingerprintSha256)
 ?v as PersonaLocalRenderRecord:null;
}

/**
 * Reimporting the exact same draft is a metadata refresh, not a new editorial cut.
 * Keep the original import identity (used for concurrency checks), its finished
 * candidate, and any previously verified quality report. Never transfer those
 * records to a changed MP4, brief or project.
 */
export function mergePersonaDraftReimport(
 previous:PersonaLocalRenderRecord|null|undefined,
 imported:PersonaLocalRenderRecord
):PersonaLocalRenderRecord{
 if(!readPersonaLocalRenderRecord(imported))throw Error('Invalid new Persona draft evidence');
 if(!previous||!readPersonaLocalRenderRecord(previous)||
  previous.projectId!==imported.projectId||
  previous.briefIdeaId!==imported.briefIdeaId||
  previous.briefSnapshot!==imported.briefSnapshot||
  previous.briefFingerprintSha256!==imported.briefFingerprintSha256||
  previous.mp4Sha256!==imported.mp4Sha256||
  previous.mp4Bytes!==imported.mp4Bytes||
  Math.abs(previous.durationSec-imported.durationSec)>0.001)
  return imported;
 if(previous.quality&&imported.quality&&
  Date.parse(imported.quality.analyzedAt)<Date.parse(previous.quality.analyzedAt))
  throw Error('Повторный импорт не должен заменять отчёт качества более старым анализом.');
 if(previous.quality?.visualEvidence&&!imported.quality?.visualEvidence&&imported.quality)
  throw Error('Повторный импорт не должен удалять ранее сохранённые кадры для просмотра.');
 if(previous.quality&&imported.quality){
  const flags=previous.quality.findings.filter(item=>item.status==='warning'||item.status==='needs_human_review');
  if(flags.some(item=>!imported.quality?.findings.some(next=>next.id===item.id&&next.status===item.status)))
   throw Error('Повторный импорт черновика скрывает прежние предупреждения качества.');
 }
 const merged:PersonaLocalRenderRecord={
  ...imported,importedAt:previous.importedAt,
  ...(imported.quality||previous.quality?{quality:imported.quality??previous.quality}:{}),
  ...(previous.finished?{finished:previous.finished}:{})
 };
 if(!readPersonaLocalRenderRecord(merged))
  throw Error('Reimport does not match the saved Persona review');
 return merged;
}

/** Browser-provided bytes, independently hashed, are matched against an untrusted local report.
 * This does not independently rerun FFprobe/FFmpeg or grant approval. */
export function inspectPersonaLocalRenderImport(input:{
 projectId:string;brief:PersonaProductionBrief;briefFingerprintSha256:string;result:unknown;qa:unknown;quality?:unknown;
 video:MediaFileInfo;importedAt:string;
}):PersonaLocalRenderRecord{
 const {projectId,brief,briefFingerprintSha256,video,importedAt}=input;
 const result=obj(input.result),qa=obj(input.qa),evidence=obj(qa.evidence),gate=obj(qa.handoff);
 if(!projectId||!hashPattern.test(briefFingerprintSha256)||!hashPattern.test(video.sha256))
  fail('Невозможно проверить криптографический отпечаток файла.');
 if(brief.sourceFormat!=='reel'||brief.script.length!==7||brief.shots.length!==7)
  fail('Импорт разрешён только для семисценного Reels.');
 if(result.version!==1||result.status!=='awaiting-author-review'||result.distributionAllowed!==false||
    result.briefIdeaId!==brief.ideaId||result.briefFingerprintSha256!==briefFingerprintSha256)
  fail('RESULT.json не соответствует текущей версии съёмочного брифа.');
 if(!endWith(result.output,'draft-reel.mp4')||!endWith(result.qaPath,'qa.json')||video.name!=='draft-reel.mp4')
  fail('Выберите файлы draft-reel.mp4, qa.json и RESULT.json из одного результата монтажа.');
 if(!Array.isArray(result.events)||!result.events.includes('real_mp4_rendered')||!result.events.includes('technical_qa_passed'))
  fail('Нет полного подтверждения этапов рендера и технической проверки в RESULT.json.');
 if(gate.passed!==false||gate.status!=='blocked'||!Array.isArray(gate.errors)||
    gate.errors.length!==1||gate.errors[0]!=='author approval required'||qa.distribution!==null)
  fail('QA не сохраняет обязательный запрет публикации до авторской проверки.');
 const valid=evidence.fileExists===true&&evidence.probeVerified===true&&evidence.blackFrameCheckPassed===true&&
  evidence.audioCheckPassed===true&&evidence.width===1080&&evidence.height===1920&&evidence.fps===30&&
  evidence.videoCodec==='h264'&&evidence.audioCodec==='aac'&&typeof evidence.bytes==='number'&&Number.isSafeInteger(evidence.bytes)&&
  evidence.bytes===video.size&&typeof evidence.sha256==='string'&&
  evidence.sha256.toLowerCase()===video.sha256.toLowerCase()&&
  typeof evidence.durationSec==='number'&&Number.isFinite(evidence.durationSec)&&evidence.durationSec>0;
 if(!valid)fail('MP4 не совпадает с QA или в отчёте не пройдена техническая проверка.');
 const quality=input.quality===undefined?null:parsePersonaVideoQuality(input.quality,video.sha256.toLowerCase());
 const rawQualityVideo=obj(obj(input.quality).video);
 if(input.quality!==undefined&&(!quality||rawQualityVideo.bytes!==video.size||
  rawQualityVideo.width!==1080||rawQualityVideo.height!==1920||rawQualityVideo.fps!==30||
  typeof rawQualityVideo.durationSec!=='number'||
  Math.abs(rawQualityVideo.durationSec-Number(evidence.durationSec))>0.75))
  fail('video-quality.json отсутствует, повреждён либо относится к другому MP4.');
 const recorded=obj(result.technicalChecks);
 if(recorded.sha256!==evidence.sha256||recorded.bytes!==evidence.bytes||
   recorded.durationSec!==evidence.durationSec||recorded.width!==evidence.width||
   recorded.height!==evidence.height||recorded.fps!==evidence.fps||
   recorded.blackFrameCheckPassed!==true||recorded.audioCheckPassed!==true)
  fail('RESULT.json и qa.json содержат разные сведения об MP4.');
 // HTMLVideoElement independently parses these dimensions from the selected file.
 // FPS still comes from FFprobe evidence and is not independently measured here.
 if((video.width!==undefined&&(video.width!==1080||video.width!==evidence.width))||
    (video.height!==undefined&&(video.height!==1920||video.height!==evidence.height)))
  fail('Фактическое разрешение выбранного MP4 отличается от QA-отчёта (требуется 1080×1920).');
 if(video.durationSec!==undefined&&(!Number.isFinite(video.durationSec)||Math.abs(video.durationSec-Number(evidence.durationSec))>0.75))
  fail('Длительность MP4 отличается от технического отчёта.');
 const timing=obj(result.timing);
 const record={version:1 as const,kind:'persona-local-render-review-v1' as const,projectId,
  briefIdeaId:brief.ideaId,briefSnapshot:JSON.stringify(brief),briefFingerprintSha256,
  mp4Sha256:video.sha256.toLowerCase(),mp4Bytes:video.size,mp4Name:'draft-reel.mp4' as const,
  durationSec:Number(evidence.durationSec),width:1080 as const,height:1920 as const,fps:30 as const,
  timingStatus:typeof timing.status==='string'?timing.status.slice(0,100):'unknown',
  status:'awaiting-author-review' as const,importedAt,
  qaProvenance:'locally-imported-report-not-independently-attested' as const,publicationApproved:false as const,
  ...(quality?{quality}:{})};
 return record;
}
