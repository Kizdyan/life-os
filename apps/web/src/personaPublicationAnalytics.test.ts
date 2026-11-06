import {describe,it,expect} from 'vitest';
import {evaluatePublication,comparePublicationFormats,type PublicationMetrics} from './personaPublicationAnalytics';
const example:PublicationMetrics={id:'p1',format:'carousel',topic:'acting',publishedAt:'2026-11-06',reach:1000,views:1200,likes:100,comments:10,shares:20,saves:50,profileVisits:80,follows:16};
describe('publication analytics',()=>{
 it('calculates separate conversion, save, share and engagement rates',()=>{
  expect(evaluatePublication(example)).toMatchObject({followConversion:0.2,saveRate:0.05,shareRate:0.02,engagementRate:0.18});
 });
 it('does not fabricate rates when denominator is zero',()=>{
  expect(evaluatePublication({...example,reach:0,profileVisits:0}).saveRate).toBeNull();
  expect(evaluatePublication({...example,reach:0,profileVisits:0}).followConversion).toBeNull();
 });
 it('aggregates by exposure rather than averaging percentages',()=>{
  const result=comparePublicationFormats([example,{...example,id:'p2',reach:3000,saves:30,shares:30,profileVisits:20,follows:4}]);
  expect(result.find(row=>row.format==='carousel')).toMatchObject({count:2,saveRate:0.02,followConversion:0.2});
 });
 it('rejects invalid input',()=>{
  expect(()=>evaluatePublication({...example,reach:-1})).toThrow();
 });
});
