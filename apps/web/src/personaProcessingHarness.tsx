import React from 'react';
import {createRoot,type Root} from 'react-dom/client';
import PersonaProcessingPanel from './PersonaProcessingPanel';
import type {CreativeMediaMetadata} from './personaMediaIntake';

type Scope={projectId:string;contentItemId:string;ideaId:string;ideaVersion:number;sessionId:string};
type Harness={render:(assets:CreativeMediaMetadata[],scope:Scope)=>void;unmount:()=>void;remount:()=>void};
declare global{interface Window{__personaHarness:Harness;}}

const element=document.getElementById('root');
if(!element)throw Error('harness_root_missing');
let root:Root|null=null;
let assets:CreativeMediaMetadata[]=[];
let scope:Scope={projectId:'project',contentItemId:'content',ideaId:'idea',ideaVersion:1,sessionId:'session'};
const mount=()=>{if(!root)root=createRoot(element);root.render(<PersonaProcessingPanel assets={assets} scope={scope}/>);};
window.__personaHarness={
 render(nextAssets,nextScope){assets=nextAssets;scope=nextScope;mount();},
 unmount(){root?.unmount();root=null;},
 remount(){mount()}
};
