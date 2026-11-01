import {buildPersonaProductionBrief, type PersonaProductionBrief, type PersonaProductionIdea} from '../../../packages/core/src/persona-production-brief';

/** Editorial notes only. The approved script, rendering manifest and publication gate
 * remain in their existing authoritative project records. */
export type GuideField='audience'|'viewerPromise'|'topicEvidence'|'location'|'setArrangement'|'camera'|
 'keyLight'|'sound'|'wardrobeProps'|'editing'|'captions'|'color'|'safetyNotes';
export type GuideCheck='research'|'script'|'set'|'lighting'|'sound'|'takes'|'editReview';
export const guideChecks:[GuideCheck,string][]=[
 ['research','Проверил актуальность темы и источники; непроверенные утверждения не озвучиваю'],
 ['script','Проговорил хук и все реплики вслух; утверждена только моя редакция'],
 ['set','Уточнил помещение, фон, реквизит, расположение камеры и направление взглядов'],
 ['lighting','Проверил лицо, тени и блики на очках; зафиксировал баланс белого'],
 ['sound','Проверил микрофон, отсутствие клиппинга и записал комнатный тон'],
 ['takes','Выбрал необходимые дубли и отдельно отметил удачные актёрские исполнения'],
 ['editReview','Проверил порядок склеек, паузы, титры, музыку и цвет до финального решения'],
];
export interface PersonaProductionGuide{
 version:1;
 fields:Record<GuideField,string>;
 checks:Partial<Record<GuideCheck,boolean>>;
 updatedAt:string;
}
export const guideFieldLabels:Record<GuideField,string>={
 audience:'Кому адресован ролик',
 viewerPromise:'Что зритель поймёт или почувствует в конце',
 topicEvidence:'Почему тема актуальна · ссылки, дата и что именно подтверждают',
 location:'Точное место съёмки (подтвердить лично)',
 setArrangement:'Как стоят актёр, клавиши, фон и реквизит',
 camera:'Камера, план, ракурс и расстояние',
 keyLight:'Рисунок света и практическая проверка',
 sound:'Запись речи, музыка и контроль звука',
 wardrobeProps:'Костюм и предметы для ролей',
 editing:'Порядок сцен, паузы и предварительные склейки',
 captions:'Субтитры, графика, safe area',
 color:'Цвет, кожа и контроль согласованности',
 safetyNotes:'Что проверить до съёмки и какие риски остались',
};
/** The example is specific to this opt-in project, not a global Reel template. */
export const actorComposerPilot={
 title:'Актёр и композитор — колыбельная',
 angle:'Два срочных дела превращают «колыбельную» в финал триллера. Оригинальная комедийная сценка на 31 секунду.',
} as const;
export function isActorComposerPilot(value:{title:string;angle:string}):boolean{
 return value.title===actorComposerPilot.title&&value.angle===actorComposerPilot.angle;
}
/** New projects must not silently inherit the actor-and-composer story. */
export const generalGuideFields:Record<GuideField,string>={
 audience:'Определите конкретную аудиторию: кого история должна заинтересовать и почему.',
 viewerPromise:'Что изменится для зрителя за время ролика? Какую эмоцию или открытие он получит?',
 topicEvidence:'Творческая гипотеза. Добавьте проверяемые датированные источники и опишите, что именно они подтверждают.',
 location:'Укажите реально доступное и разрешённое для съёмки место. Не выдавайте предложение за подтверждение.',
 setArrangement:'Опишите фон, направление взглядов, точки актёра и положение реквизита; проверьте ось съёмки.',
 camera:'Вертикально 9:16, смартфон на устойчивой опоре; выберите план, высоту и дистанцию для каждого кадра. Проверьте экспозицию и частоту кадров.',
 keyLight:'Основной мягкий свет чуть выше уровня глаз, без пересветов лица; проверьте тени, отражения и мерцание. Зафиксируйте баланс белого.',
 sound:'Запишите пробную реплику, проверьте шум, уровень и понятность речи; сохраните 10 секунд комнатного тона.',
 wardrobeProps:'Выберите костюм и реальные предметы, которые раскрывают действие. Уберите личные данные и чужие логотипы.',
 editing:'Сначала определить хук, развитие, поворот, финал и необходимые реакции. Монтажные склейки и музыкальные акценты привязать к смыслу сцен.',
 captions:'Субтитры из утверждённых реплик, синхронно с голосом; не закрывать глаза, руки и важный объект, проверить safe area.',
 color:'Естественная фактура кожи, нейтральный баланс белого и сопоставимость планов; любые стилизации сравнить на одних и тех же кадрах.',
 safetyNotes:'Нельзя автоматически считать готовыми сюжет, факты, права на музыку и художественный результат. Все решения проверяет автор.',
};
export const defaultGuideFields:Record<GuideField,string>={
 audience:'Зрители, которым интересны актёрская игра, юмор и создание музыки. Проверить на реальных публикациях.',
 viewerPromise:'Через комедийную сценку увидеть, как музыка мгновенно меняет жанр истории.',
 topicEvidence:'Гипотеза автора, а не подтверждённый тренд. Добавить свежие датированные источники во вкладке «Сценарий» и записать, что они доказывают.',
 location:'Предложение: одна тихая домашняя комната. Уточнить фактическое помещение и доступность фортепиано.',
 setArrangement:'Две зоны в одной комнате: актёр — нейтральный фон, композитор — клавиши. Условную ось диалога не менять: актёр смотрит вправо, композитор — влево.',
 camera:'Смартфон на устойчивом штативе, вертикально 9:16, основной объектив 1×, без цифрового зума. На уровне глаз; крупность менять перестановкой штатива. Начать с 1080×1920, 30 fps; проверить мерцание света.',
 keyLight:'Один мягкий источник сбоку под 30–45°, чуть выше уровня глаз; одинаковая температура для обеих ролей. Перед дублем проверить пересветы кожи, тени и отражение в очках.',
 sound:'Микрофон ближе к лицу и вне кадра; 10 секунд room tone; короткий тест записи. Собственный музыкальный акцент — отдельно после реплики B03, не под голосом.',
 wardrobeProps:'Актёр: пиджак и папка с текстом. Композитор: футболка с закатанными рукавами и клавиши. Без чужих логотипов и личных данных в кадре.',
 editing:'Если выбран семисценный пример: A01 → B01 → A02 → B02 → A03 → B03 → A04; жёсткие склейки по действиям/репликам; в B03 музыкальный акцент, затем реакция и панчлайн A04.',
 captions:'Точные слова из утверждённого сценария, синхронно с голосом. Не закрывать лицо, очки, руки на клавишах; проверить safe area Reels.',
 color:'Сначала нейтральная экспозиция и баланс белого; сохранить естественную кожу, лицо, очки и геометрию. Обработка сравнивается на одинаковых кадрах, не утверждается автоматически.',
 safetyNotes:'Это план, а не свидетельство готовой съёмки. Актуальность темы, помещение, доступные инструменты, актёрские решения и права на музыку подтверждает автор.',
};
export const exampleActorComposerBeats=[
 {id:'A01',seconds:3,line:'Я актёр. И ещё пишу музыку.',framing:'Крупный план',action:'Взгляд в объектив, лёгкая улыбка; без заставки.',lighting:'Мягкий боковой свет; глаза на верхней трети.'},
 {id:'B01',seconds:4,line:'И у нас есть проблема.',framing:'Средний план у клавиш',action:'Сухой тон, пауза перед «проблема».',lighting:'Тот же свет и баланс белого.'},
 {id:'A02',seconds:5,line:'Завтра проба. Текст ещё не выучен.',framing:'Средний план',action:'Папка в руках, взгляд на часы, затем к композитору.',lighting:'Лицо не перекрыто предметами.'},
 {id:'B02',seconds:5,line:'А мне к утру сдать аранжировку.',framing:'Лицо и клавиши в кадре',action:'Кладёт руки на клавиши и показывает дедлайн без личных данных.',lighting:'Не терять детали рук и клавиш.'},
 {id:'A03',seconds:4,line:'Значит, кто-то сегодня не спит.',framing:'Крупный план',action:'Бровь, закрыть папку; оставить полсекунды реакции.',lighting:'Экспозиция как в A01.'},
 {id:'B03',seconds:6,line:'Нет. Я усыплю нас колыбельной.',framing:'Средний план за клавишами',action:'Реплика → короткий оригинальный тревожный музыкальный мотив.',lighting:'Сохранить видимость лица и пальцев.'},
 {id:'A04',seconds:4,line:'Это колыбельная? Это финал триллера.',framing:'Крупный план',action:'Сначала услышать музыку, затем повернуться к камере; панчлайн.',lighting:'Как в A01/A03.'},
] as const;

