/**
 * Browser playback evidence is a UX safeguard, not a proof of attention.
 * A seek, long time jump or extreme playback rate never counts as coverage.
 * Replayed ranges count once. A real 'ended' event is mandatory.
 */
export type PersonaPlaybackProof={
 lastTime:number|null;
 intervals:Array<[number,number]>;
 reachedStart:boolean;
 completed:boolean;
};
export type PersonaPlaybackEvent={
 kind:'play'|'timeupdate'|'pause'|'seeking'|'ended';
 currentTime:number;duration:number;paused?:boolean;seeking?:boolean;playbackRate?:number;
};
export const emptyPersonaPlaybackProof=():PersonaPlaybackProof=>({
 lastTime:null,intervals:[],reachedStart:false,completed:false
});
export function advancePersonaPlaybackProof(state:PersonaPlaybackProof,event:PersonaPlaybackEvent):PersonaPlaybackProof{
 const {kind,currentTime,duration}=event;
 if(!Number.isFinite(currentTime)||!Number.isFinite(duration)||duration<=0)return state;
 if(kind==='seeking'||kind==='pause')return {...state,lastTime:null};
 if(kind==='play'){
  const reachedStart=state.reachedStart||currentTime<=Math.min(1,duration*0.05);
  return {...state,reachedStart,lastTime:currentTime};
 }
 if(kind==='timeupdate'){
  if(event.paused||event.seeking||!Number.isFinite(event.playbackRate)||event.playbackRate!<0.75||
   event.playbackRate!>1.5)return {...state,lastTime:null};
  const prev=state.lastTime;
  if(prev===null||currentTime<=prev||currentTime-prev>2.5)
   return {...state,lastTime:currentTime};
  const intervals=[...state.intervals,[Math.max(0,prev),Math.min(duration,currentTime)] as [number,number]]
   .sort((a,b)=>a[0]-b[0]);
  const merged:Array<[number,number]>=[];
  for(const [start,end] of intervals){
   const last=merged.at(-1);
   if(last&&start<=last[1]+0.001)last[1]=Math.max(last[1],end);
   else merged.push([start,end]);
  }
  return {...state,intervals:merged,lastTime:currentTime};
 }
 if(kind==='ended'){
  const coverage=state.intervals.reduce((sum,[start,end])=>sum+Math.max(0,end-start),0);
  const complete=state.reachedStart&&currentTime>=duration-0.5&&coverage>=duration*0.9;
  return {...state,lastTime:null,completed:state.completed||complete};
 }
 return state;
}
