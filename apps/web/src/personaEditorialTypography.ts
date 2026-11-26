import v2 from '../../../config/carousel-fridge-hum-v2.json';
import v3 from '../../../config/carousel-fridge-hum-v3.json';
export type EditorialHierarchy={kicker:string;headline:string;body:string;highlight?:string};
export function hierarchyCopy(s:EditorialHierarchy):string{
 return [s.kicker,s.headline,s.highlight,s.body].filter(Boolean).join('\n\n');
}
const attached=new Set('в во к ко с со у о об от до из за на по не но и а ли же без для при под над перед про что чтобы как'.split(' '));
/** Keep short Russian prepositions/conjunctions with the following word. */
export function wrapEditorialText(text:string,width:number,measure:(s:string)=>number):string[]{
 const lines:string[]=[];
 for(const paragraph of text.split('\n')){
  const words=paragraph.trim().split(/\s+/u).filter(Boolean),units:string[]=[];
  for(let i=0;i<words.length;i++){
   let unit=words[i];
   while(i+1<words.length&&attached.has(words[i].toLocaleLowerCase('ru').replace(/^[«„“"(]+|[»”"),.:;!?—]+$/gu,'')))unit+=' '+words[++i];
   units.push(unit);
  }
  let line='';
  for(const unit of units){
   if(measure(unit)>width)throw Error('Слово не помещается в текстовую зону');
   const candidate=line?line+' '+unit:unit;
   if(line&&measure(candidate)>width){lines.push(line);line=unit}else line=candidate;
  }
  if(line)lines.push(line);
 }
 return lines;
}

type Zone={x:number;y:number;width:number;height:number;size:number;align?:CanvasTextAlign};
export type HierarchyLayout={headline:Zone;kicker?:Zone;body?:Zone;highlight?:Zone};
export const HIERARCHY_LAYOUTS:readonly HierarchyLayout[]=[
 {headline:{x:100,y:900,width:880,height:350,size:90}},
 {headline:{x:100,y:150,width:820,height:450,size:88},body:{x:100,y:900,width:740,height:310,size:48}},
 {headline:{x:100,y:170,width:820,height:280,size:90},body:{x:100,y:720,width:740,height:520,size:48}},
 {headline:{x:100,y:150,width:820,height:300,size:88},body:{x:100,y:780,width:740,height:460,size:48}},
 {headline:{x:100,y:150,width:800,height:370,size:88},body:{x:100,y:870,width:740,height:380,size:44}},
 {headline:{x:100,y:520,width:880,height:340,size:88,align:'center'}},
 {headline:{x:100,y:350,width:880,height:370,size:88,align:'center'},body:{x:170,y:850,width:740,height:180,size:48,align:'center'}},
 {headline:{x:100,y:800,width:840,height:260,size:88},body:{x:100,y:1080,width:740,height:170,size:48}}
];

type CompositionInput={slides:readonly {id:string;text:string;headline?:string;body?:string}[];
 research?:{sourceItems:readonly {slideId:string;url:string}[]}};
