import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export function runStudioPython(config, script, args, timeout, input) {
 const env = config.apiEnv??process.env;
 return new Promise((resolve,reject)=>{
  const child = spawn(env.PERSONA_STUDIO_PYTHON||'python',['-B','-X','utf8',
   fileURLToPath(new URL(script,import.meta.url)),...args],{
   stdio:[input===undefined?'ignore':'pipe','pipe','pipe'],windowsHide:true,shell:false,
    env:{...process.env,...env,
    ...(config.ffmpegDir?{PERSONA_MEDIA_FFMPEG_DIR:config.ffmpegDir}:{})}});
  let stdout='',stderr='',timedOut=false;
  child.stdout.on('data',buf=>{stdout=(stdout+buf.toString('utf8')).slice(-64000);});
  child.stderr.on('data',buf=>{stderr=(stderr+buf.toString('utf8')).slice(-1400);});
  if(child.stdin){
   child.stdin.on('error',()=>{});
   child.stdin.end(JSON.stringify(input),'utf8');
  }
  const timer=setTimeout(()=>{timedOut=true;child.kill();},timeout);
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('close',code=>{
   clearTimeout(timer);
   if(env.PERSONA_STAGE_CACHE_LOG==='1'){
    for(const line of stderr.split('\n')){
     if(/^stage_cache [A-Z_]+ [a-z0-9_]+\r?$/.test(line))console.error(line.trimEnd());
    }
   }
   if(timedOut)reject(Object.assign(Error('Истекло время ожидания ответа.'),{code:'ETIMEDOUT'}));
   else if(code!==0)reject(Error(stderr.trim().split('\n').at(-1)||'Ошибка локальной обработки.'));
   else {try{resolve(JSON.parse(stdout));}catch(error){reject(error);}}
  });
 });
}
