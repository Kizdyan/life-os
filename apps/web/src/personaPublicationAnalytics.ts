export interface PublicationMetrics {
 id:string;format:'reel'|'carousel';topic:string;publishedAt:string;
 reach:number;views:number;likes:number;comments:number;shares:number;saves:number;
 profileVisits:number;follows:number;
}
export interface PublicationRates {
 id:string;format:'reel'|'carousel';topic:string;
 followConversion:number|null;saveRate:number|null;shareRate:number|null;engagementRate:number|null;
}
const valid=(value:number)=>Number.isFinite(value)&&value>=0;
const ratio=(numerator:number,denominator:number)=>denominator>0?numerator/denominator:null;
export function evaluatePublication(row:PublicationMetrics):PublicationRates{
 for(const key of ['reach','views','likes','comments','shares','saves','profileVisits','follows'] as const){
  if(!valid(row[key]))throw Error('Invalid metric: '+key);
 }
 return {
  id:row.id,format:row.format,topic:row.topic,
  followConversion:ratio(row.follows,row.profileVisits),
  saveRate:ratio(row.saves,row.reach),
  shareRate:ratio(row.shares,row.reach),
  engagementRate:ratio(row.likes+row.comments+row.shares+row.saves,row.reach),
 };
}
export function comparePublicationFormats(rows:PublicationMetrics[]){
 const formats=['reel','carousel'] as const;
 return formats.map(format=>{
  const subset=rows.filter(row=>row.format===format);
  const sum=(field:keyof Pick<PublicationMetrics,'reach'|'saves'|'shares'|'follows'|'profileVisits'>)=>subset.reduce((total,row)=>total+row[field],0);
  const reach=sum('reach'),visits=sum('profileVisits');
  return {format,count:subset.length,saveRate:ratio(sum('saves'),reach),shareRate:ratio(sum('shares'),reach),followConversion:ratio(sum('follows'),visits)};
 });
}
