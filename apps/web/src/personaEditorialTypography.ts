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
export type HierarchyLayout={headline:Zone;kicker?:Zone;body?:Zone;highlight?:Zone;diagonal?:boolean};
export const HIERARCHY_LAYOUTS:readonly HierarchyLayout[]=[
 {kicker:{x:100,y:830,width:880,height:40,size:20},headline:{x:100,y:890,width:880,height:350,size:90}},
 {headline:{x:100,y:150,width:820,height:450,size:88},highlight:{x:100,y:890,width:730,height:250,size:48}},
 {kicker:{x:100,y:130,width:880,height:40,size:20},headline:{x:100,y:200,width:760,height:260,size:90},body:{x:540,y:810,width:440,height:390,size:32}},
 {headline:{x:100,y:150,width:820,height:300,size:88},highlight:{x:100,y:600,width:740,height:210,size:48},body:{x:100,y:1000,width:710,height:230,size:32}},
 {headline:{x:100,y:150,width:800,height:370,size:88},body:{x:410,y:900,width:570,height:320,size:32},diagonal:true},
 {kicker:{x:100,y:270,width:880,height:40,size:20,align:'center'},headline:{x:100,y:350,width:880,height:340,size:88,align:'center'},body:{x:240,y:810,width:600,height:390,size:32,align:'center'}},
 {headline:{x:100,y:350,width:880,height:370,size:88,align:'center'},highlight:{x:100,y:850,width:880,height:180,size:48,align:'center'}},
 {headline:{x:100,y:900,width:820,height:240,size:88},body:{x:100,y:1180,width:700,height:60,size:32}}
];

export function paintEditorialHierarchy(c:CanvasRenderingContext2D,slide:EditorialHierarchy,index:number){
 const layout=HIERARCHY_LAYOUTS[index];if(!layout)throw Error('Неизвестная композиция');
 const result:{role:string;size:number;lines:string[];x:number;y:number;width:number;height:number}[]=[];
 c.save();
 if(layout.diagonal){
  c.strokeStyle='#C9A882';c.lineWidth=1;c.beginPath();c.moveTo(100,900);c.lineTo(980,660);c.stroke();
 }
 for(const role of ['kicker','headline','highlight','body'] as const){
  const zone=layout[role],text=slide[role];if(!zone||!text)continue;
  const align=zone.align??'left';let lines:string[]=[],size=zone.size;
  const font=(s:number)=>role==='headline'?`${index===0?700:600} ${s}px "Persona Carousel Cormorant"`:
   role==='highlight'?`italic 600 ${s}px "Persona Carousel Cormorant"`:
   `${role==='body'?300:400} ${s}px "Persona Carousel Inter"`;
  const leading=role==='body'?1.6:role==='headline'?1.08:1.25;
  const min=role==='headline'?64:role==='body'?28:role==='highlight'?40:20;
  for(;size>=min;size-=4){
   c.font=font(size);
   try{lines=wrapEditorialText(text,zone.width,t=>c.measureText(t).width)}catch{continue}
   if(lines.length*size*leading<=zone.height)break;
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
