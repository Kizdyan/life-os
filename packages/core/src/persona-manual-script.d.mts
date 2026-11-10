export type ManualScene={order:number;kind:'visual'|'spoken';caption:string;spokenText:string;musicAccent:string};
export type ManualScriptSource={version:1;sourceText:string;sourceSha256:string;model:string;scenes:ManualScene[]};
export function extractManualScenes(text:string):Array<{order:number;startSec:number;endSec:number;durationSec:number;action:string;caption:string;speech:string}>;
export function validateManualSource(value:unknown,script:unknown):ManualScriptSource;
export type TakeBinding={sceneOrder:number;kind:'spoken'|'visual';expectedSpeech:string;sourceId?:string;sha256?:string};
export function readTakeBindings(brief:any,value:unknown,requireHashes?:boolean):TakeBinding[];
