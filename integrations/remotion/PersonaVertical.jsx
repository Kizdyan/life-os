import React from 'react';
import {AbsoluteFill,OffthreadVideo,Sequence,staticFile,useVideoConfig} from 'remotion';

/**
 * Renderable Persona composition. The handoff's media must first be copied to
 * public/media under their exact sanitized source paths. Never use raw OS paths.
 */
export function PersonaVertical({handoff}){
 const {fps,width,height}=useVideoConfig();
 if(handoff?.kind!=='PERSONA_REMOTION_HANDOFF'||handoff?.composition?.fps!==fps||
    handoff.composition.width!==width||handoff.composition.height!==height)
  throw Error('Invalid Persona handoff/composition');
 return <AbsoluteFill style={{backgroundColor:'#000'}}>
  {handoff.clips.map((clip,i)=>{
   if(!/^[a-zA-Z0-9_./-]+$/.test(clip.source)||clip.source.startsWith('/')||
      clip.source.split('/').includes('..'))throw Error('Unsafe media source');
   return <Sequence key={i} from={clip.fromFrame} durationInFrames={clip.durationInFrames}>
    <OffthreadVideo src={staticFile('media/'+clip.source)} startFrom={clip.sourceStartFrame}
      endAt={clip.sourceStartFrame+clip.durationInFrames} style={{width:'100%',height:'100%',objectFit:'contain'}}/>
   </Sequence>;
  })}
 </AbsoluteFill>;
}
