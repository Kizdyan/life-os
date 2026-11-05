import {createScenarioScript,type ScenarioIdea,type ScenarioScriptBeat} from "../../../packages/core/src/persona-scenario-intelligence";
import type {PersonaScenarioWorkspace} from "./personaProjectStore";

export type PersonaCreativeLens = "producer" | "dramaturg" | "director" | "reels" | "marketing";

export const personaCreativeLenses: readonly { id:PersonaCreativeLens; label:string; question:string }[] = [
  {id:"producer",label:"Продюсер",question:"Зачем незнакомому зрителю смотреть именно этот ролик? Есть ли реальный повод для серии?"},
  {id:"dramaturg",label:"Сценарист",question:"Чего добивается герой, что мешает, что меняется и заслужен ли финал?"},
  {id:"director",label:"Режиссёр",question:"Есть ли физическое действие, точная актёрская задача и работающий визуальный конфликт?"},
  {id:"reels",label:"Reels-мейкер",question:"Что захватывает внимание с первого кадра? Где зритель может уйти?"},
  {id:"marketing",label:"Маркетолог",question:"Как ролик раскрывает актёрское и музыкальное мастерство, а не только сообщает профессии?"},
];

export interface PersonaCreativeConcept {
  id:string;
  title:string;
  mechanism:string;
  audiencePromise:string;
  heroGoal:string;
  obstacle:string;
  turn:string;
  ending:string;
  cinematicProof:string;
  productionNeed:string;
  /** Editorial hypotheses, NOT independent model reviews or audience performance metrics. */
  criticism:Record<PersonaCreativeLens,{weakness:string;revision:string}>;
  idea:ScenarioIdea;
  beats:ScenarioScriptBeat[];
}

const concept=(input:Omit<PersonaCreativeConcept,"idea">):PersonaCreativeConcept=>({
  ...input,
  idea:{
    id:input.id,title:input.title,referenceIds:[],
    originalConflict:input.heroGoal+" Препятствие: "+input.obstacle,
    actingTask:input.cinematicProof,
    ending:input.ending,
    productionComplexity:"low",
    productionRisk:input.productionNeed,
    estimatedDurationSec:input.beats.reduce((sum,beat)=>sum+beat.durationSec,0),
    creativeProfileFit:"Показывает актёрский диапазон и авторскую музыку через действие. Авторская оценка обязательна.",
    origin:"template_fallback",
    evidenceNote:"Предварительная редакторская гипотеза Persona, не AI-генерация, не исследованный тренд и не прогноз охватов.",
  },
});

