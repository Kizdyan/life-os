import {describe,it,expect} from 'vitest';
import {buildAboutMeDraft,validateAboutMePackage,type AboutMePackage} from './personaAboutMe';
const asset=(hash:string,category:AboutMePackage['assets'][number]['category'],score=8)=>({sha256:hash.repeat(64),category,score,name:hash+'.jpg'});
const pkg:AboutMePackage={version:1,id:'12345678-1234-1234-1234-123456789abc',status:'AUTHOR_REVIEW_REQUIRED',checkpointSha256:'f'.repeat(64),scoresReused:261,modelCalls:0,publicationApproved:false,missingCategories:[],assets:[asset('a','portrait'),asset('b','screen'),asset('c','stage'),asset('d','music'),asset('e','editorial')]};
describe('About Me archive draft',()=>{
 it('uses original hash-based references and leaves every approval false',()=>{
  const post=buildAboutMeDraft('about-me-test',pkg,pkg.assets.map(a=>a.sha256));
  expect(post.slides).toHaveLength(5);
  expect(post.slides[3].text).toBe('Музыка');
  expect(post.slides[3].photoRef).toBe('about-me-archive/'+'d'.repeat(64));
  expect(post.approvals).toEqual({topic:false,content:false,design:false});
 });
 it('does not invent missing music photos or accept duplicate IDs',()=>{
  const post=buildAboutMeDraft('about-me-test',pkg,pkg.assets.filter(a=>a.category!=='music').map(a=>a.sha256));
  expect(post.slides.some(s=>s.text==='Музыка')).toBe(false);
  expect(()=>buildAboutMeDraft('about-me-test',pkg,['a'.repeat(64)])).toThrow();
  expect(()=>validateAboutMePackage({...pkg,assets:[...pkg.assets,pkg.assets[0]]})).toThrow();
 });
});
