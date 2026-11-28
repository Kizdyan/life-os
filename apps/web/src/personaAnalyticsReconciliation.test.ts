import {describe,it,expect} from 'vitest';
import {reconcileAnalytics,comparableRates,measurementDue,decodeMetricoolPosts,type Identity,type Sample,type Metrics} from './personaAnalyticsReconciliation';
const url='https://www.tiktok.com/@example/photo/222',old='https://www.tiktok.com/@example/video/111';
const id:Identity={contentId:'post-1',network:'tiktok',approvedVersion:'v1',state:'PUBLIC_CONFIRMED',canonicalUrl:url,supersededUrls:[old],publishedAt:'2026-11-26T12:00:00Z'};
const metrics:Metrics={views:800,reach:null,likes:25,comments:2,shares:4,saves:null,follows:null};
const sample:Sample={network:'tiktok',url,source:'public',observedAt:'2026-11-27T12:00:00Z',metrics};
describe('analytics identity and missing data',()=>{
 it('rejects partial, null and array metrics from damaged imports without throwing',()=>{
  for(const broken of [{views:1},null,[1,2,3]]){
   expect(reconcileAnalytics(id,[{...sample,metrics:broken} as unknown as Sample]).state).toBe('INVALID_SAMPLE');
  }
 });
 it('never associates deleted auto-post metrics with manual replacement',()=>expect(reconcileAnalytics(id,[{...sample,url:old}]).state).toBe('DATA_UNAVAILABLE'));
 it('waits for independent public identity',()=>expect(reconcileAnalytics({...id,state:'UNRESOLVED'},[sample]).state).toBe('IDENTITY_UNRESOLVED'));
 it('recognizes matching photo and video aliases by TikTok ID',()=>expect(reconcileAnalytics(id,[{...sample,url:url.replace('/photo/','/video/')+'?x=1'}]).state).toBe('READY'));
 it('does not fabricate zero for unavailable statistics',()=>{const s=reconcileAnalytics(id,[]);expect(s.metrics).toBeNull();expect(comparableRates(s).sharesPerReach).toBeNull()});
 it('computes metrics using actual reach or views, never follower count',()=>{const s=reconcileAnalytics(id,[sample]);expect(s.ageHours).toBe(24);expect(comparableRates(s).sharesPerView).toBe(0.005);expect(comparableRates(s).sharesPerReach).toBeNull()});
 it('rejects negative and prepublication snapshots',()=>{expect(reconcileAnalytics(id,[{...sample,metrics:{...metrics,views:-1}}]).state).toBe('INVALID_SAMPLE');expect(reconcileAnalytics(id,[{...sample,observedAt:'2026-11-25T12:00:00Z'}]).state).toBe('INVALID_SAMPLE')});
 it('requests overdue measurement checkpoints without inventing historical samples',()=>expect(measurementDue(id.publishedAt!,'2026-11-28T13:00:00Z',[24])).toEqual([48]));
});

describe('Metricool wire format',()=>{
 it('decodes Instagram counts and distinguishes zero from null',()=>{
  const r=decodeMetricoolPosts('instagram',{rows:[['https://www.instagram.com/p/example/','207','60','5','1','0','1','0']]},sample.observedAt);
  expect(r.state).toBe('READY');expect(r.samples[0]?.metrics).toEqual({views:207,reach:60,likes:5,comments:1,shares:0,saves:1,follows:0});
 });
 it('does not fabricate TikTok saves or follows from missing API columns',()=>{
  const r=decodeMetricoolPosts('tiktok',{rows:[[url,'800',null,'25','2','4']]},sample.observedAt);
  expect(r.samples[0]?.metrics.saves).toBeNull();expect(reconcileAnalytics(id,r.samples).state).toBe('READY');
 });
 it('empty rows are unavailable and malformed rows fail closed',()=>{
  expect(decodeMetricoolPosts('tiktok',{rows:[]},sample.observedAt).state).toBe('DATA_UNAVAILABLE');
  expect(decodeMetricoolPosts('tiktok',{rows:[[url,'NaN',null,'25','2','4']]},sample.observedAt).state).toBe('INVALID_RESPONSE');
 });
});
