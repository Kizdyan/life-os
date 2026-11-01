import type {PersonaProductionBrief} from '../../../packages/core/src/persona-production-brief';

export type PersonaLocalRenderRecord={
 version:1;kind:'persona-local-render-review-v1';projectId:string;briefIdeaId:string;briefSnapshot:string;
 briefFingerprintSha256:string;mp4Sha256:string;mp4Bytes:number;mp4Name:'draft-reel.mp4';durationSec:number;
 width:1080;height:1920;fps:30;timingStatus:string;status:'awaiting-author-review';importedAt:string;
 qaProvenance:'locally-imported-report-not-independently-attested';publicationApproved:false;
};
type MediaFileInfo={name:string;size:number;sha256:string;durationSec?:number};
const hashPattern=/^[a-f0-9]{64}$/i;
const fail=(text:string):never=>{throw new Error(text)};
const obj=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const endWith=(text:unknown,name:string)=>typeof text==='string'&&text.split(/[\\/]/).at(-1)===name;
export function readPersonaLocalRenderRecord(value:unknown):PersonaLocalRenderRecord|null{
 const v=obj(value);
 return v.version===1&&v.kind==='persona-local-render-review-v1'&&typeof v.projectId==='string'&&
 typeof v.briefIdeaId==='string'&&typeof v.briefSnapshot==='string'&&v.briefSnapshot.length<=150000&&
 typeof v.briefFingerprintSha256==='string'&&hashPattern.test(v.briefFingerprintSha256)&&
 typeof v.mp4Sha256==='string'&&hashPattern.test(v.mp4Sha256)&&v.mp4Name==='draft-reel.mp4'&&
 typeof v.mp4Bytes==='number'&&Number.isSafeInteger(v.mp4Bytes)&&v.mp4Bytes>0&&typeof v.durationSec==='number'&&Number.isFinite(v.durationSec)&&v.durationSec>0&&
 v.width===1080&&v.height===1920&&v.fps===30&&typeof v.importedAt==='string'&&
 typeof v.timingStatus==='string'&&v.status==='awaiting-author-review'&&v.publicationApproved===false&&
 v.qaProvenance==='locally-imported-report-not-independently-attested'?v as PersonaLocalRenderRecord:null;
}

/** Browser-provided bytes, independently hashed, are matched against an untrusted local report.
 * This does not independently rerun FFprobe/FFmpeg or grant approval. */
export function inspectPersonaLocalRenderImport(input:{
 projectId:string;brief:PersonaProductionBrief;briefFingerprintSha256:string;result:unknown;qa:unknown;
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
 const recorded=obj(result.technicalChecks);
 if(recorded.sha256!==evidence.sha256||recorded.bytes!==evidence.bytes||
   recorded.durationSec!==evidence.durationSec||recorded.width!==evidence.width||
   recorded.height!==evidence.height||recorded.fps!==evidence.fps||
   recorded.blackFrameCheckPassed!==true||recorded.audioCheckPassed!==true)
  fail('RESULT.json и qa.json содержат разные сведения об MP4.');
 if(video.durationSec!==undefined&&(!Number.isFinite(video.durationSec)||Math.abs(video.durationSec-Number(evidence.durationSec))>0.75))
  fail('Длительность MP4 отличается от технического отчёта.');
 const timing=obj(result.timing);
 const record={version:1 as const,kind:'persona-local-render-review-v1' as const,projectId,
  briefIdeaId:brief.ideaId,briefSnapshot:JSON.stringify(brief),briefFingerprintSha256,
  mp4Sha256:video.sha256.toLowerCase(),mp4Bytes:video.size,mp4Name:'draft-reel.mp4' as const,
  durationSec:Number(evidence.durationSec),width:1080 as const,height:1920 as const,fps:30 as const,
  timingStatus:typeof timing.status==='string'?timing.status.slice(0,100):'unknown',
  status:'awaiting-author-review' as const,importedAt,
  qaProvenance:'locally-imported-report-not-independently-attested' as const,publicationApproved:false as const};
 return record;
}
