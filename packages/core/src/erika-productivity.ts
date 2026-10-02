import type { LifeItem } from "./life-item";
import { buildProductivityDigest } from "./productivity-digest";

export function isProductivityFocusQuestion(text:string):boolean {
  const clean=text.trim();
  return /что.*держим.*поле|на ч[её]м.*сосредоточ|что.*важн|что.*в фокусе|главн.*сейчас/i.test(clean);
}

export function buildErikaProductivityReply(input:{
  items:LifeItem[];
  now:string;
  consecutiveMissesByItem:Record<string,number>;
  maxVisible?:number;
}):string {
  const digest=buildProductivityDigest({
    items:input.items,
    now:input.now,
    consecutiveMissesByItem:input.consecutiveMissesByItem,
    maxVisible:input.maxVisible,
  });

  const lines:string[]=[];
  if(digest.attention.visible.length===0){
    return "Срочных открытых петель сейчас нет. Можно спокойно идти по плану дня.";
  }

  lines.push("Сейчас держим в поле:");
  for(const entry of digest.attention.visible){
    lines.push(`• ${entry.title}${reasonSuffix(entry.reason)}`);
  }
  if(digest.attention.hiddenCount>0){
    lines.push(`Ещё ${digest.attention.hiddenCount} пунктов я скрыла из фокуса, чтобы не перегружать тебя.`);
  }

  for(const recovery of digest.recovery){
    if(recovery.action==="minimum_version"){
      lines.push(`${recovery.title}: после повторного срыва лучше поставить минимальную версию, а не ещё одну полную попытку.`);
    } else if(recovery.action==="retry_soon"){
      lines.push(`${recovery.title}: после одного срыва стоит вернуть ближайшим реалистичным окном.`);
    } else if(recovery.action==="review_fixed"){
      lines.push(`${recovery.title}: фиксированное событие не переношу автоматически — его нужно разобрать отдельно.`);
    }
  }

  return lines.join("\n");
}

function reasonSuffix(reason:string):string {
  if(reason==="due_soon") return " — скоро";
  if(reason==="overdue") return " — просрочено";
  if(reason==="missed_time") return " — сорвано по времени";
  if(reason==="not_completed") return " — не выполнено";
  if(reason==="moved") return " — перенесено";
  return "";
}
