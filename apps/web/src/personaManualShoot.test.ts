import {it,expect} from 'vitest';
import {buildPersonaProductionBrief} from '../../../packages/core/src/persona-production-brief';
import {importPersonaProductionBrief,recordPersonaEditorialDecision} from '../../../packages/core/src/persona-production-pipeline';
import {buildPersonaShootPlan,makeShootSheet} from './personaShootNow';
const idea={id:'manual-test',title:'Авторский текст',angle:'Сохранить авторскую последовательность кадров.',format:'reel' as const};
function fixture(){
 const actions=['Читаешь сообщение. (Текст: БЮДЖЕТ НА ОДНОГО)','Играешь мотив. (Текст: МОЯ МУЗЫКА)'];
 const brief=buildPersonaProductionBrief({idea});brief.script=actions.map((action,i)=>({order:i+1,durationSec:2,line:i?'МОЯ МУЗЫКА':'БЮДЖЕТ НА ОДНОГО',action}));brief.shots=brief.script.map(b=>({...brief.shots[0],...b}));for(const a of Object.values(brief.adaptations))a.durationSec=4;
 brief.hook.firstSeconds=brief.script[0].line;brief.manualSource={version:1,sourceText:'0–2 сек: '+actions[0]+'\n2–4 сек: '+actions[1],sourceSha256:'a'.repeat(64),model:'test-parser',scenes:brief.script.map(b=>({order:b.order,kind:'visual',caption:b.line,spokenText:'',musicAccent:''}))};
 return brief;
}
it('manual approval persists exact source and treats title cards as visual instructions',()=>{
 const brief=fixture();let pipeline=importPersonaProductionBrief({brief,selectedIdea:idea});
 pipeline=recordPersonaEditorialDecision(pipeline,{decision:'approved',editor:'Test author',comment:'Explicit authored screenplay confirmation.',factReviewCompleted:true,decidedAt:'2026-11-10T12:00:00Z'});
 expect(pipeline.materials.productionBrief?.manualSource).toEqual(brief.manualSource);
 const plan=buildPersonaShootPlan({title:idea.title,pipeline,allowPilot:false});
 expect(plan.status).toBe('approved');expect(plan.scenes[0].lineKind).toBe('visual');expect(makeShootSheet(plan)).toContain('Экранный титр: БЮДЖЕТ НА ОДНОГО');
 expect(()=>importPersonaProductionBrief({brief:{...brief,script:brief.script.map((b,i)=>i?b:{...b,line:'Подмена слов'})},selectedIdea:idea})).toThrow(/Manual script/);
});
