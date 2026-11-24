import {pathToFileURL} from 'node:url';

/** Only existing local Worker routes, never an external API or a POST. */
export async function inspectCarouselProviders({fetchImpl=fetch}={}){
 for(const base of ['http://127.0.0.1:3000/persona-worker','http://127.0.0.1:47832']){
  try{
   const response=await fetchImpl(base+'/health',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(3000)});
   if(!response.ok)continue;
   const health=await response.json();
   if(health?.service!=='persona-media-worker'||typeof health.token!=='string'||!health.token)continue;
   const research=health.carouselResearch?.configured===true;
   let images={configured:false,model:null,status:'STATUS_UNAVAILABLE'};
   try{
    const result=await fetchImpl(base+'/carousel-background/status',{cache:'no-store',redirect:'error',
     headers:{'X-Persona-Worker-Token':health.token},signal:AbortSignal.timeout(3000)});
    if(result.ok){
     const data=await result.json();
     images={configured:data?.configured===true,model:typeof data?.model==='string'&&/^[a-zA-Z0-9._-]{1,100}$/.test(data.model)?data.model:null,
      status:['NEEDS_CONSENT','BLOCKED'].includes(data?.status)?data.status:'STATUS_UNAVAILABLE'};
    }
   }catch{/* no secrets or raw response in report */}
   return {worker:'CONNECTED',launcher:base.includes(':3000/')?'unified':'split',research:research?'KEY_CONFIGURED':'KEY_MISSING',
    images,liveProviderVerified:false,paidRequests:0};
  }catch{/* try other existing local launcher */}
 }
 return {worker:'UNAVAILABLE',research:'UNKNOWN',images:{configured:false,model:null,status:'UNKNOWN'},
  liveProviderVerified:false,paidRequests:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=await inspectCarouselProviders();
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
 if(report.worker!=='CONNECTED'||report.research!=='KEY_CONFIGURED'||!report.images.configured||report.images.status!=='NEEDS_CONSENT')process.exitCode=1;
}
