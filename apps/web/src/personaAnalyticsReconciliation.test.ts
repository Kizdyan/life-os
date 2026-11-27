import {describe,it,expect} from 'vitest';
import {reconcileAnalytics,comparableRates,measurementDue,type Identity,type Sample,type Metrics} from './personaAnalyticsReconciliation';
const url='https://www.tiktok.com/@example/photo/222',old='https://www.tiktok.com/@example/video/111';
const id:Identity={contentId:'post-1',network:'tiktok',approvedVersion:'v1',state:'PUBLIC_CONFIRMED',canonicalUrl:url,supersededUrls:[old],publishedAt:'2026-11-26T12:00:00Z'};
const metrics:Metrics={views:800,reach:null,likes:25,comments:2,shares:4,saves:null,follows:null};
const sample:Sample={network:'tiktok',url,source:'public',observedAt:'2026-11-27T12:00:00Z',metrics};
describe('analytics identity and missing data',()=>{
 it('never associates deleted auto-post metrics with manual replacement',()=>expect(reconcileAnalytics(id,[{...sample,url:old}]).state).toBe('DATA_UNAVAILABLE'));
 it('waits for independent public identity',()=>expect(reconcileAnalytics({...id,state:'UNRESOLVED'},[sample]).state).toBe('IDENTITY_UNRESOLVED'));
 it('recognizes matching photo and video aliases by TikTok ID',()=>expect(reconcileAnalytics(id,[{...sample,url:url.replace('/photo/','/video/')+'?x=1'}]).state).toBe('READY'));
 it('does not fabricate zero for unavailable statistics',()=>{const s=reconcileAnalytics(id,[]);expect(s.metrics).toBeNull();expect(comparableRates(s).sharesPerReach).toBeNull()});
 it('computes metrics using actual reach or views, never follower count',()=>{const s=reconcileAnalytics(id,[sample]);expect(s.ageHours).toBe(24);expect(comparableRates(s).sharesPerView).toBe(0.005);expect(comparableRates(s).sharesPerReach).toBeNull()});
 it('rejects negative and prepublication snapshots',()=>{expect(reconcileAnalytics(id,[{...sample,metrics:{...metrics,views:-1}}]).state).toBe('INVALID_SAMPLE');expect(reconcileAnalytics(id,[{...sample,observedAt:'2026-11-25T12:00:00Z'}]).state).toBe('INVALID_SAMPLE')});
 it('requests overdue measurement checkpoints without inventing historical samples',()=>expect(measurementDue(id.publishedAt!,'2026-11-28T13:00:00Z',[24])).toEqual([48]));
});
