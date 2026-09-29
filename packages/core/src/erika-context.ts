export interface ConversationRef{id:string;title:string;start?:string;end?:string}
export interface ErikaContext{lastMentioned?:ConversationRef;lastFixed?:ConversationRef}
export function updateContext(ctx:ErikaContext,item:ConversationRef,fixed=false):ErikaContext{return{...ctx,lastMentioned:item,lastFixed:fixed?item:ctx.lastFixed}}
export function resolveReference(text:string,ctx:ErikaContext):ConversationRef|undefined{if(/(?:перед|после)\s+ним|его\s+(?:перенеси|поставь)|это\s+(?:перенеси|раньше|позже)/i.test(text))return ctx.lastMentioned||ctx.lastFixed;return undefined}
export function wantsDayReplan(text:string){return/(?:перестрой|перепланируй|пересобери).*(?:день|остаток)|я\s+(?:проспал|опоздал)/i.test(text)}
