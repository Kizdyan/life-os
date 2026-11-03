import {afterEach,describe,expect,it,vi} from 'vitest';
import director from '../../../api/persona-director.ts';

const idea={id:'reel-001',title:'Тестовая киносцена',angle:'Музыка меняет настроение актёра',format:'reel'};
const scenes=[
 {durationSec:4,line:'Я хочу снять спокойную сцену',action:'Актёр открывает сценарий',
  framing:'close-up',camera:'Статичная камера на уровне глаз',
  lighting:'Мягкий свет сбоку',performance:'Играть спокойно с сомнением',edit:'Резать на поворот'},
 {durationSec:4,line:'А я добавлю немного тревоги',action:'Композитор нажимает диссонанс',
  framing:'medium',camera:'Средний план у клавиш',lighting:'Оставить лицо читаемым',
  performance:'Сухая ирония',edit:'Оставить звук отдельно'},
 {durationSec:4,line:'Теперь это уже совсем другой герой',action:'Актёр меняет взгляд',
  framing:'close-up',camera:'Крупный план с того же места',lighting:'Тот же рисунок света',
  performance:'Напряжённая пауза',edit:'Склейка на взгляде'},
 {durationSec:4,line:'Значит, музыку оставляем в финале',action:'Композитор закрывает клавиши',
  framing:'detail',camera:'Деталь рук и клавиш',lighting:'Избегать отражений',
  performance:'Невозмутимый панчлайн',edit:'Закончить на музыкальном стопе'},
];
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()});
describe('Persona Director API real-model gate',()=>{
 it('refuses a request without configured REAL neural provider instead of returning templates',async()=>{
  vi.stubEnv('PERSONA_DIRECTOR_PROVIDER','');
  const response=await director.fetch(new Request('http://localhost/api/persona-director',{method:'POST',
   body:JSON.stringify({idea})}));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({error:'director_model_not_configured',realAI:false});
 });
 it('calls a configured local Ollama endpoint and returns only a validated genuine proposal',async()=>{
  vi.stubEnv('PERSONA_DIRECTOR_PROVIDER','ollama');
  vi.stubEnv('VERCEL_ENV','development');
  vi.stubEnv('PERSONA_OLLAMA_MODEL','mock-local-model');
  let called=false;
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,options?:RequestInit)=>{
   expect(String(input)).toBe('http://127.0.0.1:11434/api/chat');
   expect(options?.method).toBe('POST');
   const data=JSON.parse(String(options?.body));
   expect(data.model).toBe('mock-local-model');
   expect(data.messages[0].role).toBe('system');
   const modelInput=JSON.parse(data.messages[1].content);
   expect(modelInput.creativePreferences.priorities).toEqual(['Небанальный юмор']);
   expect(modelInput.avoidFailures).toEqual(['Без повторов прошлой шутки']);
   called=true;
   return new Response(JSON.stringify({message:{content:JSON.stringify({
    title:'Музыкальная сцена с поворотом',hook:'Музыка изменила роль',
    scenes,setup:{
     location:'Тихая домашняя комната с клавишами',camera:'Вертикальный штатив на уровне глаз',
     lighting:'Один мягкий боковой источник света',sound:'Петличка и комнатный тон',
     wardrobe:'Нейтральная футболка и пиджак',arrangement:'Две точки съёмки напротив друг друга',
    },editingIntent:'Склейки только по смыслу диалога',
    colorIntent:'Натуральная кожа и нейтральный баланс белого',
   })}}),{headers:{'content-type':'application/json'}});
  }));
  const response=await director.fetch(new Request('http://localhost/api/persona-director',{method:'POST',
   body:JSON.stringify({idea,variation:'humor',seed:'test-seed-5',
    creativePreferences:{priorities:['Небанальный юмор'],constraints:['Кожа натуральная']},
    avoidFailures:['Без повторов прошлой шутки']})}));
  expect(response.status).toBe(200);
  const result=await response.json();
  expect(called).toBe(true);
  expect(result.executionMode).toBe('ai');
  expect(result.provider).toBe('ollama');
  expect(result.model).toBe('mock-local-model');
  expect(result.scenes).toHaveLength(4);
  expect(result.publicationApproved).toBe(false);
  expect(result.renderedVideo).toBeUndefined();
 });
 it('rejects incomplete model output rather than substituting sample shots',async()=>{
  vi.stubEnv('PERSONA_DIRECTOR_PROVIDER','ollama');
  vi.stubEnv('VERCEL_ENV','development');
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({
   message:{content:JSON.stringify({title:'Empty',scenes:[]})},
  }))));
  const response=await director.fetch(new Request('http://localhost/api/persona-director',{method:'POST',
   body:JSON.stringify({idea})}));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({error:'director_model_structure_invalid',realAI:false});
 });
});