export const SEMANTIC_COMPOSITION_VERSION='semantic-editorial-v1.0';
/** Adapt the normal research text format without inventing or dropping words. */
export function semanticEditorialCopy(slide:{text:string;headline?:string;body?:string;kicker?:string;highlight?:string}):EditorialHierarchy{
 if(slide.headline!==undefined){
  if(slide.kicker?.trim()||slide.highlight?.trim())throw Error('Перенесите надзаголовок и акцент в пояснение перед смысловой компоновкой. Исходный текст сохранён.');
  return {kicker:'',headline:slide.headline,body:slide.body??''};
 }
 const blocks=slide.text.trim().split(/\n\s*\n/u);
 if(blocks.length>1)return {kicker:'',headline:blocks[0],body:blocks.slice(1).join('\n\n')};
 const end=slide.text.search(/[.!?](?:\s|$)/u);
 if(slide.text.length>110&&end>=0&&end<130)
  return {kicker:'',headline:slide.text.slice(0,end+1),body:slide.text.slice(end+1).trim()};
 return {kicker:'',headline:slide.text,body:''};
}
type SemanticRole='hook'|'scene'|'number'|'contrast'|'process'|'turn'|'takeaway'|'explanation';
/** Meaning selects geometry, not a project id or slide-number template. No copy is rewritten. */
export function semanticEditorialComposition(post:CompositionInput,index:number):{role:SemanticRole;reason:string;layout:HierarchyLayout}{
 const slide=post.slides[index];if(!slide)throw Error('Нет слайда для композиции');
 const headline=slide.headline??'',body=slide.body??'',text=headline+' '+body;
 const role:SemanticRole=index===0?'hook':index===post.slides.length-1?'takeaway':
  /^\s*\d[\d\s.,]*\s*(?:Гц|сек|мин|%|лет|кадр)/iu.test(headline)?'number':
  /(?:предлага|разговор|персонаж|заправк|диалог)/iu.test(body)?'scene':
  /(?:вместо|а не|в отличие)/iu.test(text)?'contrast':
  /(?:заранее|обменивал|сотруднич|сведени[яе])/iu.test(body)?'process':
  /(?:не подсказывать|опору|неопределён|неизвест|ожидан)/iu.test(text)?'turn':
  'explanation';
 const layouts:Record<SemanticRole,HierarchyLayout>={
  hook:{headline:{x:100,y:170,width:880,height:650,size:108,align:'center'},body:{x:100,y:1060,width:660,height:190,size:60}},
  scene:{headline:{x:100,y:140,width:880,height:300,size:104},body:{x:100,y:790,width:800,height:450,size:62}},
  number:{headline:{x:100,y:130,width:780,height:310,size:188},body:{x:100,y:650,width:680,height:590,size:64}},
  contrast:{headline:{x:100,y:190,width:880,height:380,size:102},body:{x:100,y:820,width:840,height:420,size:62}},
  process:{headline:{x:100,y:130,width:800,height:400,size:102},body:{x:180,y:720,width:800,height:520,size:62}},
  turn:{headline:{x:100,y:390,width:880,height:430,size:100,align:'center'},body:{x:100,y:900,width:880,height:340,size:60,align:'center'}},
  takeaway:{headline:{x:100,y:130,width:880,height:310,size:90},body:{x:100,y:470,width:880,height:500,size:62}},
  explanation:{headline:{x:100,y:170,width:880,height:340,size:100},body:{x:100,y:710,width:820,height:530,size:62}}
 };
 const layout=layouts[role];
 return {role,reason:role==='hook'?'Первый экран: вопрос или тезис':role==='takeaway'?'Финал: вывод, не новый факт':
  role==='number'?'Числовое доказательство — визуальная доминанта':role==='contrast'?'Сопоставление двух решений':
  role==='process'?'Как работали специалисты':role==='turn'?'Смена зрительского понимания':
  role==='scene'?'Ситуация перед профессиональным объяснением':'Пояснение подтверждённого тезиса',layout};
}
/** Narrow, source-bound editorial transformation. Not general LLM writing or fact verification. */
export function suggestEvidenceHook(post:CompositionInput){
 for(const slide of post.slides){
  const claim=slide.body??'',match=claim.match(/на частоту\s+([\p{L}]+)/iu);
  const sources=post.research?.sourceItems.filter(s=>s.slideId===slide.id)??[];
  if(match&&/^\d[\d., ]*\s*Гц[.!]?$/iu.test(slide.headline??'')&&sources.length&&
   /(?:музык|композитор)/iu.test(claim))
   return {headline:'Зачем композитору\nчастота '+match[1].toLocaleLowerCase('ru')+'?',
    sourceSlideId:slide.id,sources:sources.map(s=>s.url),requiresAuthorReview:true as const,
    method:'Question derived from an explicit frequency-matching claim; no new factual assertion'};
 }
 return undefined;
}
export function editorialHierarchyLayout(post:{compositionPreset?:string;slides?:CompositionInput['slides']},index:number):HierarchyLayout{
 if(post.compositionPreset==='semantic-editorial-v1'){
  if(!post.slides)throw Error('Нет текста для смысловой композиции');
  return semanticEditorialComposition({slides:post.slides},index).layout;
 }
 const layout=post.compositionPreset==='fridge-hum-v3'?v3.layouts[index]:post.compositionPreset==='fridge-hum-v2'?v2.layouts[index]:HIERARCHY_LAYOUTS[index];
 if(!layout)throw Error('Неизвестная композиция');return layout;
}
export function paintEditorialHierarchy(c:CanvasRenderingContext2D,slide:EditorialHierarchy,index:number,layout=HIERARCHY_LAYOUTS[index],fontSystem='cormorant-inter',semantic=false){
 if(!layout)throw Error('Неизвестная композиция');
 for(const role of ['kicker','headline','highlight','body'] as const)
  if(slide[role]?.trim()&&!layout[role])throw Error('В композиции слайда '+(index+1)+' нет зоны '+role+'; текст не будет скрыт при экспорте');
 const result:{role:string;size:number;lines:string[];x:number;y:number;width:number;height:number}[]=[];
 c.save();
 for(const role of ['kicker','headline','highlight','body'] as const){
  const zone=layout[role],text=slide[role];if(!zone||!text)continue;
  const align=zone.align??'left';let lines:string[]=[],size=zone.size;
  const font=(s:number)=>fontSystem==='literata-golos'?
   `${role==='headline'?600:400} ${s}px "${role==='headline'?'Persona Editorial Literata':'Persona Editorial Golos'}"`:
   role==='headline'?`${index===0?700:600} ${s}px "Persona Carousel Cormorant"`:
   role==='highlight'?`italic 600 ${s}px "Persona Carousel Cormorant"`:
   `${role==='body'?300:400} ${s}px "Persona Carousel Inter"`;
  const leading=fontSystem==='literata-golos'?(role==='body'?(semantic?1.26:1.38):1.15):role==='body'?1.6:role==='headline'?1.08:1.25;
  const min=role==='headline'?(semantic?88:64):role==='body'?(semantic?60:44):role==='highlight'?40:20;
  for(;;size=Math.max(min,size-4)){
   c.font=font(size);
   try{lines=wrapEditorialText(text,zone.width,t=>c.measureText(t).width)}catch{if(size===min){size=min-1;break}continue}
   if(lines.length*size*leading<=zone.height)break;
   if(size===min){size=min-1;break}
  }
  if(size<min)throw Error('Текст не помещается в зону '+role+' слайда '+(index+1));
  c.font=font(size);c.textAlign=align;c.textBaseline='top';
  c.fillStyle=role==='kicker'||role==='highlight'?'#C9A882':'#F2E9DC';c.globalAlpha=role==='body'?.9:1;
  const x=align==='center'?zone.x+zone.width/2:zone.x;
  if(role==='kicker'){
   c.textAlign='left';
   const chars=Array.from(text.toLocaleUpperCase('ru')),widths=chars.map(ch=>c.measureText(ch).width);
   const total=widths.reduce((a,b)=>a+b,0)+2*(chars.length-1);
   let cx=align==='center'?x-total/2:x;
   chars.forEach((ch,i)=>{c.fillText(ch,cx,zone.y);cx+=widths[i]+2});
  }else lines.forEach((line,i)=>c.fillText(line,x,zone.y+i*size*leading));
  result.push({role,size,lines,x:zone.x,y:zone.y,width:zone.width,height:lines.length*size*leading});
 }
 c.restore();return result;
}
