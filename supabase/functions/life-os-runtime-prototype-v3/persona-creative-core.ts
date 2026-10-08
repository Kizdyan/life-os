import { approvePersonaCandidate, validatePersonaShootingBrief } from "./quality-gates.ts";
import { buildDeterministicShootingBrief } from "./persona-brain.ts";
import { freeEditorialCandidate, FREE_EDITORIAL_AS_OF } from "./persona-free-editorial.ts";

export type CreativeIdea = Record<string, unknown>;
export type CreativeRevision = {
  version: number; idea: CreativeIdea; proof: string; createdAt: string;
  reason: string; critic: string; judge: string;
};
export type CreativeProposal = {
  baseVersion: number; nextVersion: number; idea: CreativeIdea; reason: string;
  critic: string; judge: string; status: "APPROVE" | "REVISE";
};
export type CreativeAsset = {
  id: string; projectId: string; contentItemId: string; ideaId: string;
  ideaVersion: number; sessionId: string; kind: "take" | "photo" | "broll" | "audio" | "additional";
  filename: string; mime: string; bytes: number; createdAt: string;
  storage: "device_local"; state: "INTAKE_LOCAL" | "QA_PENDING";
  pipeline: { mediaQA: "PENDING"; transcription: "PENDING"; takeScoring: "PENDING"; 
    selectedSegments: "PENDING"; editDecisions: "PENDING"; outputs: "PENDING" };
};
export type CreativeSession = {
  id: string; projectId: string; contentItemId: string; ideaId: string;
  ideaVersion: number; startedAt: string; status: "WAITING_UPLOAD" | "MATERIAL_RECEIVED";
  brief: Record<string, unknown>; briefVersion: number; conditions: string;
  assets: CreativeAsset[];
};
export type CreativeItem = {
  id: string; projectId: string; contentItemId: string; currentVersion: number;
  revisions: CreativeRevision[]; pending: CreativeProposal | null;
  session: CreativeSession | null; status: "IDEA_APPROVED" | "EDIT_REVIEW" | "SHOOTING" | "MEDIA_RECEIVED";
};
export const CREATIVE_PROJECT = "persona:owner:project:v1";
export const CREATIVE_ITEM_PREFIX = "persona:creative:";
export const MAX_CREATIVE_ITEMS = 3;
const GUIDE_URLS = [
  "https://www.facebook.com/business/ads/facebook-instagram-reels-ads",
  "https://blog.youtube/creator-and-artist-stories/your-guide-to-getting-started-with-youtube-shorts/"
];
const guidance = [
  {source:"Meta for Business — Reels format guidance (not a live trend)",
    finding:"Формат: вертикальное видео, чистый голос, безопасная зона кадра",url:GUIDE_URLS[0],asOf:FREE_EDITORIAL_AS_OF},
  {source:"YouTube Creator Blog — YouTube Shorts format guidance (not a live trend)",
    finding:"Для Shorts полезен 9:16 кадр, понятный хук в первые секунды и съёмка на телефон",url:GUIDE_URLS[1],asOf:FREE_EDITORIAL_AS_OF},
];
const verdict = (why:string) => ({verdict:"APPROVE",score:83,summary:why+"; требования формата, не обещание охватов.",risks:["Нет доказательства актуального тренда; не обещать просмотров"]});

