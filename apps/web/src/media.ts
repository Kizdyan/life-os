export type MediaUiState='not_configured'|'ready'|'error';

export interface MediaUiStatus{
  state:MediaUiState;
  connected:boolean;
  provider:'yandex';
  summary:string;
  attention:string[];
  error:string|null;
}

export function mediaApiBase(value:string|undefined|null):string{
  const trimmed=(value??'').trim();
  if(!trimmed)return'';
  return trimmed.replace(/\/+$/,'');
}

export async function readMediaStatus(input:{
  baseUrl?:string|null;
  fetchImpl?:typeof fetch;
}={}):Promise<MediaUiStatus>{
  const base=mediaApiBase(input.baseUrl??import.meta.env.VITE_MEDIA_API_URL);
  if(!base){
    return{
      state:'not_configured',
      connected:false,
      provider:'yandex',
      summary:'Медиаконтур готов. Яндекс Диск ещё не подключён к серверной части.',
      attention:[],
      error:null,
    };
  }

  const fetchImpl=input.fetchImpl??fetch;
  try{
    const response=await fetchImpl(`${base}/media/status`,{
      method:'GET',
      headers:{Accept:'application/json'},
      credentials:'include',
    });
    if(!response.ok)throw new Error(`Media status failed: ${response.status}`);
    const payload=await response.json() as{
      connected?:unknown;
      provider?:unknown;
      digest?:{summary?:unknown;attention?:unknown};
    };
    if(payload.provider!==undefined&&payload.provider!=='yandex'){
      throw new Error('Unexpected media provider');
    }
    const connected=payload.connected===true;
    const summary=typeof payload.digest?.summary==='string'
      ?payload.digest.summary
      :connected
        ?'Media Brain подключён и готов обрабатывать материалы.'
        :'Яндекс Диск ещё не подключён.';
    const attention=Array.isArray(payload.digest?.attention)
      ?payload.digest!.attention.filter((item):item is string=>typeof item==='string').slice(0,3)
      :[];
    return{state:'ready',connected,provider:'yandex',summary,attention,error:null};
  }catch(error){
    return{
      state:'error',
      connected:false,
      provider:'yandex',
      summary:'Не удалось проверить Media Brain.',
      attention:[],
      error:error instanceof Error?error.message:'Unknown Media Brain status error',
    };
  }
}

export async function beginYandexConnect(input:{
  baseUrl?:string|null;
  fetchImpl?:typeof fetch;
}={}):Promise<string>{
  const base=mediaApiBase(input.baseUrl??import.meta.env.VITE_MEDIA_API_URL);
  if(!base)throw new Error('Media Brain server is not configured');
  const fetchImpl=input.fetchImpl??fetch;
  const response=await fetchImpl(`${base}/media/yandex/connect/start`,{
    method:'POST',
    headers:{Accept:'application/json','Content-Type':'application/json'},
    credentials:'include',
    body:'{}',
  });
  if(!response.ok)throw new Error(`Yandex connect failed: ${response.status}`);
  const payload=await response.json() as{authorizationUrl?:unknown};
  if(typeof payload.authorizationUrl!=='string')throw new Error('Yandex OAuth URL is missing');
  const url=new URL(payload.authorizationUrl);
  if(url.protocol!=='https:'||url.hostname!=='oauth.yandex.ru'){
    throw new Error('Yandex OAuth URL is invalid');
  }
  return url.toString();
}
