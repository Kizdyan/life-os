import type{AnalyticsView}from'./analyticsView';import{planCompound,type PlannedDraft,type PlanningPolicy}from'./planner';import type{Item}from'./types';
type ScheduleEvidence={execution:Pick<AnalyticsView['execution'],'measuredScheduleItems'|'scheduleAdherenceRate'>};
export function erikaPlanningPolicy(data:ScheduleEvidence):PlanningPolicy{const{measuredScheduleItems,scheduleAdherenceRate}=data.execution;if(measuredScheduleItems>=5&&scheduleAdherenceRate!==null&&scheduleAdherenceRate<65)return{transitionBufferMin:15};return{}}
export function planWithErikaContext(text:string,items:Item[],analytics:ScheduleEvidence,now=new Date()):PlannedDraft[]{return planCompound(text,items,now,erikaPlanningPolicy(analytics))}
