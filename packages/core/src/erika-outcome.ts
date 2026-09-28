import type { OutcomeCommand } from './outcomes';
import type { SetOutcomeActionInput } from './commands';

const DONE = /(^|\s)(сделал|сделала|выполнил|выполнила|готово|выполнено)(?=\s|$|[,.!?])/i;
const NOT_DONE = /(^|\s)(не\s+(?:сделал|сделала|выполнил|выполнила)|не\s+выполнено)(?=\s|$|[,.!?])/i;
const MOVE = /(^|\s)(перенеси|перенести|перенос)(?=\s|$|[,.!?])/i;
const TOMORROW = /(^|\s)(на\s+завтра|завтра)(?=\s|$|[,.!?])/i;

export function parseErikaOutcome(text:string,itemId:string,plannedDate:string,nextDate:string):SetOutcomeActionInput|null{
 let command:OutcomeCommand|null=null;
 if(NOT_DONE.test(text)) command='not_complete';
 else if(MOVE.test(text)) command='move';
 else if(DONE.test(text)) command='complete';
 if(!command)return null;
 const carryForward=command==='not_complete'&&TOMORROW.test(text);
 return {itemId,command,plannedDate,carryForward,nextDate:carryForward||command==='move'?nextDate:undefined,source:'erika'};
}
