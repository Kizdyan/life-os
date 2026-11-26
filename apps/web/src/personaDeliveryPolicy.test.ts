import {describe,it,expect} from 'vitest';
import {assessDelivery,photoDeliveryManifest} from './personaDeliveryPolicy';
describe('platform delivery evidence',()=>{
 it('does not treat manual notification status as a real post',()=>{
  const x=assessDelivery('instagram',{mode:'manual',status:'PUBLISHED'});
  expect(x.published).toBe(false);expect(x.status).toBe('MANUAL_UNVERIFIED');expect(x.retryAllowed).toBe(false);
 });
 it('requires matching platform URL and reports music independently',()=>{
  const x=assessDelivery('tiktok',{mode:'automatic',status:'PUBLISHED',publicUrl:'https://www.tiktok.com/@example/photo/123'});
  expect(x.published).toBe(true);expect(x.musicGatePassed).toBe(false);expect(x.retryAllowed).toBe(false);
  expect(assessDelivery('tiktok',{mode:'automatic',status:'PUBLISHED',publicUrl:'https://www.instagram.com/p/example/'}).published).toBe(false);
  expect(assessDelivery('tiktok',{mode:'automatic',status:'PUBLISHED',publicUrl:'https://www.tiktok.com/@example/photo/123',music:{kind:'native-confirmed',title:'Example',artist:'Artist'}}).musicGatePassed).toBe(true);
 });
 it('allows retry of failed automatic destination only without a claimed receipt',()=>{
  expect(assessDelivery('tiktok',{mode:'automatic',status:'ERROR'}).retryAllowed).toBe(true);
  expect(assessDelivery('instagram',{mode:'automatic',status:'PUBLISHED',publicUrl:'https://www.instagram.com/p/example/'}).retryAllowed).toBe(false);
 });
 it('exports a JPEG package contract but never claims selected music or sends it',()=>{
  const x=photoDeliveryManifest('tiktok');
  expect(x.format).toBe('image/jpeg');expect(x.music.required).toBe(true);expect(x.music.state).toBe('AWAITING_NATIVE_SELECTION');expect(x.publication.authorized).toBe(false);
 });
});

it('a provider permalink is not independent confirmation of public visibility',()=>{
 const publicUrl='https://www.tiktok.com/@example/photo/123';
 const base={mode:'automatic' as const,status:'PUBLISHED',publicUrl};
 expect(assessDelivery('tiktok',base).status).toBe('PROVIDER_RECEIPT_ONLY');
 const visibility={state:'NOT_VISIBLE' as const,url:publicUrl,observedAt:'2026-11-27T12:00:00Z',source:'independent-viewer' as const};
 const hidden=assessDelivery('tiktok',{...base,visibility});expect(hidden.status).toBe('RECONCILIATION_REQUIRED');expect(hidden.retryAllowed).toBe(false);
 expect(assessDelivery('tiktok',{...base,visibility:{...visibility,state:'PUBLIC'}}).publiclyVisible).toBe(true);
 expect(assessDelivery('tiktok',{...base,visibility:{...visibility,state:'PUBLIC',url:'https://www.tiktok.com/@example/photo/456'}}).publiclyVisible).toBe(false);
});
