import knowledge from '../../../knowledge_base.json' with {type:'json'};
import visualIdentity from '../../../config/persona-visual-identity.json' with {type:'json'};
import {personaLightingPlan} from './persona-lighting.mjs';

export const ARSENAL_VERSION=1;
export function arsenalKnowledge(){
 if(knowledge.version!==1||knowledge.rules.length!==10||new Set(knowledge.rules.map(x=>x.id)).size!==10)
  throw Error('Invalid Arsenal knowledge contract');
 return structuredClone(knowledge);
}
export function visualIdentityConfig(){
 if(visualIdentity.version!==1||!/^#[0-9a-fA-F]{6}$/.test(visualIdentity.colors.ink))
  throw Error('Invalid Persona visual identity');
 return structuredClone(visualIdentity);
}
export function arsenalRule(id){
 return arsenalKnowledge().rules.find(rule=>rule.id===id)??null;
}

const profiles={
 drama:{
  conflict:'Герой хочет вернуть доверие, но собеседник не готов слушать',
  beats:[
   ['Ты всё ещё считаешь, что я ушёл?', 'Неподвижно смотрит на пустой стул. Не объясняется.', 'face',6,'Крупный план, взгляд ниже объектива; держать паузу.'],
   ['Нет ответа. И не будет.', 'Медленно кладёт на стол неотправленное письмо. Рука замирает.', 'object',7,'Деталь бумаги, чернила, пальцы; без съёмки огня без техники безопасности.'],
   ['Я тогда испугался.', 'Смена крупного плана: попытка выдавить улыбку, затем честное признание.', 'face',8,'Одна поза, два состояния; отметь позицию штатива для Match Cut.'],
   ['Сначала — за себя.', 'В том же положении меняет одежду/пластику; короткий Match Cut.', 'match_cut',7,'Та же высота камеры, взгляд и положение тела до/после смены образа.'],
   ['А потом понял: дело было не во мне.', 'Переворачивает фотографию лицом вниз; задерживается на пальцах.', 'object',8,'Смысловая деталь, затем возврат к лицу по движению руки.'],
   ['Если захочешь — я здесь.', 'Молчит и выбирает не уходить. Финал без морали.', 'face',9,'Крупный план, удержать актёрское решение и тишину.'],
  ]
 },
 comedy:{
  conflict:'Герой хочет безупречно пройти прослушивание, но предметы начинают разрушать его план',
  beats:[
   ['Начинаем? Я абсолютно готов.', 'Собранная улыбка, идеально выпрямленная осанка.', 'face',6,'Средний план, внятная начальная уверенность.'],
   ['У меня даже план записан.', 'Вид сверху: раскладывает карточки и реквизит по линейке.', 'top_down',8,'Top-down Flat lay; смартфон закрепить над столом безопасно.'],
   ['Вот здесь написано: не паниковать.', 'Рука убирает карточку с пометкой «ПАНИКА»; открывает следующую.', 'object',7,'Смешное раскрытие через предметную крупность и руки.'],
   ['Я в порядке. Я в порядке.', 'Тот же ракурс, но новая пластика и костюм: Match Cut двух характеров.', 'match_cut',7,'Совпадающая поза и крупность; актёрская смена темперамента.'],
   ['Кажется, осталось просто молчать.', 'Снимает с себя бейдж, кладёт его рядом с будильником.', 'object',7,'Негромкая предметная реакция; не перегружать графикой.'],
   ['Это я точно умею.', 'Смотрит в объектив. Пауза длится на секунду дольше ожидаемой.', 'face',9,'Ироничный финал актёрским таймингом, без смешных звуков-подсказок.'],
  ]
 },
 musical:{
  conflict:'Герой пытается спрятать переживание, но оно слышно в каждой следующей ноте',
  beats:[
   ['Не спрашивай, как дела.', 'Герой отказывается встречаться взглядом с собеседником.', 'face',6,'Крупный план с напряжением и недосказанностью.'],
   ['Я лучше сыграю.', 'Опускает ладонь на клавиши; одну ноту нажимает слишком рано.', 'object',7,'Крупно пальцы и клавиши; обеспечить ясный звук без клиппинга.'],
   ['Это была не та нота.', 'Улыбка быстро исчезает: контролируемая актёрская перемена.', 'face',8,'Сдержанная реакция, пауза перед следующей фразой.'],
   ['Хотя…', 'Match Cut: в той же позе другой характер и другая музыкальная интонация.', 'match_cut',7,'Совпадающая позиция тела; смена костюма и музыкального мотива.'],
   ['Наверное, именно эта.', 'Повторяет необычную ноту как часть новой короткой авторской темы.', 'object',8,'Клавиши и лицо чередуются; звук записывается отдельно при необходимости.'],
   ['Ладно. Теперь можно спросить.', 'Герой впервые смотрит прямо на человека, которому играет.', 'face',9,'Актёрское решение, не мотивационный лозунг.'],
  ]
 }
};
const formatTime=duration=>String(Math.floor(duration/60)).padStart(2,'0')+':'+String(duration%60).padStart(2,'0');
export function buildAssociativeEditPlan(shots, availableAssets=[]){
 const rule=arsenalRule('KB-04');
 if(!rule||rule.area!=='editing')throw Error('Missing Arsenal associative edit rule');
 if(!Array.isArray(shots)||shots.length<2||shots.length>30||
  !shots.every(s=>s&&typeof s.action==='string'&&typeof s.kind==='string'))
  throw Error('EditPlan requires 2–30 described shots with kind and action');
 if(!Array.isArray(availableAssets))throw Error('Expected reviewed assets array');
 let previous=null;
 const beats=shots.map((shot,index)=>{
  const isFace=['face','match_cut'].includes(shot.kind);
  const purpose=isFace?'actor_performance':'associative_object';
  const approved=availableAssets.find(asset=>asset.shotId===shot.id&&asset.isVerified===true&&
   asset.rightsConfirmed===true&&asset.authorReviewed===true&&asset.approvedForEdit===true);
  const change=previous!==null&&previous!==purpose;
  previous=purpose;
  return {order:index+1,shotId:shot.id,purpose,editIntent:change?
   (isFace?'Вернуться с предметной детали к реакции и пластике актёра':'Предметная крупность связывает реакцию с действием; без случайного B-roll'):
   (isFace?'Держать лицо, актёрский подтекст и паузу':'Снимать предмет только с конкретным смысловым мотивом'),
   mediaStatus:approved?'reviewed_media_available':'awaiting_author_footage',
   ...(approved?{approvedAssetId:approved.assetId}:{}),authorReviewRequired:true};
 });
 return {version:1,kind:'persona-associative-edit-plan-v1',status:'intent_only',palette:visualIdentity.id,
  rule:rule.id,publicationApproved:false,beats};
}
export function generateActorPortfolio({id,title,genre='drama',now=new Date().toISOString()}){
 for(const rule of ['KB-01','KB-02',...(genre==='comedy'?['KB-03']:[])])
  if(!arsenalRule(rule))throw Error('Missing required Arsenal actor reference: '+rule);
 if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(id))throw Error('Invalid portfolio project ID');
 if(typeof title!=='string'||title.trim().length<3||title.length>120)throw Error('Enter a 3–120 character project title');
 if(!Object.hasOwn(profiles,genre))throw Error('Genre must be drama, comedy or musical');
 if(!Number.isFinite(Date.parse(now)))throw Error('Invalid creation time');
 const data=profiles[genre];
 let from=0;
 const shots=data.beats.map(([line,action,kind,seconds,camera],i)=>{
  const shot={id:'P'+String(i+1).padStart(2,'0'),order:i+1,startSec:from,durationSec:seconds,
   line,action,kind,camera,performance:kind==='face'?'Задача героя: достичь своего вопреки препятствию.':kind==='match_cut'?'Играть новую позицию персонажа, а не только переодеться.':'Реакцию передать через темп движения рук.',
   framing:kind==='face'?'close-up':kind==='top_down'?'top-down':kind==='match_cut'?'matched-medium':'detail',
   lighting:personaLightingPlan(genre==='drama'?action+' драматичная сцена':genre==='musical'?action+' актёр за пианино':action+' интервью'),
   mediaStatus:'not_recorded',editorialApproved:false};
  from+=seconds;
  return shot;
 });
 if(from<30||from>60)throw Error('Actor portfolio requires 30–60 seconds');
 const editPlan=buildAssociativeEditPlan(shots);
 return {version:1,kind:'actor_portfolio',id,title:title.trim(),genre,conflict:data.conflict,
  purpose:'Демонстрация актёрского диапазона для кастинг-директоров и режиссёров',
  durationSec:from,firstFrameHook:shots[0].line,visualIdentity:visualIdentity.id,
  scriptStatus:'template_draft_pending_author_review',publicationApproved:false,
  script:shots.map(({id,line,action,durationSec})=>({id,line,action,durationSec})),
  storyboard:shots,editPlan,createdAt:now,updatedAt:now};
}
export function isActorPortfolio(value){
 return Boolean(value&&value.version===1&&value.kind==='actor_portfolio'&&
  typeof value.id==='string'&&typeof value.title==='string'&&
  ['drama','comedy','musical'].includes(value.genre)&&
  Array.isArray(value.storyboard)&&value.storyboard.length===6&&
  value.storyboard.every(s=>s.mediaStatus==='not_recorded')&&
  Number.isFinite(value.durationSec)&&value.durationSec>=30&&value.durationSec<=60&&value.publicationApproved===false);
}
