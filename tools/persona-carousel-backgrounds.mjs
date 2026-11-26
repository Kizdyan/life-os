// Server-only provider. Library fallback never requires credentials or network.
import {readFile} from 'node:fs/promises';
const config=JSON.parse(await readFile(new URL('../config/carousel-backgrounds.json',import.meta.url),'utf8'));
export function carouselBackgroundPrompt({theme,index,visualDirection}){
 if(typeof theme!=='string'||!theme.trim()||theme.length>400||!Number.isInteger(index)||index<0||index>11)
  throw Error('Invalid carousel background request');
 if(visualDirection!==undefined&&(typeof visualDirection!=='string'||!visualDirection.trim()||visualDirection.length>350))throw Error('Invalid slide visual direction');
 const libraryId=config.sequence[index%config.sequence.length];
 return {libraryId,prompt:config.basePrompt+' Theme (context only, never render these words): '+theme.trim()+'. Scene: '+(visualDirection?.trim()||config.library[libraryId].scene)+'.'};
}
export function carouselBackgroundStatus(env=process.env){return {provider:'openai',model:config.model,configured:Boolean(env.OPENAI_API_KEY),paidConsentRequired:true,status:env.OPENAI_API_KEY?'NEEDS_CONSENT':'BLOCKED',code:env.OPENAI_API_KEY?'PAID_CONSENT_REQUIRED':'IMAGE_PROVIDER_NOT_CONFIGURED'}};
export async function generateCarouselBackground(request,{env=process.env,fetchImpl=fetch}={}){
 const local={source:'library',...carouselBackgroundPrompt(request)};
 if(!env.OPENAI_API_KEY)return {...local,status:'BLOCKED',code:'IMAGE_PROVIDER_NOT_CONFIGURED',warning:'BLOCKED: ключ OpenAI не настроен. Доступны локальная библиотека и собственный архив; генерация не выполнена.'};
 if(request.paidConsent!==true)return {...local,status:'BLOCKED',code:'PAID_CONSENT_REQUIRED',warning:'BLOCKED: необходимо отдельное разрешение на один платный запрос. Генерация не выполнена.'};
 try{
  const response=await fetchImpl('https://api.openai.com/v1/images/generations',{
   method:'POST',headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},
   signal:AbortSignal.timeout(120000),body:JSON.stringify({model:config.model,prompt:local.prompt,n:1,size:'1024x1536',quality:'medium',output_format:'png'})
  });
  if(!response.ok)throw Error('provider_http_'+response.status);
  // Bounded even when an upstream proxy omits Content-Length.
  const reader=response.body.getReader();let size=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
   if(size>20*1024*1024)throw Error('provider_response_too_large');chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}
  const data=JSON.parse(Buffer.concat(chunks).toString('utf8')),pngBase64=data?.data?.[0]?.b64_json;
  if(typeof pngBase64!=='string'||!/^iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(pngBase64)||Buffer.from(pngBase64,'base64').length<1024)
   throw Error('provider_image_invalid');
  return {status:'READY',source:'openai',...carouselBackgroundPrompt(request),pngBase64,model:config.model,createdAt:new Date().toISOString()};
 }catch{
  // Do not forward response bodies, URLs with secrets, or provider exception text.
  return {...local,status:'BLOCKED',code:'IMAGE_PROVIDER_FAILED',warning:'BLOCKED: генерация OpenAI недоступна или вернула неверное изображение. Доступны локальная библиотека и собственный архив; генерация не выполнена.'};
 }
}
