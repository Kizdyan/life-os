/**
 * Variable-length story intake: explicit S01_take01.mp4...S30_takeNN.mov names.
 * No directory crawling; no unlabelled videos; no symlinks or source mutation.
 */
import {readdir,realpath,stat,writeFile} from 'node:fs/promises';
import {isAbsolute,join,relative,resolve,sep} from 'node:path';
const videoExt=/\.(?:mp4|mov|mkv|webm|m4v)$/i;
const label=/^S(0[1-9]|[12]\d|30)_take(0[1-9]|[1-9]\d)\.(?:mp4|mov|mkv|webm|m4v)$/i;
const fail=msg=>{throw Error('Persona generic takes: '+msg)};
export async function createGenericTakeManifest({folderPath,manifestPath}={}){
 if(typeof folderPath!=='string'||typeof manifestPath!=='string')fail('input folder and new manifest required');
 const root=await realpath(resolve(folderPath)),out=resolve(manifestPath);
 const relativeOutput=relative(root,out);
 if(relativeOutput===''||(!isAbsolute(relativeOutput)&&relativeOutput!=='..'&&!relativeOutput.startsWith('..'+sep)))
  fail('manifest must be outside the originals folder');
 const entries=await readdir(root,{withFileTypes:true});
 const videos=entries.filter(x=>videoExt.test(x.name));
 if(videos.length<2||videos.length>12)fail('expect 2–12 explicitly named scene takes');
 if(videos.some(x=>!x.isFile()||!label.test(x.name)))
  fail('every video must be named S01_take01.mp4, S02_take01.mp4, etc.; no mixed layouts or links');
 const ids=new Set(),sources=[];
 for(const entry of videos.sort((a,b)=>a.name.localeCompare(b.name,'en'))){
  const match=label.exec(entry.name);
  const id='s'+match[1]+'_t'+match[2];
  if(ids.has(id))fail('duplicate scene-take label');
  ids.add(id);
  const path=await realpath(join(root,entry.name));
  const rel=relative(root,path);
  if(rel===''||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))
   fail('source file escapes selected folder');
  const s=await stat(path);
  if(!s.isFile()||s.size<1024||s.size>2*1024*1024*1024)
   fail('source take is missing or outside video size limits');
  sources.push({id,path});
 }
 const manifest={version:1,sources};
 await writeFile(out,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 return {manifest:out,layout:'variable-scenes',count:sources.length,note:'All candidates are unreviewed; scene file names are labels, NOT verification of spoken content.'};
}
/** Decide without creating anything: a folder is generic only when ALL video names match. */
export async function isGenericTakeFolder(folderPath){
 const entries=await readdir(folderPath,{withFileTypes:true});
 const videos=entries.filter(x=>videoExt.test(x.name));
 return videos.length>=2&&videos.length<=12&&videos.every(x=>x.isFile()&&label.test(x.name));
}
