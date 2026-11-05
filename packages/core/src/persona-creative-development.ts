import type {
  ScenarioIdea, ScenarioScriptBeat, ScenarioCreativeProfile,
} from "./persona-scenario-intelligence";

/**
 * Original, human-authored EDITORIAL PROPOSALS. This module does not execute
 * models, watch trends, estimate retention, verify music, or approve filming.
 */
export type CreativeLens = "producer" | "dramaturg" | "director" | "reels" | "marketing";
export type CreativeEditorialNote = {
  lens: CreativeLens;
  merit: string;
  risk: string;
  revision: string;
};
export type PersonaCreativeConcept = {
  id: string;
  title: string;
  mechanism: "genre_collision" | "deadline_escalation" | "performance_contrast";
  logline: string;
  audienceHook: string;
  performerOpportunity: string;
  musicPurpose: string;
  productionConstraint: string;
  editorialStatus: "requires_author_review";
  provenance: "human_authored_proposal";
  beats: ScenarioScriptBeat[];
  critique: CreativeEditorialNote[];
};
export type CreativeScreenFinding = {
  id: "expository_first_line" | "emotion_without_action" | "missing_sound_design";
  beat: number;
  rationale: string;
  revision: string;
};
export type CreativeScreenResult = {
  method: "deterministic_preflight";
  status: "requires_human_creative_review";
  findings: CreativeScreenFinding[];
  notice: string;
};

const critiques = (
  producer: [string,string,string],
  dramaturg: [string,string,string],
  director: [string,string,string],
  reels: [string,string,string],
  marketing: [string,string,string],
): CreativeEditorialNote[] => ([
  ["producer",producer],["dramaturg",dramaturg],["director",director],
  ["reels",reels],["marketing",marketing],
] as const).map(([lens,[merit,risk,revision]])=>({lens,merit,risk,revision}));

const concept = (data:PersonaCreativeConcept):PersonaCreativeConcept => data;

