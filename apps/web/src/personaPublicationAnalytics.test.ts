import {describe,it,expect} from 'vitest';
import {editorialExperiment,validatePublicationAnalytics,mergePublicationAnalytics,publicationLearning,importPublicationAnalytics,bindPublication,PUBLICATION_ANALYTICS_KEY,type MetricSnapshot} from './personaPublicationAnalytics';
const row:MetricSnapshot={version:1,provider:'metricool',platform:'instagram',url:'https://www.instagram.com/p/fixture01/',publishedAt:'2026-01-01T10:00:00+03:00',observedAt:'2026-01-02T10:00:00+03:00',format:'carousel',contentId:null,views:100,reach:50,likes:5,comments:0,saves:0,shares:0,follows:0};
describe('publication observation history',()=>{
 it('keeps identical readings at different times and does not invent causal conclusions',()=>{
  const next={...row,observedAt:'2026-01-03T10:00:00+03:00'};
  const history=mergePublicationAnalytics([row],[next,row]);
  expect(history).toHaveLength(2);
  const r=publicationLearning(history)[0];
  expect(r.engagement).toBe(10);expect(r.viewsPerReach).toBe(2);expect(r.unchanged).toBe(true);
  expect(r.ageHours).toBe(48);expect(r.status).toBe('OBSERVATION_ONLY');
  expect(publicationLearning([{...row,likes:null}])[0].engagement).toBeNull();
 });
 it('rejects conflicts and preserves earlier data on bad input',()=>{
  const m=new Map<string,string>(),storage={getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v)}};
  importPublicationAnalytics(storage,[row]);const before=m.get(PUBLICATION_ANALYTICS_KEY);
  expect(()=>importPublicationAnalytics(storage,[{...row,views:101}])).toThrow();
  expect(()=>importPublicationAnalytics(storage,[{...row,reach:-1}])).toThrow();
  expect(m.get(PUBLICATION_ANALYTICS_KEY)).toBe(before);
  const bound=bindPublication(storage,row.url,'existing-post');
  expect(bound[0].contentId).toBe('existing-post');
  expect(()=>bindPublication(storage,row.url,'other-post')).toThrow();
  expect(()=>validatePublicationAnalytics([{...row,url:'https://example.com/post/'}])).toThrow();
 });
});

it('creates a single cautious experiment only from age-matched same-format observations',()=>{
 const brief=editorialExperiment([row],'carousel');
 expect(brief.comparablePosts).toBe(1);expect(brief.status).toBe('EXPERIMENT_ONLY');
 expect(brief.automaticStrategyChange).toBe(false);
 expect(brief.publicationApproved).toBe(false);
 expect(editorialExperiment([row],'photo').status).toBe('INSUFFICIENT_EVIDENCE');
 expect(editorialExperiment([{...row,publishedAt:null}],'carousel').comparablePosts).toBe(0);
 expect(editorialExperiment([{...row,saves:null}],'carousel').comparablePosts).toBe(0);
 expect(editorialExperiment([{...row,observedAt:'2026-01-05T10:00:00+03:00'}],'carousel').comparablePosts).toBe(0);
});

it('retains the comparable historical checkpoint after later lifetime readings',()=>{
 const checkpoint={...row,observedAt:'2026-01-03T10:00:00+03:00',reach:80,saves:2};
 const later={...row,observedAt:'2026-01-10T10:00:00+03:00',reach:200,saves:10};
 const brief=editorialExperiment([row,checkpoint,later],'carousel');
 expect(brief.comparablePosts).toBe(1);expect(brief.evidence[0].observedAt).toBe(checkpoint.observedAt);expect(brief.evidence[0].saves).toBe(2);
});
it('validates TikTok native permalinks without mixing platform cohorts or inventing missing saves',()=>{
 const t:MetricSnapshot={...row,platform:'tiktok',url:'https://www.tiktok.com/@fixture/photo/12345678',saves:null};
 expect(validatePublicationAnalytics([t])).toEqual([t]);
 expect(editorialExperiment([row,t],'carousel').observedPosts).toBe(1);
 expect(editorialExperiment([row,t],'carousel','tiktok').comparablePosts).toBe(0);
 expect(editorialExperiment([row,{...t,saves:1}],'carousel','tiktok').comparablePosts).toBe(1);
 expect(()=>validatePublicationAnalytics([{...t,url:row.url}])).toThrow();
});