export function creativeShortlist(now = Date.now()): CreativeIdea[] {
  const primary = freeEditorialCandidate(now);
  if (!primary) return [];
  const shared = {format:"reel",score:83,confidence:70,marketEvidence:guidance,
    evidenceKind:"EDITORIAL_PLATFORM_GUIDANCE_NOT_LIVE_TREND",estimatedMinutes:9,estimatedDurationSeconds:25,
    reviewProvenance:"CURATED_FREE_ONLY_2026-10-08",whyNow:["Проверен формат Reels/Shorts, НЕ рыночная новизна"]};
  const music:CreativeIdea = {
    ...shared,id:"free-editorial-piano-three-moods-20261009",
    title:"Один аккорд — три настроения",angle:"Музыкальный мини-эксперимент за фортепиано вместо говорящей головы",
    hook:"Можно ли изменить историю, поменяв только один аккорд?",
    script:"Это одна мелодия. Сначала она звучит как признание, потом как угроза, а теперь — как старая добрая шутка. Ноты почти те же, но что вы услышали первым?",
    soloPlan:"Снять один вертикальный статичный дубль клавиатуры и лица, сыграть три коротких варианта.",
    helperPlan:"Помощник снимает крупно клавиатуру, не перебивая звук.",
    reason:"Подходит музыканту и композитору. Без помощника, платного AI и заявления о трендах.",
    qualityVerdict:verdict("Музыкальная демонстрация за 9 минут")
  };
  const backstage:CreativeIdea = {
    ...shared,id:"free-editorial-backstage-countdown-20261009",
    title:"30 секунд до выхода на сцену",angle:"Наблюдательный закулисный мини-сюжет, а не экспертный совет",
    hook:"Что происходит в последнюю минуту перед выходом актёра?",
    script:"Сначала проверяю реквизит. Потом ловлю тишину за кулисами. Последний вдох — и теперь уже нельзя передумать. Короткий момент, который из зрительного зала не увидеть.",
    soloPlan:"Если есть разрешение театра, снять себя и свои предметы в безопасном месте без других людей и чужой речи.",
    helperPlan:"Помощник снимает две нейтральные детали реквизита, если это разрешено.",
    reason:"Рабочий опыт актёра, съёмка по возможности; не снимать других людей или спектакль без разрешения.",
    qualityVerdict:verdict("Закулисная история при наличии разрешения")
  };
  const all = [primary,music,backstage];
  return all.filter(item => approvePersonaCandidate(item,now).approved).slice(0,MAX_CREATIVE_ITEMS);
}

export function editorialAssessment(idea: CreativeIdea, request: string):
  {kind:string; proposal:CreativeIdea|null; critic:string; judge:string} {
  const text = request.trim().slice(0,600);
  if (!text) return {kind:"EMPTY",proposal:null,critic:"Уточни, что именно меняем.",judge:"REVISE"};
  if (/что (ты )?думаешь|как считаешь|оцени|согласн/i.test(text)) {
    return {kind:"OPINION",proposal:null,
      critic:"Сильнее всего здесь конкретное действие и узнаваемый хук. Я бы избегала преувеличений и экспертной позы. Если цель — юмор, сохраним характер, а не добавим случайную шутку.",
      judge:"COMMENT_ONLY"};
  }
  const next={...idea};
  let kind="UNRECOGNIZED",critic="Это изменение пока слишком расплывчато: есть риск потерять исходный замысел.";
  const hook=String(idea.hook||"");
  const script=String(idea.script||"");
  if (/финал|концовк|в конце/i.test(text)) {
    kind="ENDING";
    next.script=script.replace(/[.!?\s]+$/,"")+" А финал оставим открытым: что бы ты сделал на его месте?";
    critic="Открытый финал вовлекает, но не должен звучать как просьба поставить лайк.";
  } else if (/смешн|юмор|ирони|шуточ/i.test(text)) {
    kind="HUMOR";
    next.hook=hook.replace(/[!?]+$/,"")+" — и без пафоса.";
    next.script=script.replace(/[.!?\s]+$/,"")+" И нет, запасного дублёра моей серьёзности не завезли.";
    critic="Добавим лёгкую самоиронию, но не будем превращать важную актёрскую сцену в клоунаду.";
  } else if (/без эксперт|не учи|без наставник|не поучай/i.test(text)) {
    kind="NON_EXPERT";
    next.script="Это просто мой опыт: "+script.replace(/^(Вы должны|Нужно всем|Правильный способ)[,:]?\s*/i,"");
    critic="Согласна: конкретное личное наблюдение убедительнее неподтверждённого совета.";
  } else if (/пафосн|слишком громк|проще|естествен/i.test(text)) {
    kind="NATURAL";
    next.hook="Покажу один простой момент: "+hook.replace(/[!?]+$/,"").toLowerCase();
    critic="Да, снизим тон: естественная подача важнее громких обещаний.";
  } else if (/нет помощник|один снима|сама снима|сам снима|без оператора/i.test(text)) {
    kind="SOLO";
    next.soloPlan="Снять одному: iPhone на безопасной устойчивой опоре, один непрерывный дубль, без движения камеры.";
    critic="При съёмке одному лучше один устойчивый кадр, чем сложный монтаж без оператора.";
  } else if (/поменяй хук|другой хук|новое начало/i.test(text)) {
    kind="HOOK";
    next.hook="А что, если показать это совсем иначе? "+hook;
    critic="Новый хук понятнее только если он точно связан с содержанием; это нужно проверить на первом дубле.";
  }
  if (kind==="UNRECOGNIZED") return {kind,proposal:null,critic:critic+" Уточни: финал, хук, юмор, тон или съёмочные условия?",judge:"REVISE"};
  const check=approvePersonaCandidate(next);
  if (!check.approved || !check.candidate) return {kind,proposal:null,critic:"Критик отклонил изменение: "+check.failures.join(", "),judge:"REVISE"};
  return {kind,proposal:check.candidate,critic,judge:"APPROVE"};
}

