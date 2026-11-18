import {describe,expect,it} from 'vitest';
import {createSeedEditorialCarousel,EDITORIAL_KEY,STORY_KEY} from './personaEditorialModel';
import {
 exportPersonaCompleteBackup,importPersonaCompleteBackup,inspectPersonaCompleteBackup,
 type PersonaMediaBackupPort,type PersonaBackupImage
} from './persona-complete-backup';
import {exportDeviceData} from './data-portability';

class Memory {
 values=new Map<string,string>();
 getItem(k:string){return this.values.get(k)??null}
 setItem(k:string,v:string){this.values.set(k,v)}
 removeItem(k:string){this.values.delete(k)}
}
function imageBytes():Uint8Array{
 const x=new Uint8Array(2200);
 x.set([137,80,78,71,13,10,26,10],0);
 for(let i=8;i<x.length;i++)x[i]=(i*73)%251;
 return x;
}
function photo(key='PHOTO-001/slide-2'):PersonaBackupImage{
 const bytes=imageBytes();
 return {key,name:'portrait.png',mime:'image/png',bytes:bytes.length,
  blob:new Blob([bytes.buffer],{type:'image/png'})};
}
class Media implements PersonaMediaBackupPort{
 images=new Map<string,PersonaBackupImage>();
 writes=0;
 async list(){return [...this.images.values()]}
 async read(postId:string,slideId:string){return this.images.get(postId+'/'+slideId)??null}
 async save(postId:string,slideId:string,file:File){
  const key=postId+'/'+slideId;
  if(this.images.has(key))throw Error('Image was overwritten');
  this.writes++;
  this.images.set(key,{key,name:file.name,mime:file.type,bytes:file.size,blob:file});
 }
 async remove(postId:string,slideId:string){this.images.delete(postId+'/'+slideId)}
}

const story={id:'story-1',date:'2026-11-18',text:'Первый реальный кадр',
 state:'captured',createdAt:'2026-11-18T12:00:00.000Z'};