/** Three DIFFERENT dramatic mechanisms, not three paraphrases of one script. */
export const actorComposerCreativeConcepts: readonly PersonaCreativeConcept[] = [
  concept({
    id:"wrong-soundtrack",title:"Не тот саундтрек",mechanism:"genre_collision",
    logline:"Актёр пытается сыграть нежную встречу. Композитор упорно превращает её в тревожный триллер.",
    audienceHook:"Нежная реплика обрывается неожиданно страшным аккордом в первые секунды.",
    performerOpportunity:"Резкая, но достоверная смена актёрских обстоятельств; один исполнитель играет обе стороны.",
    musicPurpose:"Две собственные, резко контрастные музыкальные фразы меняют смысл одной сцены.",
    productionConstraint:"Один телефон, два устойчивых положения камеры, клавиши; без второго актёра.",
    editorialStatus:"requires_author_review",provenance:"human_authored_proposal",
    beats:[
      {purpose:"hook",durationSec:3,line:"Я тебя нашёл.",
       action:"Актёр тянется к воображаемому партнёру. На последнем слове из-за кадра резко входит тревожный аккорд.",
       editIntent:"Открыть на самом действии; музыку ввести на последнем слове, без заставки."},
      {purpose:"development",durationSec:5,line:"Это сцена свидания. Можно немного нежнее?",
       action:"Актёр выходит из роли, поворачивается к пианисту. Не играть раздражение заранее: сначала искренне просить.",
       editIntent:"Резкая склейка к композитору по повороту головы; короткая тишина перед ответом."},
      {purpose:"development",durationSec:5,line:"Я и написал музыку к свиданию.",
       action:"Композитор невозмутимо повторяет мотив, но гармония становится ещё тревожнее.",
       editIntent:"Показать руки и лицо одновременно. Сохранить слышимую собственную музыку, не заменять библиотекой."},
      {purpose:"ending",durationSec:6,line:"Слушай… а точно оба героя выживут?",
       action:"Актёр снова примеряет нежную улыбку, слышит финальный диссонанс и моментально теряет уверенность.",
       editIntent:"Конец держать на реакции, не добавлять титр с объяснением шутки."},
    ],
    critique:critiques(
      ["Один сетап и две роли позволяют снять за один день.","Музыкальная шутка может выглядеть вторичной без действительно выразительной композиции.","Подготовить оригинальные 2–3 секунды музыкального контраста до съёмки."],
      ["Конфликт считывается без знакомства с героем.","Финальная фраза ещё объясняет шутку и может ослабить немую реакцию.","Снять альтернативный финал без слов, сравнить версии по комедийному ритму."],
      ["Есть конкретное актёрское действие и смена обстоятельств.","Слишком явное раздражение разрушит контраст.","Первые два дубля сыграть совершенно серьёзно; реакцию строить от звука."],
      ["Событие случается в первые три секунды.","Если музыкальный удар будет тихим, холодный вход не сработает.","Первым кадром дать жест и акустический поворот, а не представление профессий."],
      ["Актёр и композитор показаны в работе, а не названы.","Зритель может принять мотив за чужой саундтрек.","В описании корректно указать авторство оригинальной музыки, без рекламного титра посреди шутки."]
    ),
  }),
  concept({
    id:"two-deadlines",title:"Два дедлайна",mechanism:"deadline_escalation",
    logline:"Один человек должен репетировать текст и одновременно дописать музыку. Каждая попытка спасти одну задачу уничтожает другую.",
    audienceHook:"Крупный план часов и почти законченной реплики, которую перебивает фортепиано.",
    performerOpportunity:"Разные физические ритмы двух персонажей: актёр стремится к сосредоточенности, композитор слышит музыку во всём.",
    musicPurpose:"Мотив вторгается в репетицию и становится монтажным ритмом всей сцены.",
    productionConstraint:"Статичный телефон, две позиции, часы без ложной привязки к реальному расписанию.",
    editorialStatus:"requires_author_review",provenance:"human_authored_proposal",
    beats:[
      {purpose:"hook",durationSec:3,line:"Итак. Встреча состоялась в…",
       action:"Актёр смотрит в распечатку; на середине фразы из соседней зоны ударяет аккорд.",
       editIntent:"Начать на обрыве репетиции, без пояснения кто перед нами."},
      {purpose:"development",durationSec:5,line:"Я пытаюсь выучить текст.",
       action:"Актёр удерживает страницу пальцем, медленно разворачивается в сторону клавиш.",
       editIntent:"Склейка по направлению взгляда, оставить ощущение реального пространства."},
      {purpose:"development",durationSec:5,line:"Я тоже пытаюсь его закончить.",
       action:"Композитор принимает слово «текст» за музыкальную фразу, записывает пару нот и проверяет их на клавишах.",
       editIntent:"Небольшой музыкальный мотив поддерживает, а не перекрывает речь."},
      {purpose:"development",durationSec:4,line:"Я сейчас забуду вообще всё!",
       action:"Актёр закрывает глаза, начинает реплику и непроизвольно отбивает ритм услышанной мелодии.",
       editIntent:"Монтажный темп ускоряется только после двух первых спокойных кадров."},
      {purpose:"ending",durationSec:5,line:"Отлично. Теперь это припев.",
       action:"Композитор записывает ритм. Актёр молча смотрит на ставшую бесполезной страницу.",
       editIntent:"Окончить на безмолвной реакции: ни логотипа, ни поясняющего титра."},
    ],
    critique:critiques(
      ["Ситуация допускает серию «две профессии спорят».","Конфликт дедлайнов сам по себе не уникален.","Сохранить главный музыкальный поворот, убрать общие жалобы на занятость."],
      ["Действия причинно связаны: музыка действительно мешает учить текст.","Последняя реплика может быть предсказуема.","Проверить вариант, где актёр сам неожиданно продолжает мелодию."],
      ["Два темпоритма дают актёрский диапазон.","Без контраста пластики получится спор двух говорящих голов.","Ввести реальное физическое действие с листом и клавиатурой в каждом дубле."],
      ["Обрыв текста в первом кадре потенциально цепляет.","Пять склеек могут оказаться повтором одинаковой композиции.","Чередовать крупность по действию, а не просто по персонажу."],
      ["Ремесло показано в процессе.","Можно получить образ вечно неуспевающего творческого человека.","В конце сделать композитора находчивым, а не некомпетентным."]
    ),
  }),
  concept({
    id:"three-genres",title:"Одна реплика — три жанра",mechanism:"performance_contrast",
    logline:"Одна фраза в трёх разных актёрских трактовках превращается в три истории благодаря собственной музыке.",
    audienceHook:"Сразу реплика в эмоционально узнаваемой ситуации; затем резкий жанровый переворот.",
    performerOpportunity:"Достоверные контрастные трактовки одной и той же фразы без смены текста.",
    musicPurpose:"Три коротких авторских мотива: лирический, комический, тревожный.",
    productionConstraint:"Один объектив и один фон; три варианта пластики, тембра, освещения и музыки.",
    editorialStatus:"requires_author_review",provenance:"human_authored_proposal",
    beats:[
      {purpose:"hook",durationSec:4,line:"Я знал, что ты придёшь.",
       action:"Актёр искренне и мягко встречает человека за кадром; слышен нежный фортепианный мотив.",
       editIntent:"Войти сразу в действие, никакой заставки «три жанра»."},
      {purpose:"development",durationSec:5,line:"Я знал, что ты придёшь.",
       action:"Тот же текст, но герой неловко торжествует; комический ритмический мотив меняет подтекст.",
       editIntent:"Match cut по положению глаз и тела, затем мгновенный контраст музыки."},
      {purpose:"development",durationSec:5,line:"Я знал, что ты придёшь.",
       action:"Герой почти не двигается, спокойно произносит слова и выдерживает паузу; тихий диссонанс создаёт тревогу.",
       editIntent:"Не повышать громкость ради страха; удержать лицо в тишине после фразы."},
      {purpose:"ending",durationSec:4,line:"",
       action:"Возврат к исходному положению, но герой уже смотрит на дверь совсем иначе; мелодия из начала возвращается в миноре.",
       editIntent:"Закончить зрительным рифмованием первого кадра, без рекламной реплики."},
    ],
    critique:critiques(
      ["Демонстрация актёрства и композиции в одном ясном формате.","Может превратиться в учебное упражнение без эмоционального сюжета.","Сделать в каждом жанре конкретное отношение к невидимому партнёру."],
      ["Одна фраза меняет смысл трижды.","Нет традиционной кульминации, финальный кадр зависит от музыкальной рифмы.","Сравнить законченный визуальный финал и короткое четвёртое прочтение."],
      ["Позволяет действительно оценить актёрский диапазон.","Карикатурность жанров испортит впечатление.","Играть реальные обстоятельства, не гримасничать под музыку."],
      ["Понятный повтор и быстрые контрасты потенциально удерживают.","Если все три кадра визуально одинаковы, зритель может пролистнуть.","Развести постановку по свету и действию, сохранив сравнимую крупность."],
      ["Чёткое доказательство двух компетенций без саморекламы.","Не каждый зритель поймёт, что музыка авторская.","Деликатно пояснить авторство в подписи, не делая его хук-объяснением."]
    ),
  }),
];

