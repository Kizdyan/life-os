import {personaWorkerUrl} from './personaWorkerUrl';

export type GeneratedDraft={
 title:string;caption:string;
 slides:{eyebrow:string;title:string;body:string}[];
 platformNotes:{instagram:string;vk:string;youtube:string};
 style?:'editorial'|'old-money'|'documentary'|'minimal';
 assetInstruction?:string;
};
export type AiDraftResult={draft:GeneratedDraft;model:string;provider:'ollama-local'|'openrouter'};
export function validateAiDraft(input:unknown):GeneratedDraft{
 const x=input as GeneratedDraft;
 if(!x||typeof x.title!=='string'||!x.title.trim()||x.title.length>160||
  typeof x.caption!=='string'||!x.caption.trim()||x.caption.length>4500||
  !Array.isArray(x.slides)||x.slides.length<5||x.slides.length>7||
  x.slides.some(s=>!s||typeof s.eyebrow!=='string'||!s.eyebrow.trim()||s.eyebrow.length>70||
   typeof s.title!=='string'||!s.title.trim()||s.title.length>160||
   typeof s.body!=='string'||!s.body.trim()||s.body.length>190)||
  !x.platformNotes||['instagram','vk','youtube'].some(k=>typeof x.platformNotes[k as keyof GeneratedDraft['platformNotes']]!=='string'))
  throw Error('Модель вернула неполный сценарий');
 const publicCopy=[x.title,x.caption,...x.slides.flatMap(s=>[s.eyebrow,s.title,s.body])].join(' ');
 if(/\bpersona\b|персона/iu.test(publicCopy))throw Error('ИИ добавил служебный бренд в публичный текст');
 return x;
}
type Options={
 idea:{id:string;title:string;angle:string;format:string};
 history:{title:string;status:string}[];
 fetchImpl?:typeof fetch;workerBase?:string;
};
/** Explicit only: never issue model requests on page load. */
export async function generatePersonaDraftWithRealAi({
 idea,history,fetchImpl=fetch,workerBase=personaWorkerUrl
}:Options):Promise<AiDraftResult|null>{
 const previous=history.slice(-12).map(x=>x.title);
 try{
  const health=await fetchImpl(workerBase+'/health',{
   cache:'no-store',signal:AbortSignal.timeout(3500)
  });
  if(health.ok){
   const h=await health.json();
   if(h?.service==='persona-media-worker'&&h?.components?.ollama===true&&
    typeof h.token==='string'&&h.token){
    const response=await fetchImpl(workerBase+'/script-draft',{
     method:'POST',headers:{'Content-Type':'application/json','X-Persona-Worker-Token':h.token},
     body:JSON.stringify({idea,history:previous}),signal:AbortSignal.timeout(100000)
    });
    if(response.ok){
     const data=await response.json();
     if(data.mode==='ai'&&data.provider==='ollama-local'&&typeof data.model==='string')
      return {draft:validateAiDraft(data.draft),model:data.model,provider:'ollama-local'};
    }
   }
  }
 }catch{/* Worker unavailable on this device/origin. Try explicitly configured server provider. */}
 try{
  const response=await fetchImpl('/api/persona',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({action:'generate',engine:'openrouter',idea,history:previous}),
   signal:AbortSignal.timeout(80000)
  });
  if(response.ok){
   const data=await response.json();
   if(data.mode==='ai'&&typeof data.model==='string'&&data.model.trim())
    return {draft:validateAiDraft(data.draft),model:data.model,provider:'openrouter'};
  }
 }catch{/* No server opt-in/key/model; never pretend a template is AI. */}
 return null;
}
