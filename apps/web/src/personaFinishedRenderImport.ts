import type {PersonaLocalRenderRecord} from './personaLocalRenderImport';

export const PERSONA_FINAL_REVIEW_KEYS=['performance','framing','color','audio','captions','rhythm'] as const;
export type PersonaFinalReviewKey=typeof PERSONA_FINAL_REVIEW_KEYS[number];
export type PersonaFinalReviewChecks=Record<PersonaFinalReviewKey,boolean>;
export type PersonaFinalAuthorReview={
 decision:'approved-final-cut'|'needs-revision';reviewer:string;notes:string;reviewedAt:string;
 watchedEntireVideo:true;criteria:PersonaFinalReviewChecks;videoSha256:string;
 publicationApproved:false;
};
export type PersonaVideoQualityFinding={id:string;status:'measured'|'warning'|'needs_human_review'|'not_measured';title:string;detail:string;timecodes:string[]};
export type PersonaVideoQualitySummary={version:1;videoSha256:string;analyzedAt:string;warningCount:number;humanReviewCount:number;findings:PersonaVideoQualityFinding[];
 visualEvidence?:{contactSheetPath:string;frameCount:number}};
export type PersonaFinishedRenderRecord={
 version:1;kind:'persona-finished-render-review-v1';sourceDraftSha256:string;briefFingerprintSha256:string;
 finishedSha256:string;finishedBytes:number;durationSec:number;width:1080;height:1920;fps:30;
 captionsBurnedIn:true;captionCount:number;color:{brightness:number;contrast:number;saturation:number};
 musicAdded:boolean;musicCue?:{startSec:number;endSec:number;fadeInSec:number;fadeOutSec:number};
 importedAt:string;status:'awaiting-author-review';publicationApproved:false;
 qaProvenance:'browser-sha256-matched-local-ffmpeg-report';authorReview?:PersonaFinalAuthorReview;
 quality?:PersonaVideoQualitySummary;
 /** Earlier SHA-bound measurements remain visible when a later local analysis
  * adds non-conflicting findings for this exact MP4. */
 qualityHistory?:PersonaVideoQualitySummary[];
};
type VideoFile={name:string;size:number;sha256:string;durationSec:number;width?:number;height?:number};
const hash=/^[a-f0-9]{64}$/i;
const record=(x:unknown):Record<string,unknown>=>x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:{};
const fail=(message:string):never=>{throw Error(message)};
const fileName=(path:unknown)=>typeof path==='string'?path.split(/[\\/]/).at(-1):null;
const within=(x:unknown,min:number,max:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const qualityStatuses=new Set(['measured','warning','needs_human_review','not_measured']);
export function parsePersonaVideoQuality(value:unknown,expectedSha:string):PersonaVideoQualitySummary|null{
 const quality=record(value),video=record(quality.video),approval=record(quality.authorApproval);
 const raw=Array.isArray(quality.findings)?quality.findings:[];
 if(quality.version!==1||quality.kind!=='persona-video-quality-v1'||quality.status!=='awaiting-author-review'||
   quality.publicationApproved!==false||quality.distributionAllowed!==false||
   video.sha256!==expectedSha||typeof quality.analyzedAt!=='string'||!Number.isFinite(Date.parse(quality.analyzedAt))||
   approval.approvedByAuthor!==false||approval.publicationApproved!==false||!raw.length||raw.length>80)return null;
 const findings:PersonaVideoQualityFinding[]=[];
 for(const item of raw){const finding=record(item),timecodes=Array.isArray(finding.timecodes)?finding.timecodes:[];
  if(typeof finding.id!=='string'||!finding.id||finding.id.length>100||!qualityStatuses.has(String(finding.status))||
    typeof finding.title!=='string'||!finding.title||finding.title.length>200||typeof finding.detail!=='string'||finding.detail.length>2000||
    timecodes.some(time=>typeof time!=='string'||time.length>30))return null;
  findings.push({id:finding.id,status:finding.status as PersonaVideoQualityFinding['status'],title:finding.title,detail:finding.detail,timecodes:timecodes as string[]});
 }
 if(new Set(findings.map(finding=>finding.id)).size!==findings.length)return null;
 const evidence=record(quality.visualEvidence),frames=Array.isArray(evidence.frames)?evidence.frames:[];
 if(quality.visualEvidence!==undefined&&(
  typeof evidence.contactSheetPath!=='string'||!evidence.contactSheetPath.trim()||
  evidence.contactSheetPath.length>1000||frames.length<1||frames.length>12))return null;
 const visualEvidence=typeof evidence.contactSheetPath==='string'&&evidence.contactSheetPath.length<=1000&&frames.length>0&&frames.length<=12?
  {contactSheetPath:evidence.contactSheetPath,frameCount:frames.length}:undefined;
 return {version:1,videoSha256:expectedSha,analyzedAt:quality.analyzedAt as string,
  warningCount:findings.filter(finding=>finding.status==='warning').length,
  humanReviewCount:findings.filter(finding=>finding.status==='needs_human_review').length,findings,...(visualEvidence?{visualEvidence}:{})};
}
/** Validate persisted quality summaries, including derived counts. */
export function isPersonaVideoQualitySummary(value:unknown,sha:string):boolean{
 const summary=record(value);
 if(summary.version!==1||summary.videoSha256!==sha||
  !Number.isSafeInteger(summary.warningCount)||!Number.isSafeInteger(summary.humanReviewCount))return false;
 if(summary.visualEvidence!==undefined){
  const visual=record(summary.visualEvidence);
  if(typeof visual.contactSheetPath!=='string'||!visual.contactSheetPath.trim()||
   visual.contactSheetPath.length>1000||!Number.isSafeInteger(visual.frameCount)||
   !within(visual.frameCount,1,12))return false;
 }
 const normalized=parsePersonaVideoQuality({
  version:1,kind:'persona-video-quality-v1',status:'awaiting-author-review',
  publicationApproved:false,distributionAllowed:false,analyzedAt:summary.analyzedAt,
  video:{sha256:sha},authorApproval:{approvedByAuthor:false,publicationApproved:false},
  findings:summary.findings},sha);
 return Boolean(normalized&&normalized.warningCount===summary.warningCount&&
  normalized.humanReviewCount===summary.humanReviewCount);
}
function isPersonaVideoQualityHistory(value:unknown,sha:string,current:PersonaVideoQualitySummary|undefined):boolean{
 if(value===undefined)return true;
 if(!Array.isArray(value)||value.length<1||value.length>12)return false;
 let previousTimestamp=-Infinity;
 return value.every(item=>{
  if(!isPersonaVideoQualitySummary(item,sha))return false;
  const timestamp=Date.parse(item.analyzedAt);
  if(!Number.isFinite(timestamp)||timestamp<=previousTimestamp||
    (current!==undefined&&timestamp>=Date.parse(current.analyzedAt)))return false;
  previousTimestamp=timestamp;
  return true;
 });
}
export function readPersonaFinishedRenderRecord(value:unknown):PersonaFinishedRenderRecord|null{
 const r=record(value),color=record(r.color);
 const checks=record(record(r.authorReview).criteria),review=record(r.authorReview),cue=record(r.musicCue);
 const cueValid=r.musicCue===undefined||(r.musicAdded===true&&
  within(cue.startSec,0,r.durationSec as number)&&within(cue.endSec,0,r.durationSec as number)&&
  typeof cue.startSec==='number'&&typeof cue.endSec==='number'&&cue.endSec-cue.startSec>=0.25&&
  within(cue.fadeInSec,0,1)&&within(cue.fadeOutSec,0,1)&&
  typeof cue.fadeInSec==='number'&&typeof cue.fadeOutSec==='number'&&
  cue.fadeInSec+cue.fadeOutSec<=cue.endSec-cue.startSec);
 const reviewValid=r.authorReview===undefined||(
  (review.decision==='approved-final-cut'||review.decision==='needs-revision')&&
  typeof review.reviewer==='string'&&review.reviewer.trim().length>=2&&review.reviewer.length<=100&&
  typeof review.notes==='string'&&review.notes.length<=3000&&typeof review.reviewedAt==='string'&&
  Number.isFinite(Date.parse(review.reviewedAt as string))&&Number.isFinite(Date.parse(r.importedAt as string))&&
  Date.parse(review.reviewedAt as string)>=Date.parse(r.importedAt as string)&&
  review.watchedEntireVideo===true&&review.videoSha256===r.finishedSha256&&
  review.publicationApproved===false&&
  PERSONA_FINAL_REVIEW_KEYS.every(k=>typeof checks[k]==='boolean')&&
  (review.decision==='needs-revision'?review.notes.trim().length>=5:
   PERSONA_FINAL_REVIEW_KEYS.every(k=>checks[k]===true))
 );
 return r.version===1&&r.kind==='persona-finished-render-review-v1'&&isSha(r.sourceDraftSha256)&&
  isSha(r.briefFingerprintSha256)&&isSha(r.finishedSha256)&&
  Number.isSafeInteger(r.finishedBytes)&&typeof r.finishedBytes==='number'&&r.finishedBytes>0&&
  within(r.durationSec,0.1,900)&&r.width===1080&&r.height===1920&&r.fps===30&&
  r.captionsBurnedIn===true&&Number.isSafeInteger(r.captionCount)&&
  typeof r.captionCount==='number'&&r.captionCount>0&&r.captionCount<=80&&
  within(color.brightness,-0.05,0.05)&&within(color.contrast,0.92,1.08)&&
  within(color.saturation,0.88,1.12)&&typeof r.musicAdded==='boolean'&&cueValid&&
  typeof r.importedAt==='string'&&Number.isFinite(Date.parse(r.importedAt))&&r.status==='awaiting-author-review'&&
  r.publicationApproved===false&&r.qaProvenance==='browser-sha256-matched-local-ffmpeg-report'&&
  (r.quality===undefined||isPersonaVideoQualitySummary(r.quality,r.finishedSha256 as string))&&
  isPersonaVideoQualityHistory(r.qualityHistory,r.finishedSha256 as string,r.quality)&&
  reviewValid?r as PersonaFinishedRenderRecord:null;
}
function isSha(value:unknown):value is string{return typeof value==='string'&&hash.test(value)}
/**
 * Match actual browser bytes with two *local claims*. This is not independent
 * FFmpeg QA and does not prove subtitle aesthetics, playback or authorship.
 */
export function inspectPersonaFinishedRenderImport(input:{
 draft:PersonaLocalRenderRecord;report:unknown;qa:unknown;quality?:unknown;video:VideoFile;importedAt:string;
}):PersonaFinishedRenderRecord{
 const {draft,video,importedAt}=input,report=record(input.report),qa=record(input.qa);
 const evidence=record(qa.evidence),handoff=record(qa.handoff),caption=record(report.captions);
 const color=record(report.color),music=report.music;
 if(!isSha(video.sha256)||video.name!=='finished-candidate.mp4'||video.size<1024||
   video.size>160*1024*1024||!within(video.durationSec,0.1,900))
  fail('Нужно выбрать действительный finished-candidate.mp4.');
 // Browser video metadata independently checks frame dimensions.
 if((video.width!==undefined&&video.width!==1080)||
    (video.height!==undefined&&video.height!==1920))
  fail('Фактическое разрешение итогового MP4 отличается от заявленного 1080×1920.');
 if(report.version!==1||report.kind!=='persona-finished-candidate-v1'||
  report.status!=='awaiting-author-review'||report.publicationApproved!==false||
  report.distributionAllowed!==false||
  report.briefIdeaId!==draft.briefIdeaId||
  report.briefFingerprintSha256!==draft.briefFingerprintSha256||
  report.originalSha256!==draft.mp4Sha256||
  fileName(report.originalDraft)!=='draft-reel.mp4')
  fail('FINISH-RESULT.json не соответствует сохранённому черновику или разрешает публикацию.');
 if(fileName(report.output)!==video.name||fileName(report.qaPath)!=='finish-qa.json'||
  !isSha(report.outputSha256)||report.outputSha256.toLowerCase()!==video.sha256.toLowerCase())
  fail('FINISH-RESULT.json не совпадает с выбранным итоговым MP4.');
 if(!Array.isArray(report.stages)||
  !report.stages.includes('reviewed-srt-burned-into-new-mp4')||
  !report.stages.includes('real-ffmpeg-technical-qa-passed-no-publication')||
  caption.burnedIn!==true||caption.source!=='explicit-human-reviewed-srt'||
  !isSha(caption.sourceSha256)||!Number.isSafeInteger(caption.cueCount)||
  !within(caption.cueCount,1,80))
  fail('Нет подтверждения этапа проверки и встраивания субтитров.');
 const qualityRequired=report.stages.includes('local-video-quality-analysis-written');
 if(input.quality!==undefined&&!qualityRequired)
  fail('Предоставлен video-quality.json, но FINISH-RESULT.json не подтверждает его создание.');
 const quality=qualityRequired?parsePersonaVideoQuality(input.quality,video.sha256.toLowerCase()):null;
 const qualityVideo=record(record(input.quality).video);
 if(qualityRequired&&(!fileName(report.qualityPath)||fileName(report.qualityPath)!=='video-quality.json'||!quality||
  qualityVideo.bytes!==video.size||qualityVideo.width!==1080||qualityVideo.height!==1920||
  qualityVideo.fps!==30||!within(qualityVideo.durationSec,0.1,900)||
  Math.abs((qualityVideo.durationSec as number)-video.durationSec)>0.75))
  fail('Отчёт качества видео отсутствует, повреждён или относится к другому MP4.');
 if(!within(color.brightness,-0.05,0.05)||!within(color.contrast,0.92,1.08)||
   !within(color.saturation,0.88,1.12))
  fail('Параметры цвета за пределами допустимого диапазона.');
 if(music!==null&&(
  !isSha(record(music).sha256)||record(music).rightsConfirmedByAuthor!==true||
  !within(record(music).volume,0,0.3)||!within(record(music).originalVolume,0.7,1)
 ))fail('Музыкальная дорожка не прошла явное подтверждение прав и уровня.');
 const rawMusic=record(music),hasCue=music!==null&&['startSec','endSec','fadeInSec','fadeOutSec']
  .some(key=>rawMusic[key]!==undefined);
 const cue=hasCue?{startSec:rawMusic.startSec,endSec:rawMusic.endSec,
  fadeInSec:rawMusic.fadeInSec,fadeOutSec:rawMusic.fadeOutSec}:null;
 if(cue&&(!within(cue.startSec,0,draft.durationSec)||!within(cue.endSec,0,draft.durationSec)||
  typeof cue.startSec!=='number'||typeof cue.endSec!=='number'||cue.endSec-cue.startSec<0.25||
  !within(cue.fadeInSec,0,1)||!within(cue.fadeOutSec,0,1)||
  typeof cue.fadeInSec!=='number'||typeof cue.fadeOutSec!=='number'||
  cue.fadeInSec+cue.fadeOutSec>cue.endSec-cue.startSec))
  fail('Некорректные временные границы или затухания музыкального фрагмента.');
 if(handoff.passed!==false||handoff.status!=='blocked'||!Array.isArray(handoff.errors)||
  handoff.errors.length!==1||handoff.errors[0]!=='author approval required'||
  !Array.isArray(handoff.assets)||handoff.assets.length!==1||
  record(handoff.assets[0]).passed!==true||qa.distribution!==null)
  fail('Заблокированное состояние публикации отсутствует в техническом QA.');
 if(evidence.fileExists!==true||evidence.probeVerified!==true||
  evidence.blackFrameCheckPassed!==true||evidence.audioCheckPassed!==true||
  evidence.videoCodec!=='h264'||evidence.audioCodec!=='aac'||
  evidence.width!==1080||evidence.height!==1920||evidence.fps!==30||
  evidence.path!==report.output||
  !Number.isSafeInteger(evidence.bytes)||evidence.bytes!==video.size||
  !isSha(evidence.sha256)||evidence.sha256.toLowerCase()!==video.sha256.toLowerCase()||
  !within(evidence.durationSec,0.1,900)||
  Math.abs((evidence.durationSec as number)-video.durationSec)>0.75||
  Math.abs((evidence.durationSec as number)-draft.durationSec)>0.25)
  fail('Итоговый MP4 не соответствует QA, оригинальному хронометражу или SHA-256.');
 const finished:PersonaFinishedRenderRecord={
  version:1,kind:'persona-finished-render-review-v1',
  sourceDraftSha256:draft.mp4Sha256,briefFingerprintSha256:draft.briefFingerprintSha256,
  finishedSha256:video.sha256.toLowerCase(),finishedBytes:video.size,
  durationSec:evidence.durationSec as number,width:1080,height:1920,fps:30,
  captionsBurnedIn:true,captionCount:caption.cueCount as number,
  color:{brightness:color.brightness as number,contrast:color.contrast as number,
   saturation:color.saturation as number},musicAdded:music!==null,
  ...(cue?{musicCue:cue as PersonaFinishedRenderRecord['musicCue']}:{}),importedAt,
  status:'awaiting-author-review',publicationApproved:false,
  qaProvenance:'browser-sha256-matched-local-ffmpeg-report',...(quality?{quality}:{})
 };
 return finished;
}
/**
 * Reimporting an identical finished MP4 may add measured QA; it must never
 * silently discard the author's decision or verified older evidence.
 * A different output SHA always starts a fresh, unapproved review.
 */
export function mergePersonaFinishedReimport(
 previous:PersonaFinishedRenderRecord|undefined,
 imported:PersonaFinishedRenderRecord
):PersonaFinishedRenderRecord{
 if(!readPersonaFinishedRenderRecord(imported))fail('Некорректная новая финальная версия.');
 if(!previous||!readPersonaFinishedRenderRecord(previous)||
  previous.finishedSha256!==imported.finishedSha256||
  previous.sourceDraftSha256!==imported.sourceDraftSha256||
  previous.briefFingerprintSha256!==imported.briefFingerprintSha256)
  return imported;
 if(previous.finishedBytes!==imported.finishedBytes||
  Math.abs(previous.durationSec-imported.durationSec)>0.001||
  previous.captionCount!==imported.captionCount||
  previous.captionsBurnedIn!==imported.captionsBurnedIn||
  previous.musicAdded!==imported.musicAdded||
  JSON.stringify(previous.color)!==JSON.stringify(imported.color)||
  JSON.stringify(previous.musicCue??null)!==JSON.stringify(imported.musicCue??null))
  fail('Отчёты одного MP4 противоречат сохранённым параметрам финализации.');
 if(previous.quality&&imported.quality&&
  Date.parse(imported.quality.analyzedAt)<Date.parse(previous.quality.analyzedAt))
  fail('Повторный импорт не должен заменять отчёт качества более старым анализом.');
 if(previous.quality&&imported.quality){
  const oldFindings=new Map(previous.quality.findings.map(item=>[item.id,item]));
  if(imported.quality.findings.some(item=>{
   const old=oldFindings.get(item.id);
   return old&&(old.title!==item.title||old.detail!==item.detail||
    JSON.stringify(old.timecodes)!==JSON.stringify(item.timecodes));
  }))fail('Повторный импорт изменил содержание уже сохранённых пунктов QA.');
 }
 if(previous.quality?.visualEvidence&&!imported.quality?.visualEvidence&&imported.quality)
  fail('Повторный импорт не должен удалять ранее сохранённые кадры для просмотра.');
 if(previous.quality&&imported.quality){
  const oldFlags=previous.quality.findings.filter(item=>item.status==='warning'||item.status==='needs_human_review');
  const newFlags=imported.quality.findings;
  if(oldFlags.some(item=>!newFlags.some(next=>next.id===item.id&&next.status===item.status)))
   fail('Новый отчёт качества скрывает ранее сохранённые предупреждения.');
 }
 const qualityHistory=previous.quality&&imported.quality&&
  Date.parse(imported.quality.analyzedAt)>Date.parse(previous.quality.analyzedAt)
  ?[...(previous.qualityHistory??[]),previous.quality]
  :previous.qualityHistory;
 const merged:PersonaFinishedRenderRecord={
  ...imported,importedAt:previous.importedAt,
  ...(imported.quality||previous.quality?{quality:imported.quality??previous.quality}:{}),
  ...(qualityHistory?.length?{qualityHistory}:{}),
  ...(imported.musicCue||previous.musicCue?{musicCue:imported.musicCue??previous.musicCue}:{}),
  ...(previous.authorReview?{authorReview:previous.authorReview}:{})
 };
 if(!readPersonaFinishedRenderRecord(merged))
  fail('Повторный импорт изменил сохранённую художественную приёмку.');
 return merged;
}

export function makePersonaFinalAuthorReview(input:{
 finished:PersonaFinishedRenderRecord;decision:PersonaFinalAuthorReview['decision'];
 reviewer:string;notes:string;criteria:PersonaFinalReviewChecks;watchedEntireVideo:boolean;
 videoSha256:string;reviewedAt:string;
}):PersonaFinalAuthorReview{
 const {finished,decision,criteria,watchedEntireVideo,videoSha256,reviewedAt}=input;
 const reviewer=input.reviewer.trim(),notes=input.notes.trim();
 if(!readPersonaFinishedRenderRecord(finished)||!isSha(videoSha256)||
  videoSha256!==finished.finishedSha256||watchedEntireVideo!==true)
  fail('Для редакторского решения нужно заново открыть и полностью проверить тот же MP4.');
 if(reviewer.length<2||reviewer.length>100||notes.length>3000||
  typeof reviewedAt!=='string'||!reviewedAt.trim()||
  !PERSONA_FINAL_REVIEW_KEYS.every(k=>typeof criteria?.[k]==='boolean'))
  fail('Заполните имя автора и все пункты художественной проверки.');
 if(!Number.isFinite(Date.parse(reviewedAt))||Date.parse(reviewedAt)<Date.parse(finished.importedAt))
  fail('Время художественной приёмки должно быть позже импорта MP4.');
 if(decision==='approved-final-cut'){
  if(!PERSONA_FINAL_REVIEW_KEYS.every(k=>criteria[k]))
   fail('Финальный монтаж нельзя принять с непроверенными художественными критериями.');
 }else if(decision==='needs-revision'){
  if(notes.length<5)fail('Укажите, какие изменения нужно внести в ролик.');
 }else fail('Неизвестное редакторское решение');
 return {decision,reviewer,notes,reviewedAt,criteria:{...criteria},watchedEntireVideo:true,
  videoSha256:finished.finishedSha256,publicationApproved:false};
}
