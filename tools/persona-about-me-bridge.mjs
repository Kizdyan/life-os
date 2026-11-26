/** Local-only bridge from verified shortlist to existing editor archive.
 * Requests identify a generated package and SHA, never an arbitrary path. */
import {readFile,realpath,stat} from 'node:fs/promises';
import {join,relative,isAbsolute,sep,basename,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {reselectPhotos} from './persona-yandex-start.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest=/^[a-f0-9]{64}$/;
const categories=['portrait','screen','stage','music','editorial'];
const sha=b=>createHash('sha256').update(b).digest('hex');
async function contained(root,file){
 const base=await realpath(root),target=await realpath(file),rel=relative(base,target);
 if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw Error('About Me package path outside cache');
 return target;
}
export async function prepareAboutMe(cache){
 const report=await reselectPhotos({cache}),id=basename(report.shortlist).replace(/^reselection-/,'');
 if(!uuid.test(id))throw Error('Invalid shortlist ID');
 const selected=report.selected.filter(a=>['.jpg','.jpeg','.png'].includes(extname(a.shortlistFile).toLowerCase()));
 return {version:1,id,status:'AUTHOR_REVIEW_REQUIRED',checkpointSha256:report.checkpointSha256,scoresReused:report.scoresReused,modelCalls:0,
  coverage:report.coverage,missingCategories:categories.filter(k=>!selected.some(a=>a.category===k)),
  assets:selected.map(a=>({sha256:a.sha256,category:a.category,score:a.score,name:basename(a.shortlistFile)})),excludedFormatCount:report.selected.length-selected.length,publicationApproved:false};
}
export async function readAboutMeImage(cache,id,hash){
 if(!uuid.test(id)||!digest.test(hash))throw Error('Invalid package or asset ID');
 const root=join(cache,'about-me'),dir=await contained(root,join(root,'reselection-'+id));
 const manifestPath=await contained(dir,join(dir,'selection.json'));
 if((await stat(manifestPath)).size>1024*1024)throw Error('Invalid package manifest size');
 const report=JSON.parse(await readFile(manifestPath,'utf8'));
 if(report.version!==1||report.kind!=='persona-about-me-candidate'||report.status!=='AUTHOR_REVIEW_REQUIRED'||!Array.isArray(report.selected)||report.selected.length>10)throw Error('Invalid About Me manifest');
 const a=report.selected.find(x=>x.sha256===hash);
 if(!a||!categories.includes(a.category)||typeof a.shortlistFile!=='string'||basename(a.shortlistFile)!==a.shortlistFile||/[\\/]/.test(a.shortlistFile))throw Error('Asset not in package');
 const path=await contained(dir,join(dir,a.shortlistFile)),s=await stat(path);
 if(!s.isFile()||s.size<1024||s.size>25*1024*1024)throw Error('Asset outside editor size limit');
 const bytes=await readFile(path);
 if(sha(bytes)!==hash)throw Error('Shortlist image hash mismatch');
 const ext=extname(path).toLowerCase(),mime=ext==='.png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':
  ['.jpg','.jpeg'].includes(ext)&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':null;
 if(!mime)throw Error('Unsupported image encoding');
 return {bytes,mime};
}