/** Distinct editorial starting points. Nothing here is approved, filmed or measured. */
export const personaFirstReelConcepts:readonly PersonaCreativeConcept[]=[
  concept({
    id:"persona-actor-composer-wrong-soundtrack-v1",
    title:"Не тот саундтрек",
    mechanism:"Жанровая подмена: романтическое признание из-за оригинальной музыки превращается в триллер.",
    audiencePromise:"Зритель видит, как один звук способен изменить смысл актёрской сцены.",
    heroGoal:"Актёр хочет искренне произнести признание в любви.",
    obstacle:"Композитор сопровождает признание тревожным, почти детективным мотивом.",
    turn:"После попытки исправить музыку композитор делает её ещё более неподходящей.",
    ending:"Актёр прекращает признание взглядом: музыка победила текст.",
    cinematicProof:"Актёр дважды меняет внутреннее состояние без объяснения; композитор играет узнаваемую авторскую тему с двумя разными аранжировками.",
    productionNeed:"Нужны две убедительно различные оригинальные музыкальные фразы, паузы и точная актёрская реакция; без них шутка не работает.",
    criticism:{
      producer:{weakness:"Если музыка недостаточно контрастна, зритель не поймёт конфликт.",revision:"До съёмки записать два коротких музыкальных примера и проверить, меняют ли они восприятие одной и той же реплики."},
      dramaturg:{weakness:"Есть риск дважды объяснить очевидную шутку словами.",revision:"Оставить одну просьбу актёра; эскалацию и финал отдать музыке и реакции."},
      director:{weakness:"Роль композитора может превратиться в статичного человека за пианино.",revision:"Показать активную задачу: он настойчиво пытается помочь и искренне не понимает, почему актёр недоволен."},
      reels:{weakness:"Романтический текст без звукового контраста на старте может казаться обычным монологом.",revision:"Открыть видео первыми нотами ошибочного саундтрека в тот же момент, когда начинается реплика."},
      marketing:{weakness:"Слишком простой комедийный мотив не докажет мастерство композитора.",revision:"Использовать оригинальную музыкальную миниатюру с осмысленным гармоническим и жанровым контрастом."},
    },
    beats:[
      {purpose:"hook",line:"«Я давно хотел тебе сказать…»",action:"Актёр начинает искреннее признание прямо в сцене; на первом слове за кадром возникает тревожный авторский мотив.",durationSec:3,editIntent:"Начать сразу с признания и первого диссонанса; никаких титров-представлений."},
      {purpose:"development",line:"«Стоп. Почему так страшно?»",action:"Актёр прекращает игру, смотрит в сторону композитора; пауза должна быть действительно вызвана музыкой.",durationSec:3,editIntent:"Резкая склейка на реакцию только после узнаваемой музыкальной фразы."},
      {purpose:"development",line:"«Я просто добавил чувства.»",action:"Композитор за клавишами без тени самоиронии играет нежный мотив, который неожиданно превращается в ещё более тревожный.",durationSec:5,editIntent:"Дать услышать две части оригинального мотива; без фоновой музыки поверх реплики."},
      {purpose:"ending",line:"«Я передумал.»",action:"Актёр готовится возобновить признание, но, услышав музыкальное развитие, молча закрывает папку и смотрит в камеру.",durationSec:4,editIntent:"Крупная немая реакция и жёсткий конец на музыкальном акценте; не объяснять шутку."},
    ],
  }),
  concept({
    id:"persona-actor-composer-two-deadlines-v1",
    title:"Два дедлайна",
    mechanism:"Физическая комедия: один человек одновременно пытается исполнить две несовместимые творческие задачи.",
    audiencePromise:"Зритель за несколько секунд понимает без слов, как две профессии буквально делят одного человека.",
    heroGoal:"Актёр хочет закончить подготовку к пробе, композитор — сдать музыку к тому же утру.",
    obstacle:"Обе задачи претендуют на одни и те же руки, время и внимание.",
    turn:"Персонажи начинают занимать одно рабочее место и перебивать друг друга действиями.",
    ending:"На сигнал будильника оба уверенно произносят «Готово», хотя ничего не закончено.",
    cinematicProof:"Резкие контрастные реакции, предметное действие и музыкальное мотивное развитие в одном узнаваемом ритме.",
    productionNeed:"Точный монтаж по движениям, два различимых образа и предметная комедия; многочисленные общие планы не нужны.",
    criticism:{
      producer:{weakness:"Тема загруженности творчеством распространена и может показаться жалобой на жизнь.",revision:"Продать не усталость, а абсурдный физический спор двух профессиональных привычек."},
      dramaturg:{weakness:"Без изменения обстоятельств получится трижды повторённый дедлайн.",revision:"Каждое новое действие должно мешать предыдущему: текст вытесняет клавиши, музыка перебивает репетицию, будильник обрывает обе."},
      director:{weakness:"Однообразное чередование двух говорящих голов убьёт комедию.",revision:"Снимать действия рук и реквизита, соединить движения match-cut и оставить одну широкую контрольную мизансцену."},
      reels:{weakness:"Две устные экспозиции о расписании займут слишком много времени.",revision:"Начать с почти одновременного появления папки с ролью и клавиатуры на одном столе; конфликт считывается сразу."},
      marketing:{weakness:"История про дедлайны показывает занятость, а не мастерство.",revision:"Встроить короткий технически и музыкально убедительный мотив, а актёрскую импровизацию — в реакцию на него."},
    },
    beats:[
      {purpose:"hook",line:"«Это мой стол!»",action:"Одна рука кладёт сценарий на пюпитр клавиатуры, вторая немедленно убирает его; оба действия принадлежат двум образам одного человека.",durationSec:3,editIntent:"Склеить по движению руки; смысл понятен без подписи."},
      {purpose:"development",line:"«Завтра проба.»",action:"Актёр раскрывает страницы, принимает собранную позу и начинает готовить текст.",durationSec:3,editIntent:"Обрыв на хлопке раскрывающейся папки."},
      {purpose:"development",line:"«А у меня сдача музыки.»",action:"Композитор одновременно занимает то же место, начинает играть оригинальный мотив, заслоняя страницы.",durationSec:4,editIntent:"Переход по одному движению; звук клавиш сталкивается с речью."},
      {purpose:"development",line:"«Пять минут!»",action:"Оба персонажа из разных кадров произносят одну просьбу с противоположными намерениями, ускоряя бессмысленный обмен папкой и клавишами.",durationSec:4,editIntent:"Ускорить монтаж на повторяющихся предметных действиях, без искусственного дублирования лица."},
      {purpose:"ending",line:"«Готово.»",action:"Срабатывает будильник. Оба одновременно замолкают; перед ними открытый сценарий и незаконченный музыкальный проект.",durationSec:4,editIntent:"После резкого звука — тишина и пауза на фактическом провале задач."},
    ],
  }),
  concept({
    id:"persona-actor-composer-three-genres-v1",
    title:"Один текст — три жанра",
    mechanism:"Тот же текст меняет смысл трижды благодаря актёрскому действию и написанной автором музыке.",
    audiencePromise:"Зритель за один ролик слышит музыку и видит реальный актёрский диапазон, а не рассказ о профессиях.",
    heroGoal:"Актёр хочет убедительно произнести одну короткую реплику.",
    obstacle:"Композитор каждый раз предлагает новую жанровую окраску.",
    turn:"Третий музыкальный вариант меняет не только настроение, но и смысл отношения между персонажами.",
    ending:"Актёр повторяет реплику без музыки, и она внезапно становится самой сильной.",
    cinematicProof:"Три доказуемо разных намерения на одной реплике и три контрастные музыкальные миниатюры собственного сочинения.",
    productionNeed:"Три тщательно сыгранных дубля одной реплики, три оригинальных мотива и тишина в финале; без исполнительского диапазона идея станет упражнением.",
    criticism:{
      producer:{weakness:"Ролик может выглядеть как учебный этюд, а не история.",revision:"Дать три отчётливо различимых отношения к невидимому собеседнику и настоящий поворот в финале."},
      dramaturg:{weakness:"Повторение одной реплики легко становится предсказуемым.",revision:"Каждая версия должна менять скрытый смысл, а не только громкость голоса или мимику."},
      director:{weakness:"Есть риск играть три карикатуры вместо трёх задач.",revision:"Для каждой версии назначить новое желание: встретить, защититься, скрыть страх; убрать маркированные «эмоции»."},
      reels:{weakness:"Три одинаковых кадра подряд могут наскучить.",revision:"Снимать по разным смысловым акцентам, начинать со звукового контраста и не затягивать паузы."},
      marketing:{weakness:"Финальная тишина может не доказать навыки композитора.",revision:"Показать полноценный, но лаконичный музыкальный контраст до тихого финала; обозначить авторскую музыку в описании ролика."},
    },
    beats:[
      {purpose:"hook",line:"«Ты всё-таки пришёл.»",action:"Актёр смотрит на человека за камерой с искренней радостью; звучит светлая оригинальная тема.",durationSec:4,editIntent:"Начать с первой ноты и первого взгляда, без текстовой заставки."},
      {purpose:"development",line:"«Ты всё-таки пришёл.»",action:"Тот же актёр хочет остановить человека у двери; оригинальная музыка становится тревожной, меняется дистанция и темп действия.",durationSec:4,editIntent:"Склейка на том же слове и узнаваемое изменение музыкальной гармонии."},
      {purpose:"development",line:"«Ты всё-таки пришёл.»",action:"Третья версия: герой скрывает страх под внешней вежливостью; музыка звучит почти комически парадно.",durationSec:4,editIntent:"Поменять точку взгляда и физическую задачу, не использовать декоративный фильтр."},
      {purpose:"ending",line:"«Ты всё-таки пришёл.»",action:"Музыка обрывается. Актёр произносит реплику тихо и очень лично, впервые без защиты жанра.",durationSec:4,editIntent:"Тишина после реплики; завершить на действительном изменении отношения."},
    ],
  }),
];

