/** Reference-informed production guidance. No remote inference, no inferred
 * author approval, and no copying reference footage into output. */
import {readFile,realpath,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve,relative,isAbsolute,sep} from 'node:path';
import {FOLDERS} from './persona-yandex-library.mjs';
import {tokenize} from './persona-local-library.mjs';
const hash=async path=>{const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex')};
const validHash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const num=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const median=a=>{const s=[...a].sort((x,y)=>x-y),i=Math.floor(s.length/2);return s.length%2?s[i]:(s[i-1]+s[i])/2};
const round=n=>Math.round(n*100)/100;
const supportedFormats=new Set(['cinematic','backstage']);
/** Only an explicit non-continuity format can use reference pacing. Text matches
 * select examples, not user-approved style. At least two distinct sources. */
export function buildReferenceProductionGuide({format,query,records}){
 if(!supportedFormats.has(format))return {status:'ABSTAIN',reason:'Format requires author/speech/performance continuity or is unspecified'};
 const terms=[...new Set(tokenize(query))].filter(t=>t.length>=4);
 if(!terms.length)return {status:'ABSTAIN',reason:'No meaningful query'};
 const seen=new Set(),ranked=[];
 for(const r of records){
  if(!validHash(r.assetSha256)||r.preference!=='unconfirmed'||r.montage?.status!=='HEURISTIC'||!num(r.montage.medianShotSec,.25,900)||
   !Array.isArray(r.montage.candidateCuts)||r.montage.candidateCuts.length<2||!num(r.technical?.durationSec,4,900)||seen.has(r.assetSha256))continue;
  const words=tokenize(r.description??'');
  const matches=terms.filter(t=>words.some(w=>w===t||w.startsWith(t)||w.length>=4&&t.startsWith(w)));
  if(!matches.length)continue;seen.add(r.assetSha256);ranked.push({...r,matches});
 }
 ranked.sort((a,b)=>b.matches.length-a.matches.length||a.assetSha256.localeCompare(b.assetSha256));
 const chosen=ranked.slice(0,3);
 if(chosen.length<2)return {status:'ABSTAIN',reason:'Fewer than two relevant measured references'};
 const raw=median(chosen.map(r=>r.montage.medianShotSec));
 const shotSec=round(Math.max(2.6,Math.min(3.6,raw)));
 const colors=chosen.filter(r=>r.color?.status==='measured'&&['bt709'].includes(r.technical?.colorSpace)&&r.technical?.transfer==='bt709'&&r.technical?.colorRange==='tv').map(r=>r.color?.measurement?.luma?.median).filter(n=>num(n,0,255));
 return {version:1,status:'REFERENCE_GUIDANCE',format,shotSec,rawMedianShotSec:round(raw),referenceLumaMedian:colors.length>=2?round(median(colors)):null,
  references:chosen.map(r=>({assetSha256:r.assetSha256,evidenceSha256:r.evidenceSha256,matchedTerms:r.matches,medianShotSec:r.montage.medianShotSec})),
  preference:'unconfirmed',colorPolicy:'comparison-only; no automatic LUT or skin-tone change',speechPolicy:'do not change windows on any source without verified no-audio status',
  limitations:['Heuristic cuts; bounded pacing hint, not target for every shot.','Reference inclusion is not author approval.']};
}
export async function loadReferenceProductionGuide({cache,format,query}){
 if(!cache||!supportedFormats.has(format))return {status:'ABSTAIN',reason:'Cache not configured or format protected'};
 const dir=join(resolve(cache),'catalogs',FOLDERS[1]);
 let catalog,index;
 try{
  catalog=JSON.parse(await readFile(join(dir,'persona-assets-v1.json'),'utf8'));
  index=JSON.parse(await readFile(join(dir,'reference-evidence-v1.json'),'utf8'));
 }catch(e){if(e.code==='ENOENT')return {status:'ABSTAIN',reason:'Reference evidence not indexed'};throw e}
 if(catalog.kind!=='persona-local-library-v1'||!Array.isArray(catalog.assets)||index.version!==1||!Array.isArray(index.rows))throw Error('Invalid reference evidence');
 const root=await realpath(join(resolve(cache),'sources',FOLDERS[1])),records=[];
 for(const a of catalog.assets.filter(a=>a.availability==='local'&&a.kind==='video'&&validHash(a.sha256)).slice(0,500)){
  const observed=index.rows.filter(r=>r.assetSha256===a.sha256&&r.kind==='video'&&r.provenance==='local_vision_frame'&&r.preference==='unconfirmed')
   .flatMap(r=>Array.isArray(r.features)?r.features.filter(f=>f.status==='observed').map(f=>String(f.observation??'').slice(0,260)):[]).slice(0,18);
  const description=[a.annotation?.description,...(a.annotation?.tags??[]),...observed].join(' ').slice(0,4000);
  if(!description.trim())continue;
  const terms=tokenize(query).filter(t=>t.length>=4),words=tokenize(description);
  if(!terms.some(t=>words.some(w=>w===t||w.startsWith(t)||w.length>=4&&t.startsWith(w))))continue;
  let bytes;
  try{bytes=await readFile(join(dir,'video-evidence',a.sha256+'.json'))}catch(e){if(e.code==='ENOENT')continue;throw e}
  const r=JSON.parse(bytes);
  if(r.version!=='reference-video-v1'||r.assetSha256!==a.sha256||!['MEASURED_WITH_LIMITATIONS','PARTIAL'].includes(r.status)||r.technical?.sha256!==a.sha256)continue;
  const source=await realpath(a.sourcePath),rel=relative(root,source),s=await stat(source);
  if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)||!s.isFile()||await hash(source)!==a.sha256)continue;
  records.push({...r,description,evidenceSha256:createHash('sha256').update(bytes).digest('hex')});
 }
 return buildReferenceProductionGuide({format,query,records});
}

/** Compare only explicitly compatible SDR metadata. Luma is content-dependent:
 * this is an observation, never a score, LUT decision or proof of correct skin. */
export function compareReferenceColor(guide,quality){
 if(guide?.status!=='REFERENCE_GUIDANCE'||!num(guide.referenceLumaMedian,0,255))return {status:'NOT_COMPARABLE',reason:'No two compatible measured reference colors'};
 const v=quality?.video,m=quality?.findings?.find(f=>f.id==='visual_metrics'&&f.status==='measured')?.measurement;
 if(v?.colorSpace!=='bt709'||v.transfer!=='bt709'||v.colorRange!=='tv'||!num(m?.luma?.median,0,255))return {status:'NOT_COMPARABLE',reason:'Candidate does not have comparable explicit SDR metadata'};
 return {status:'MEASURED_DIFFERENCE_ONLY',candidateSha256:v.sha256,referenceLumaMedian:guide.referenceLumaMedian,candidateLumaMedian:round(m.luma.median),delta:round(m.luma.median-guide.referenceLumaMedian),colorPresetChanged:false,limitations:'Mean frame luma is affected by scene content, exposure and framing; no artistic score or color correction is inferred.'};
}