function populated(){
 const storage=new Memory(),media=new Media();
 const seed=createSeedEditorialCarousel('PHOTO-001');
 storage.setItem(EDITORIAL_KEY,JSON.stringify({version:1,posts:[seed]}));
 storage.setItem(STORY_KEY,JSON.stringify([story]));
 media.images.set('PHOTO-001/slide-2',photo());
 return {storage,media,seed};
}
describe('P0 complete Persona backups',()=>{
 it('exports original photo bytes plus carousel slides, long caption, Stories and valid V1 task archive',async()=>{
  const {storage,media,seed}=populated();
  const content=await exportPersonaCompleteBackup(storage,media);
  const v=JSON.parse(content);
  expect(v.kind).toBe('life-os-persona-complete-backup');
  expect(v.version).toBe(2);
  expect(v.base.kind).toBe('life-os-device-backup');
  expect(v.editorialPosts[0].slides.map((s:{text:string})=>s.text))
   .toEqual(seed.slides.map(s=>s.text));
  expect(v.editorialPosts[0].caption).toBe(seed.caption);
  expect(v.images[0].bytes).toBe(2200);
  expect(v.images[0].base64).toMatch(/^[A-Za-z0-9+/=]+$/);
  expect(v.images[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(v.stories).toEqual([story]);
  expect(inspectPersonaCompleteBackup(content))
   .toEqual({tasks:0,ideas:0,projects:0,editorialPosts:1,stories:1,images:1});
  expect(content).not.toContain('SECRET_DO_NOT_COPY');
 });
 it('restores exact photo bytes, project draft and Stories into a fresh browser store without duplicates',async()=>{
  const {storage,media,seed}=populated(),target=new Memory(),targetMedia=new Media();
  const raw=await exportPersonaCompleteBackup(storage,media);
  expect(await importPersonaCompleteBackup(target,raw,targetMedia))
   .toEqual({tasks:0,ideas:0,projects:0,editorialPosts:1,stories:1,images:1});
  expect(JSON.parse(target.getItem(EDITORIAL_KEY)!).posts[0]).toEqual(seed);
  expect(JSON.parse(target.getItem(STORY_KEY)!)).toEqual([story]);
  const restored=await targetMedia.read('PHOTO-001','slide-2');
  expect(restored?.mime).toBe('image/png');
  expect(new Uint8Array(await restored!.blob.arrayBuffer())).toEqual(imageBytes());
  expect(await importPersonaCompleteBackup(target,raw,targetMedia))
   .toEqual({tasks:0,ideas:0,projects:0,editorialPosts:0,stories:0,images:0});
  expect(targetMedia.writes).toBe(1);
 });
 it('never overwrites an existing same-ID editorial post, photo or Story',async()=>{
  const {storage,media}=populated(),target=new Memory(),targetMedia=new Media();
  const original=createSeedEditorialCarousel('PHOTO-001');
  target.setItem(EDITORIAL_KEY,JSON.stringify({version:1,
   posts:[{...original,caption:'Мой локально исправленный текст',revision:7}]}));
  target.setItem(STORY_KEY,JSON.stringify([{...story,text:'Моя локальная история'}]));
  targetMedia.images.set('PHOTO-001/slide-2',photo());
  const restored=await importPersonaCompleteBackup(target,
   await exportPersonaCompleteBackup(storage,media),targetMedia);
  expect(restored.editorialPosts).toBe(0);
  expect(restored.stories).toBe(0);
  expect(restored.images).toBe(0);
  expect(JSON.parse(target.getItem(EDITORIAL_KEY)!).posts[0].caption).toBe('Мой локально исправленный текст');
  expect(JSON.parse(target.getItem(STORY_KEY)!)[0].text).toBe('Моя локальная история');
  expect(targetMedia.writes).toBe(0);
 });
 it('rejects corrupted image hashes BEFORE writing any project or image',async()=>{
  const {storage,media}=populated(),target=new Memory(),targetMedia=new Media();
  const raw=JSON.parse(await exportPersonaCompleteBackup(storage,media));
  raw.images[0].sha256='0'.repeat(64);
  await expect(importPersonaCompleteBackup(target,JSON.stringify(raw),targetMedia))
   .rejects.toThrow('SHA-256');
  expect(target.getItem(EDITORIAL_KEY)).toBeNull();
  expect(targetMedia.images.size).toBe(0);
  expect(target.getItem('life-os:local-runtime:v1')).toBeNull();
 });
 it('rolls back any newly restored photos on storage quota failures',async()=>{
  const {storage,media}=populated();
  const raw=await exportPersonaCompleteBackup(storage,media),targetMedia=new Media();
  const target=new Memory();
  target.setItem=(k,v)=>{
   if(k===EDITORIAL_KEY)throw Error('quota reached');
   target.values.set(k,v);
  };
  await expect(importPersonaCompleteBackup(target,raw,targetMedia)).rejects.toThrow(/quota/);
  expect(targetMedia.images.size).toBe(0);
  expect(target.getItem('life-os:local-runtime:v1')).toBeNull();
 });
 it('rejects unknown versions, duplicate image identities and damaged editorial store',async()=>{
  const {storage,media}=populated();
  const raw=await exportPersonaCompleteBackup(storage,media),v=JSON.parse(raw);
  v.version=99;
  expect(()=>inspectPersonaCompleteBackup(JSON.stringify(v))).toThrow();
  v.version=2;v.images.push(v.images[0]);
  expect(()=>inspectPersonaCompleteBackup(JSON.stringify(v))).toThrow(/Повторяющиеся/);
  storage.setItem(EDITORIAL_KEY,'{damaged');
  await expect(exportPersonaCompleteBackup(storage,media)).rejects.toThrow();
 });
 it('imports old V1 task backup safely without claiming to restore editorial images',async()=>{
  const old=exportDeviceData(new Memory()),target=new Memory();
  expect(inspectPersonaCompleteBackup(old)).toEqual({
   tasks:0,ideas:0,projects:0,editorialPosts:0,stories:0,images:0
  });
  expect(await importPersonaCompleteBackup(target,old,new Media())).toEqual({
   tasks:0,ideas:0,projects:0,editorialPosts:0,stories:0,images:0
  });
 });
});
