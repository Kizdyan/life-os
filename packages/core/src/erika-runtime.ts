import { parseErikaOutcome } from './erika-outcome';
import { setOutcomeAction } from './commands';
import type { AutonomyEngine } from './engine';
import type { AuditEntry } from './actions';
import type { LifeItem } from './life-item';
import { buildErikaProductivityReply, isProductivityFocusQuestion } from './erika-productivity';

export interface ErikaItemMatch { id:string; title:string; plannedDate:string; }
export interface ErikaContext {
  findItem(query:string, plannedDate:string):Promise<ErikaItemMatch|null>;
  today():string;
  tomorrow():string;
  now?():string;
  listItems?():Promise<LifeItem[]>;
  consecutiveMissesByItem?():Promise<Record<string,number>>;
}

export interface ErikaExecution {
  understood:boolean;
  message:string;
  audit?:AuditEntry;
}

export class ErikaRuntime {
  constructor(private readonly engine:AutonomyEngine, private readonly context:ErikaContext) {}

  async execute(text:string):Promise<ErikaExecution> {
    if(isProductivityFocusQuestion(text) && this.context.listItems){
      const items=await this.context.listItems();
      const consecutiveMissesByItem=this.context.consecutiveMissesByItem
        ? await this.context.consecutiveMissesByItem()
        : {};
      return {
        understood:true,
        message:buildErikaProductivityReply({
          items,
          now:this.context.now?.() ?? new Date().toISOString(),
          consecutiveMissesByItem,
        }),
      };
    }

    const today=this.context.today();
    const tomorrow=this.context.tomorrow();
    const item=await this.context.findItem(text,today);
    if(!item) return {understood:false,message:'Не нашла подходящий пункт в графике.'};

    const parsed=parseErikaOutcome(text,item.id,item.plannedDate,tomorrow);
    if(!parsed) return {understood:false,message:'Не поняла, какую отметку нужно поставить.'};

    const id=crypto.randomUUID();
    const audit=await this.engine.run(setOutcomeAction(parsed,id));
    if(audit.state!=='verified') return {understood:true,message:'Изменение не удалось подтвердить.',audit};

    if(parsed.command==='complete') return {understood:true,message:`✓ ${item.title} — выполнено.`,audit};
    if(parsed.carryForward) return {understood:true,message:`× ${item.title} — сегодня не выполнено; перенесено на завтра.`,audit};
    if(parsed.command==='move') return {understood:true,message:`${item.title} перенесено.`,audit};
    return {understood:true,message:`× ${item.title} — не выполнено.`,audit};
  }
}