export function adaptCreativeBrief(idea:CreativeIdea, conditions:string):Record<string,unknown> {
  const brief=buildDeterministicShootingBrief(idea);
  const lower=conditions.toLocaleLowerCase("ru-RU").slice(0,500);
  const shots=brief.shots as Array<Record<string,unknown>>;
  if (/нет штатив|без штатив/i.test(lower)) {
    for(const shot of shots) {shot.cameraPosition="iPhone на устойчивой полке или опоре, без удерживания в руке";
      shot.action=String(shot.action)+" Проверь устойчивость до записи.";}
  }
  if (/плох.*свет|темно/i.test(lower)) brief.lighting="Встать лицом к доступному окну или лампе, избегать контрового света и пересвета.";
  if (/без помощник|один|одн[ао]/i.test(lower)) {
    for(const shot of shots) shot.action=String(shot.action)+" Снять одному, с таймером.";
  }
  if (/помощник|оператор/i.test(lower)&& !/без помощник/i.test(lower)) {
    for(const shot of shots) shot.cameraPosition="Помощник держит телефон стабильно на уровне глаз";
  }
  const mins=lower.match(/(\d{1,2})\s*мин/);
  if(mins) {
    const n=Number(mins[1]);
    if(n<5) throw Error("shooting_time_too_short");
    if(n<=15) for(const shot of shots)shot.takes=n<8?1:2;
  }
  if (/друг.*локац|дома|на улице|в студии/i.test(lower)) brief.background="Новая разрешённая локация: нейтральный фон, без посторонних лиц и личной информации.";
  const failures=validatePersonaShootingBrief(brief);
  if (failures.length) throw Error("invalid_adapted_brief:"+failures.join(","));
  return brief;
}

export function validateIntakeAsset(value:unknown): CreativeAsset {
 if(!value||typeof value!=="object")throw Error("invalid_asset");
 const a=value as Partial<CreativeAsset>;
 if(!a.id || !/^[a-zA-Z0-9_-]{8,100}$/.test(a.id) ||
    !a.sessionId || !a.ideaId || !a.contentItemId ||
    !a.projectId || !Number.isInteger(a.ideaVersion) || (a.ideaVersion??0)<1 ||
    !a.filename || a.filename.length>255 || /[\/\\]/.test(a.filename) ||
    !a.mime || a.mime.length>150 || !Number.isFinite(a.bytes) || (a.bytes??0)<=0 ||
    (a.bytes??0)>5*1024*1024*1024 ||
    !["take","photo","broll","audio","additional"].includes(String(a.kind)) ||
    a.storage!=="device_local") throw Error("invalid_asset");
 return {...a,kind:a.kind!,projectId:a.projectId,contentItemId:a.contentItemId,
   ideaId:a.ideaId,ideaVersion:a.ideaVersion,sessionId:a.sessionId,id:a.id,
   filename:a.filename,mime:a.mime,bytes:a.bytes,storage:"device_local",state:"INTAKE_LOCAL",
   createdAt:new Date().toISOString(),
   pipeline:{mediaQA:"PENDING",transcription:"PENDING",takeScoring:"PENDING",
     selectedSegments:"PENDING",editDecisions:"PENDING",outputs:"PENDING"}} as CreativeAsset;
}