/** This records a human decision; it is never independent AI critique. */
export interface PersonaCreativeReviewSignoff {
  revisionId:string;
  reviewer:"author";
  decision:"needs_revision"|"ready_for_author";
  comment:string;
  createdAt:string;
}

export function assertPersonaCreativeReviewSignoff(
  revisionId:string,
  review:PersonaCreativeReviewSignoff|undefined,
):void {
  if(!review||review.revisionId!==revisionId||review.reviewer!=="author"||
    review.decision!=="ready_for_author"||review.comment.trim().length<20||
    !Number.isFinite(Date.parse(review.createdAt)))
    throw new Error("Перед утверждением сценария нужна осознанная авторская оценка творческих рисков текущей редакции.");
}


/**
 * Pure, non-destructive import into an existing project. A real existing script
 * and its approval can never be overwritten by choosing an alternative card.
 */
export function stagePersonaCreativeConcept(
  workspace:PersonaScenarioWorkspace,
  selected:PersonaCreativeConcept,
  createdAt:string,
):PersonaScenarioWorkspace {
  if(!personaFirstReelConcepts.some(item=>item.id===selected.id))
    throw Error("Unrecognized creative concept");
  if(workspace.ideas.some(item=>item.id===selected.id))return workspace;
  const ideas=[...workspace.ideas,selected.idea];
  if(workspace.script)return {...workspace,ideas};
  const script=createScenarioScript(selected.idea,{
    createdAt,beats:selected.beats,
    sourceFacts:["Авторская редакторская гипотеза. Популярность и реальная съёмка не проверены."],
  });
  return {...workspace,ideas,selectedIdeaId:selected.idea.id,script};
}
