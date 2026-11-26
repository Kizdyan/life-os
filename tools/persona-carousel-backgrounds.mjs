// Server-only provider. Library fallback never requires credentials or network.
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
const config=JSON.parse(await readFile(new URL('../config/carousel-backgrounds.json',import.meta.url),'utf8'));
// Explicitly reviewed Images API models; unknown/retired values never reach the paid endpoint.
const imageModels=new Set(['gpt-image-1-mini','gpt-image-1.5','gpt-image-2','gpt-image-2-2026-04-21',
 'gpt-image-2.5-sunburst','gpt-image-2.5-sunburst-2026-09-08','gpt-image-2.5-flare','gpt-image-2.5-flare-2026-09-08',
 'gpt-image-2.6-sunburst','gpt-image-2.6-flare','chatgpt-image-latest']);
function pngCrc(bytes){
 let crc=0xffffffff;
 for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}
 return (crc^0xffffffff)>>>0;
}
/** Check framing, CRCs and bounded scanlines. Browser decode remains authoritative before storage. */
function validProviderPng(base64){
 if(typeof base64!=='string'||base64.length%4||!/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(base64))return false;
 const png=Buffer.from(base64,'base64');
 if(png.length<1024||png.toString('base64')!==base64)return false;
 let offset=8,header=null,ended=false,palette=false;const compressed=[];
 while(offset+12<=png.length){
  const length=png.readUInt32BE(offset),end=offset+12+length;
  if(end>png.length)return false;
  const type=png.toString('ascii',offset+4,offset+8),data=png.subarray(offset+8,end-4);
  if(pngCrc(png.subarray(offset+4,end-4))!==png.readUInt32BE(end-4))return false;
  if(!header&&type!=='IHDR')return false;
  if(type==='IHDR'){
   if(header||length!==13||data.readUInt32BE(0)!==1024||data.readUInt32BE(4)!==1536||data[10]||data[11]||data[12]>1)return false;
   header=data;
  }else if(type==='PLTE'){
   if(!length||length>768||length%3||compressed.length)return false;palette=true;
  }else if(type==='IDAT')compressed.push(data);
  else if(type==='IEND'){if(length||end!==png.length)return false;ended=true;break}
  else if(!/^[a-z]/.test(type))return false; // Unknown critical chunks cannot be decoded safely.
  offset=end;
 }
 if(!header||!ended||!compressed.length)return false;
 const depth=header[8],color=header[9],channels={0:1,2:3,3:1,4:2,6:4}[color];
 if(!channels||!(color===0?[1,2,4,8,16]:color===3?[1,2,4,8]:[8,16]).includes(depth)||color===3&&!palette)return false;
 const raw=inflateSync(Buffer.concat(compressed),{maxOutputLength:13*1024*1024});
 const passes=header[12]?[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]]:[[0,0,1,1]];
 let cursor=0;
 for(const [x,y,dx,dy] of passes){
  const width=Math.ceil((1024-x)/dx),height=Math.ceil((1536-y)/dy),row=Math.ceil(width*channels*depth/8)+1;
  for(let i=0;i<height;i++){if(cursor>=raw.length||raw[cursor]>4)return false;cursor+=row}
 }
 return cursor===raw.length;
}
export function carouselBackgroundPrompt({theme,index,visualDirection}){
 if(typeof theme!=='string'||!theme.trim()||theme.length>400||!Number.isInteger(index)||index<0||index>11)
  throw Error('Invalid carousel background request');
 if(visualDirection!==undefined&&(typeof visualDirection!=='string'||!visualDirection.trim()||visualDirection.length>350))throw Error('Invalid slide visual direction');
 const libraryId=config.sequence[index%config.sequence.length];
 return {libraryId,prompt:config.basePrompt+' Theme (context only, never render these words): '+theme.trim()+'. Scene: '+(visualDirection?.trim()||config.library[libraryId].scene)+'.'};
}
export function carouselBackgroundStatus(env=process.env){
 const selected=env.PERSONA_CAROUSEL_IMAGE_MODEL??config.model,model=imageModels.has(selected)?selected:null;
 const configured=typeof env.OPENAI_API_KEY==='string'&&Boolean(env.OPENAI_API_KEY.trim());
 return {provider:'openai',model,configured,paidConsentRequired:true,
  status:model&&configured?'NEEDS_CONSENT':'BLOCKED',
  code:!model?'IMAGE_MODEL_UNSUPPORTED':configured?'PAID_CONSENT_REQUIRED':'IMAGE_PROVIDER_NOT_CONFIGURED'};
}
export async function generateCarouselBackground(request,{env=process.env,fetchImpl=fetch}={}){
 const local={source:'library',...carouselBackgroundPrompt(request)};
 const status=carouselBackgroundStatus(env);
 if(!status.model)return {...local,status:'BLOCKED',code:status.code,warning:'BLOCKED: модель генерации не поддерживается. Проверьте PERSONA_CAROUSEL_IMAGE_MODEL. Генерация не выполнена.'};
 if(!status.configured)return {...local,status:'BLOCKED',code:'IMAGE_PROVIDER_NOT_CONFIGURED',warning:'BLOCKED: ключ OpenAI не настроен. Доступны локальная библиотека и собственный архив; генерация не выполнена.'};
 if(request.paidConsent!==true)return {...local,status:'BLOCKED',code:'PAID_CONSENT_REQUIRED',warning:'BLOCKED: необходимо отдельное разрешение на один платный запрос. Генерация не выполнена.'};
 try{
  const response=await fetchImpl('https://api.openai.com/v1/images/generations',{
   method:'POST',headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},
   signal:AbortSignal.timeout(120000),body:JSON.stringify({model:status.model,prompt:local.prompt,n:1,size:'1024x1536',quality:'medium',output_format:'png'})
  });
  if(!response.ok)throw Error('provider_http_'+response.status);
  // Bounded even when an upstream proxy omits Content-Length.
  const reader=response.body.getReader();let size=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
   if(size>20*1024*1024)throw Error('provider_response_too_large');chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}
  const data=JSON.parse(Buffer.concat(chunks).toString('utf8')),pngBase64=data?.data?.[0]?.b64_json;
  if(!validProviderPng(pngBase64))
   throw Error('provider_image_invalid');
  return {status:'READY',source:'openai',...carouselBackgroundPrompt(request),pngBase64,model:status.model,createdAt:new Date().toISOString()};
 }catch{
  // Do not forward response bodies, URLs with secrets, or provider exception text.
  return {...local,status:'BLOCKED',code:'IMAGE_PROVIDER_FAILED',warning:'BLOCKED: генерация OpenAI недоступна или вернула неверное изображение. Доступны локальная библиотека и собственный архив; генерация не выполнена.'};
 }
}
