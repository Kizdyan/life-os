import { describe, expect, it } from 'vitest';
import { InstagramPhotoPublisher, InstagramPublicationUncertain } from './instagram-photo-publisher';
import { publishPersonaJob } from './persona-publication';
import type { PersonaPlatformVariant, PersonaPublicationJob } from './persona-state';

const job:PersonaPublicationJob={
 id:'persona-pub:post1:instagram:r1',candidateId:'post1',platform:'instagram',
 state:'approved',idempotencyKey:'post1:instagram:1',scheduledAt:null,
 externalId:null,externalUrl:null,attempts:0,lastError:null,createdAt:'2026-10-13T00:00:00Z',
 updatedAt:'2026-10-13T00:00:00Z',
};
const variant:PersonaPlatformVariant={
 id:'variant1',candidateId:'post1',revision:1,platform:'instagram',
 mediaAssetId:'asset:1',title:'Процесс',caption:'Театр и музыка — настоящая работа',
 coverAssetId:null,createdAt:'2026-10-13T00:00:00Z',
};
const json=(value:unknown)=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
function make(links:string[],fetchImpl:typeof fetch){
 return new InstagramPhotoPublisher({
   accountId:'17841400001234567',
   accessToken:'PRIVATE_SERVER_TOKEN',
   resolvePublicJpegUrls:async()=>links,
   fetchImpl,
 });
}
describe('Instagram P0 publisher — existing PersonaPublicationJob contract',()=>{
 it('rejects an absent server token or an unverified account identifier',()=>{
   expect(()=>new InstagramPhotoPublisher({accountId:'bad',accessToken:'token',resolvePublicJpegUrls:async()=>[]})).toThrow();
   expect(()=>new InstagramPhotoPublisher({accountId:'17841400001234567',accessToken:'',resolvePublicJpegUrls:async()=>[]})).toThrow();
 });
 it('publishes one JPEG via container then requires platform verification',async()=>{
   const seen:string[]=[];
   const fetchImpl:typeof fetch=async(input,init)=>{
     const url=String(input);seen.push(url);
     expect(url).not.toContain('PRIVATE_SERVER_TOKEN');
     expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer PRIVATE_SERVER_TOKEN');
     if(url.includes('media_publish'))return json({id:'44444'});
     if(url.includes('/11111?'))return json({id:'11111',status_code:'FINISHED'});
     if(url.includes('/44444?'))return json({id:'44444',permalink:'https://www.instagram.com/p/POST123/'});
     if(url.endsWith('/media'))return json({id:'11111'});
     throw Error('Unexpected graph call '+url);
   };
   const publisher=make(['https://cdn.example.com/post.jpg'],fetchImpl);
   const result=await publishPersonaJob(job,variant,publisher,'2026-10-13T18:00:00Z');
   expect(result.state).toBe('published');
   expect(result.externalId).toBe('44444');
   expect(result.externalUrl).toBeNull();
   const verified=await publishPersonaJob(result,variant,publisher,'2026-10-13T18:01:00Z');
   expect(verified.state).toBe('verified');
   expect(verified.externalUrl).toBe('https://www.instagram.com/p/POST123/');
   expect(seen).toHaveLength(4);
 });
 it('builds a carousel with two image child containers and one parent',async()=>{
   let created=0;
   const fetchImpl:typeof fetch=async(input,init)=>{
     const url=String(input);
     if(init?.method==='POST'&&url.endsWith('/media')){
       const body=new URLSearchParams(String(init.body));
       created++;
       if(created<=2)expect(body.get('is_carousel_item')).toBe('true');
       else {
         expect(body.get('media_type')).toBe('CAROUSEL');
         expect(body.get('children')).toBe('110,111');
       }
       return json({id:created===1?'110':created===2?'111':'112'});
     }
     if(url.includes('/112?'))return json({status_code:'FINISHED'});
     if(url.endsWith('/media_publish'))return json({id:'555'});
     throw Error('Unexpected graph call');
   };
   const publisher=make(['https://cdn.example.com/1.jpg','https://cdn.example.com/2.jpeg'],fetchImpl);
   const result=await publisher.publish(job,variant);
   expect(result.externalId).toBe('555');expect(created).toBe(3);
 });
 it('fails closed for local files, HTTP media, private URLs and non-JPEG',async()=>{
   const fetchImpl:typeof fetch=async()=>{throw Error('Network must not be called for invalid asset');};
   for(const url of ['file:///tmp/face.jpg','http://cdn.example.com/p.jpg','https://localhost/p.jpg',
     'https://127.0.0.1/photo.jpg','https://cdn.example.com/a.png']){
     await expect(make([url],fetchImpl).publish(job,variant)).rejects.toThrow();
   }
 });
 it('refuses to publish without an approved job or with an existing Instagram media ID',async()=>{
   const fetchImpl:typeof fetch=async()=>{throw Error('Network must not run');};
   const p=make(['https://cdn.example.com/a.jpg'],fetchImpl);
   await expect(p.publish({...job,state:'retry_wait'},variant)).rejects.toThrow();
   await expect(p.publish({...job,externalId:'44444'},variant)).rejects.toThrow();
 });
 it('an ambiguous media_publish response BLOCKS automatic re-publication',async()=>{
   const fetchImpl:typeof fetch=async(input)=>{
     const url=String(input);
     if(url.endsWith('/media'))return json({id:'111'});
     if(url.includes('/111?'))return json({status_code:'FINISHED'});
     if(url.endsWith('/media_publish'))throw Error('Network dropped after submit');
     throw Error('Unexpected request');
   };
   const p=make(['https://cdn.example.com/post.jpg'],fetchImpl);
   await expect(p.publish(job,variant)).rejects.toBeInstanceOf(InstagramPublicationUncertain);
   const uncertain=await publishPersonaJob(job,variant,p,'2026-10-13T18:00:00Z');
   expect(uncertain.state).toBe('blocked');
   const next=await publishPersonaJob(uncertain,variant,p,'2026-10-13T18:02:00Z');
   expect(next.attempts).toBe(1);
   expect(next.state).toBe('blocked');
 });
});