/** Proposed directions for the original seven-shot pilot, not a measurement of the user's room. */
export const actorComposerShotDirections:Readonly<Record<string,{camera:string;performance:string;edit:string}>>={
 A01:{camera:'Штатив на уровне глаз, ориентир 0,9–1,3 м до лица; кадр от груди, задняя камера 1×, вертикально 9:16.',
  performance:'Начать с прямого взгляда, короткая пауза после «актёр»; лёгкая улыбка без переигрывания.',
  edit:'Открыть сразу речью, без заставки. Склейка на смену роли после «музыку».'},
 B01:{camera:'Штатив дальше: ориентир 1,4–2 м, средний план с клавишами в нижней трети; не заваливать горизонт.',
  performance:'Сухо, будто композитор уверен, что проблема очевидна. Взгляд в сторону актёра.',
  edit:'Оставить микропаузу после «проблема». Жёсткая склейка на ответ актёра.'},
 A02:{camera:'Средний план от пояса или чуть выше; видна папка, лицо не перекрыто. Ось взгляда в сторону композитора.',
  performance:'Кратко показать срочность: взглянуть на текст, затем на часы. Не играть панику заранее.',
  edit:'Склейка по движению папки или на последнем слове «выучен».'},
 B02:{camera:'Лицо и клавиши одновременно в безопасной зоне кадра. Примерный ориентир 1,4–2 м; проверить видимость рук.',
  performance:'Точная сухая реплика, взгляд на клавиши и дедлайн. Руки не должны закрывать глаза.',
  edit:'Резать на контраст спокойного тона и растущей срочности, без декоративного перехода.'},
 A03:{camera:'Крупный план как A01; повторить высоту штатива и расстояние, чтобы монтаж выглядел целостным.',
  performance:'Бровь и закрытие папки, затем выдержать полсекунды реакции.',
  edit:'Оставить паузу перед ответом композитора; не ускорять шутку автоматически.'},
 B03:{camera:'Средний план у клавиш. Отдельно записать запасной чистый дубль рук и музыкального действия.',
  performance:'Сначала невозмутимая реплика; затем короткий собственный тревожный музыкальный акцент.',
  edit:'Музыка только ПОСЛЕ речи. Выдержать 2,12 с оригинального музыкального акцента, проверить точную длительность при монтаже.'},
 A04:{camera:'Крупный план, близкий к A01/A03. Камера неподвижна, глаза читаются, лицо целиком в кадре.',
  performance:'Сначала услышать неожиданный мотив, затем взгляд в камеру и панчлайн с возмущённым удивлением.',
  edit:'Реакция → панчлайн → короткий выход. Не перебивать финальную реплику фоновой музыкой.'},
};
export const exampleActorComposerSourceFiles:Readonly<Record<string,string>>={
 A01:'A01_actor_hook_take01.mp4',
 B01:'B01_composer_problem_take01.mp4',
 A02:'A02_actor_audition_take01.mp4',
 B02:'B02_composer_deadline_take01.mp4',
 A03:'A03_actor_sleep_take01.mp4',
 B03:'B03_composer_lullaby_take01.mp4',
 A04:'A04_actor_payoff_take01.mp4',
};
export function createPersonaProductionGuide(now:string,preset:'general'|'actor_composer'='general'):PersonaProductionGuide{
 return {version:1,fields:{...(preset==='actor_composer'?defaultGuideFields:generalGuideFields)},checks:{},updatedAt:now};
}
/** A changed production decision invalidates attestations that depended on it. */
export function reviseGuideField(guide:PersonaProductionGuide,field:GuideField,value:string,now:string):PersonaProductionGuide{
 if(guide.fields[field]===value)return guide;
 const invalidates:Partial<Record<GuideField,GuideCheck[]>>={
  audience:['research'],viewerPromise:['research'],topicEvidence:['research'],
  location:['set','takes','editReview'],setArrangement:['set','takes','editReview'],
  camera:['set','takes','editReview'],wardrobeProps:['set','takes','editReview'],
  keyLight:['lighting','takes','editReview'],
  sound:['sound','takes','editReview'],
  editing:['editReview'],captions:['editReview'],color:['editReview'],
 };
 const checks={...guide.checks};
 for(const check of invalidates[field]??[])delete checks[check];
 return {...guide,fields:{...guide.fields,[field]:value},checks,updatedAt:now};
}
export function validatePersonaProductionGuide(value:unknown):value is PersonaProductionGuide{
 if(!value||typeof value!=='object')return false;
 const x=value as Partial<PersonaProductionGuide>;
 if(x.version!==1||!x.fields||typeof x.fields!=='object'||!x.checks||typeof x.checks!=='object'||
  typeof x.updatedAt!=='string'||!Number.isFinite(Date.parse(x.updatedAt)))return false;
 const fieldKeys=Object.keys(defaultGuideFields) as GuideField[];
 if(fieldKeys.some(key=>typeof x.fields?.[key]!=='string'||x.fields[key].length>6000))return false;
 return Object.entries(x.checks).every(([key,val])=>guideChecks.some(([check])=>check===key)&&typeof val==='boolean');
}
export function productionGuideScenes(brief:PersonaProductionBrief|null){
 if(!brief||!Array.isArray(brief.script)||!Array.isArray(brief.shots)||brief.script.length!==brief.shots.length)
  return exampleActorComposerBeats.map(beat=>({...beat,source:'example' as const}));
 return brief.script.map((beat,i)=>({
  id:String(beat.order),seconds:beat.durationSec,line:beat.line,
  framing:brief.shots[i].framing,action:beat.action,
  lighting:brief.shots[i].lighting,source:'brief' as const,
 }));
}
/** Explicit click creates an editable, unapproved working candidate in the canonical
 * Scenario/Production Brief workflow; nothing is auto-approved or rendered. */
