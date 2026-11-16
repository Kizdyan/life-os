export type PersonaStrategy={
 worldview:string;visualStyle:string;delivery:string;targetAudience:string;
 formatType:string;mainGoal:string;retentionStrategy:string;
};
export type PersonaStrategyAudit={
 version:1;status:'PASS'|'WARNING'|'BLOCKED';recommendation:string;snapshot:string;
 provider:'openrouter'|'openai';model:string;checkedAt:string;
};
export type PersonaStrategyFieldKey=keyof PersonaStrategy;
export declare const PERSONA_STRATEGY_FIELDS:ReadonlyArray<readonly [PersonaStrategyFieldKey,string,string]>;
export declare function isPersonaStrategy(value:unknown):value is PersonaStrategy;
export declare function defaultPersonaStrategy():PersonaStrategy;
export declare function strategyForArchitect(item:{id:string}):PersonaStrategy;
export declare function strategyAuditInput(project:unknown):{
 title:string;sourceIdea:string;strategy:PersonaStrategy|null;scenes:Array<{line:string;action:string;durationSec:number}>;musicalDirection:string|null;
};
export declare function strategySnapshot(project:unknown):string;
export declare function readPersonaStrategyAudit(value:unknown):PersonaStrategyAudit|null;
export declare function currentPersonaStrategyAudit(project:unknown):PersonaStrategyAudit|null;