/** Does not turn subjective creative concerns into fake scores or "AI votes". */
export function screenCreativeDraft(beats:readonly ScenarioScriptBeat[]):CreativeScreenResult {
  const findings:CreativeScreenFinding[]=[];
  const first=beats[0];
  if(first && /^(?:я\s+(?:акт[её]р|композитор)|меня\s+зовут|всем\s+привет|сегодня\s+расскажу)\b/iu.test(first.line.trim())){
    findings.push({id:"expository_first_line",beat:1,
      rationale:"Первый кадр сообщает сведения об авторе, но не показывает самостоятельное событие или препятствие.",
      revision:"Проверить альтернативный вход с действием, звуком или неожиданным обстоятельством."});
  }
  beats.forEach((beat,index)=>{
    if(/^(?:уверенно|сухо|с\s+иронией|поднят(?:ая|ь)\s+бровь|сдержанная\s+реакция)[^,.]{0,100}$/iu.test(beat.action.trim())){
      findings.push({id:"emotion_without_action",beat:index+1,
        rationale:"Указано внешнее состояние, но не игровое действие с партнёром, предметом или целью.",
        revision:"Сформулировать, чего добивается персонаж и каким наблюдаемым действием."});
    }
  });
  if(beats.length>2 && !beats.some(b=>/музык|мелоди|звуч|звука|аккорд|пауза|тишин/iu.test(b.editIntent??""))){
    findings.push({id:"missing_sound_design",beat:0,
      rationale:"В монтажных указаниях не найдён звуковой замысел; это структурный риск, а не оценка будущего звука.",
      revision:"Описать тишину, вход музыкального мотива и момент его завершения до съёмки."});
  }
  return {method:"deterministic_preflight",status:"requires_human_creative_review",findings,
    notice:"Редакторский предварительный экран. Не является независимым анализом нейросетей, оценкой юмора, прогнозом просмотров или разрешением на съёмку."};
}

export function conceptToScenarioIdea(
  proposal:PersonaCreativeConcept,profile:ScenarioCreativeProfile
):ScenarioIdea {
  if(proposal.provenance!=="human_authored_proposal"||proposal.editorialStatus!=="requires_author_review")throw Error("Unreviewed provenance");
  return {
    id:"actor-composer-"+proposal.id,title:proposal.title,referenceIds:[],
    originalConflict:proposal.logline,actingTask:proposal.performerOpportunity,
    ending:proposal.beats.at(-1)?.action??"",productionComplexity:"low",
    productionRisk:proposal.productionConstraint,
    estimatedDurationSec:proposal.beats.reduce((sum,b)=>sum+b.durationSec,0),
    creativeProfileFit:profile.priorities.length?profile.priorities.join(", "):
      "Художественное соответствие Creative Profile требует подтверждения автора.",
    origin:"template_fallback",
    evidenceNote:"Три оригинальные редакторские гипотезы, без запуска модели, просмотра референсов или прогнозирования просмотров.",
  };
}

export function conceptToScenarioBeats(proposal:PersonaCreativeConcept):ScenarioScriptBeat[]{
  if(!proposal.beats.length||proposal.beats[0].purpose!=="hook"||
     proposal.beats.at(-1)?.purpose!=="ending")throw Error("Invalid creative proposal");
  return proposal.beats.map(beat=>({...beat}));
}