export function createActorComposerWorkingBrief(idea:PersonaProductionIdea,guide:PersonaProductionGuide):PersonaProductionBrief{
 const base=buildPersonaProductionBrief({idea});
 const script=exampleActorComposerBeats.map((beat,i)=>({
  order:i+1,durationSec:beat.seconds,line:beat.line,action:beat.action,
 }));
 const framings:PersonaProductionBrief['shots'][number]['framing'][]=[
  'close-up','medium','medium','medium','close-up','medium','close-up'
 ];
 const shots=exampleActorComposerBeats.map((beat,i)=>({
  order:i+1,durationSec:beat.seconds,framing:framings[i],
  angle:beat.framing+' · '+(beat.id.startsWith('A')?'Актёр обращён вправо или в камеру':'Композитор у клавиш, взгляд влево'),
  cameraMovement:'Камера на штативе, без движения',
  lighting:beat.lighting,action:beat.action+'; исходник '+exampleActorComposerSourceFiles[beat.id],
 }));
 return {...base,hook:{...base.hook,firstSeconds:script[0].line,visual:exampleActorComposerBeats[0].action},
  script,shots,capture:{...base.capture,
   location:guide.fields.location,lighting:guide.fields.keyLight,
   wardrobe:guide.fields.wardrobeProps,
   props:[...base.capture.props,'Клавиши/фортепиано','Папка с текстом'],
   audio:{recording:guide.fields.sound,processing:base.capture.audio.processing},
  },
  postProduction:{...base.postProduction,
   transitions:guide.fields.editing,
   subtitles:{...base.postProduction.subtitles,instruction:guide.fields.captions},
   color:guide.fields.color},
  adaptations:Object.fromEntries(Object.entries(base.adaptations).map(([k,v])=>[k,{...v,durationSec:31}])) as PersonaProductionBrief['adaptations'],
 };
}
/** Self-contained, unapproved on-set handoff. No original assets, private paths or
 * implicit authorization to record, render or publish are included. */
