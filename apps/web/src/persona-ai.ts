import { buildPersonaCarousel } from './persona-content';
import { runFinalQA } from './persona-factory';
import { personaEdgeRequest } from './edgeRuntimeClient';
import type{PersonaCarouselDraft}from'./persona-content';
function asDraft(current:PersonaCarouselDraft,data:any):PersonaCarouselDraft{if(!data||!Array.isArray(data.slides)||typeof data.caption!=='string')throw new Error('AI вернул незавершённый материал');return{topicId:current.topicId,title:String(data.title||current.title),slides:data.slides.map((s:any)=>({eyebrow:String(s?.eyebrow||''),title:String(s?.title||''),body:String(s?.body||'')})),caption:String(data.caption),platformNotes:{instagram:String(data.platformNotes?.instagram??current.platformNotes.instagram),vk:String(data.platformNotes?.vk??current.platformNotes.vk),youtube:String(data.platformNotes?.youtube??current.platformNotes.youtube)}}}

/** Existing static PWA can use the existing authenticated Edge persona service.
 * Do not silently use a non-existent Vercel /api route on the iPhone build. */
async function personaRequest(payload: Record<string, unknown>): Promise<any> {
  if ((import.meta.env.VITE_LIFE_OS_EDGE_RUNTIME_URL ?? '').trim())
    return personaEdgeRequest(payload);
  const response = await fetch('/api/media/status', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw errorFor(data);
  return data;
}
/** Reuses the existing actor/musical/journey editorial drafts when AI is offline.
 * Only known titles are supported; this is a real authored template, NOT an LLM response. */
export function existingFirstPostDraft(topic: { id: string; title: string }): PersonaCarouselDraft | null {
  const title = topic.title.toLocaleLowerCase('ru-RU');
  const key = /не хочу показывать только результат|путь актера|путь актёра/u.test(title) ? 'journey'
    : /четыре ноты/u.test(title) ? 'musical'
    : /до выхода на сцену|зритель не видит/u.test(title) ? 'actor' : null;
  if (!key) return null;
  const template = buildPersonaCarousel(key);
  const slides = template.slides.map(slide => ({
    ...slide, eyebrow: slide.eyebrow.replace(/^(?:PERSONA|ПЕРСОНА)\s*[·•—:-]*\s*/iu, ''),
  }));
  const caption = template.caption + '\\n\\nИнтересно продолжение этой темы — с реальными фрагментами работы?';
  return { ...template, topicId: topic.id, slides, caption };
}
function localQuality(draft: PersonaCarouselDraft) {
  const report = runFinalQA({ title: draft.title, publicText: draft.caption, format:'carousel',
    platforms:['instagram'], assets:[], slides:draft.slides.map(({title,body}) => ({title,body})) });
  if (!report.pass) throw new Error('Local editorial QA failed: '+report.issues.map(i=>i.code).join(','));
  return { ...report, kind:'deterministic' as const };
}
function errorFor(data:any){if(data?.error==='qa_failed')return new Error('AI QA не пропустил материал в финал');if(data?.error==='voice_temporarily_unavailable')return new Error('AI voice temporarily unavailable');return new Error('AI temporarily unavailable')}
export async function reviseWithAI(draft:PersonaCarouselDraft,feedback:string):Promise<{draft:PersonaCarouselDraft;summary:string;rules:string[];qa?:any}> {
  const data = await personaRequest({ action:'revise', draft, feedback });
  const next = asDraft(draft,data);
  const rules = Array.isArray(data.learnedRules) ? data.learnedRules.map(String) : [];
  let qa = data.qa;
  if (!qa && (import.meta.env.VITE_LIFE_OS_EDGE_RUNTIME_URL ?? '').trim()) {
    const report = await personaRequest({action:'prepublish',draft:next});
    qa = { pass:report.ready===true, score:Number(report.qa?.score ?? 0), issues:report.qa?.issues ?? [] };
  }
  return { draft:next, summary:String(data.changeSummary||'Материал переработан редактором.'),
    rules, qa };
}
export async function generateWithAI(topic:{id:string;title:string;angle?:string;format?:string;reason?:string;source?:string}):Promise<{draft:PersonaCarouselDraft;summary:string;rules:string[];qa?:any}> {
  if (topic.format === 'carousel') {
    const ready = existingFirstPostDraft(topic);
    if (ready) return { draft:ready,
      summary:'Подготовлено из существующей редакционной базы. Проведены формальные проверки; это не генерация ИИ.',
      rules:[],qa:localQuality(ready) };
  }
  const data = await personaRequest({ action:'generate', idea:topic });
  const empty:PersonaCarouselDraft={topicId:topic.id,title:topic.title,slides:[],caption:'',platformNotes:{instagram:'',vk:'',youtube:''}};
  const next=asDraft(empty,data);
  const rules=Array.isArray(data.learnedRules)?data.learnedRules.map(String):[];
  let qa=data.qa;
  if (!qa && (import.meta.env.VITE_LIFE_OS_EDGE_RUNTIME_URL ?? '').trim()) {
    const report=await personaRequest({action:'prepublish',draft:next});
    qa={pass:report.ready===true,score:Number(report.qa?.score??0),issues:report.qa?.issues??[]};
  }
  return {draft:next,summary:String(data.changeSummary||'Материал подготовлен редактором.'),rules,qa};
}
