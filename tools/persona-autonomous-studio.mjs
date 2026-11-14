import {spawn} from 'node:child_process';
import {join, relative, resolve} from 'node:path';
import {mkdir, readFile, realpath, stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

export function studioAvailability(env) {
 const openrouter=Boolean(env.OPENROUTER_API_KEY?.trim());
 return {configured:Boolean(openrouter&&env.PERSONA_STUDIO_PYTHON&&env.PERSONA_STUDIO_RESOLVE_LAUNCHER),
  providers:openrouter?['OpenRouter']:[]};
}

export async function startStudio(session, {env, script, ffmpegDir}) {
 const output=join(session.output,'autonomous-'+randomUUID());
 await mkdir(output);
 const studio={state:'running',report:null,error:null};
 session.studio=studio;
 const child=spawn(env.PERSONA_STUDIO_PYTHON,['-B',script,session.output,session.input,output,'--send-frames'],
  {shell:false,windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...env,...(ffmpegDir?{PERSONA_MEDIA_FFMPEG_DIR:ffmpegDir}:{})}});
 let stderr='';
 child.stderr.on('data',bytes=>{stderr=(stderr+bytes.toString('utf8')).slice(-1400)});
 const timeout=setTimeout(()=>child.kill(),25*60*1000).unref();
 child.once('error',error=>{clearTimeout(timeout);studio.error=error.message;studio.state='failed'});
 child.once('close',async code=>{
  clearTimeout(timeout);
  if(studio.state!=='running')return;
  try {
   if(code!==0)throw Error(stderr.trim()||'Автономная студия остановилась до завершения');
   const report=JSON.parse(await readFile(join(output,'STUDIO.json'),'utf8'));
   const video=await realpath(resolve(report.video));
   const videoRelative=relative(await realpath(output),video).replaceAll('\\','/');
   if(!['APPROVED','REJECTED'].includes(report.status)||report.distributionAllowed!==false||
      report.publicationApproved!==false||!Array.isArray(report.attempts)||report.attempts.length<1||
      report.attempts.length>3||!/^attempt-[123]\/studio\.mp4$/.test(videoRelative)||!(await stat(video)).isFile()){
    throw Error('Некорректный отчёт автономной студии');
   }
   studio.video=video;
   studio.report={status:report.status,attempts:report.attempts.length,
    critique:report.attempts.at(-1).critique,missingReferences:report.missingReferences,soundSelectionBlocked:report.attempts.at(-1).direction.soundSelectionBlocked,publicationApproved:false,distributionAllowed:false};
   studio.state='completed';
  } catch(error) { studio.state='failed';studio.error=String(error.message||error); }
 });
 return studio;
}

export function studioView(session) {
 const studio=session.studio;
 return studio ? {state:studio.state,error:studio.error,report:studio.report} : {state:'idle',error:null,report:null};
}