export function exportPersonaShootingSheet(input:{
 title:string;angle:string;guide:PersonaProductionGuide;
 scenes:readonly {id:string;seconds:number;line:string;action:string;framing:string;lighting:string;camera?:string;performance?:string;edit?:string}[];
 references:readonly {title:string;url:string;observedAt:string;status:string}[];
 sample:boolean;
}):string{
 const {title,angle,guide,scenes,references,sample}=input;
 const lines=[
  '# Persona · Съёмочный лист',
  '',
  '**Статус:** РАБОЧИЙ ПЛАН · НЕ УТВЕРЖДЕНИЕ И НЕ РАЗРЕШЕНИЕ НА ПУБЛИКАЦИЮ',
  sample?'**Сцены:** демонстрационный пример — не перенесён в сценарий проекта.':'**Сцены:** из сохранённого сценария/Production Brief; проверить текущую редакцию.',
  '', '## Идея',title,angle,
  '', '## Проверка референсов',
  ...(references.length?references.map(ref=>`- ${ref.title}: ${ref.url} · ${ref.observedAt} · ${ref.status}`):['- Проверенные автором референсы пока не добавлены.']),
  '', '## Хук и реплики',
  ...scenes.flatMap(scene=>[
   `### ${scene.id} · ${scene.seconds} с · ${scene.framing}`,
   `Реплика: ${scene.line}`,
   `Действие: ${scene.action}`,
   `Свет: ${scene.lighting}`,
   ...(scene.camera?[`Камера: ${scene.camera}`]:[]),
   ...(scene.performance?[`Актёрское действие: ${scene.performance}`]:[]),
   ...(scene.edit?[`Монтаж: ${scene.edit}`]:[]),
   '',
  ]),
  '## Практический план',
  ...(Object.entries(guideFieldLabels) as [GuideField,string][]).flatMap(([id,label])=>[`### ${label}`,guide.fields[id],'']),
  '## Чек-лист перед съёмкой',
  ...guideChecks.map(([id,label])=>`- [${guide.checks[id]?'x':' '}] ${label}`),
  '',
  '## Финальные ограничения',
  'Перед реальной съёмкой автор проверяет местоположение, факты, кадр, права на музыку и окончательную редакцию текста.',
  'Исходники не изменялись. Выгрузка листа не означает художественный PASS, монтаж или публикацию.',
  '',
 ];
 return lines.join('\n');
}
export function guideProgress(guide:PersonaProductionGuide){
 return guideChecks.filter(([id])=>guide.checks[id]===true).length;
}
