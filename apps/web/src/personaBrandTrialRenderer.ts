import type {EditorialPost,EditorialSlide} from './personaEditorialModel';
import {brandTrialArt} from './personaJawsBrandTrial';
import {wrapEditorialText} from './personaEditorialTypography';

const W=1080,H=1350;
type Rect={x:number;y:number;w:number;h:number};
const ivory='#EFE7D8',espresso='#292420',bronze='#A28C70';
// Original vector illustration, not a film frame or archival scan. No external service.
function drawArt(c:CanvasRenderingContext2D,r:Rect,art:string,seed:number){
 c.save();c.translate(r.x,r.y);c.scale(r.w/900,r.h/480);
 c.beginPath();c.rect(0,0,900,480);c.clip();
 c.fillStyle='#D6C3A7';c.fillRect(0,0,900,480);
 let state=seed+123;
 const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
 const line=(x:number,y:number,x2:number,y2:number)=>{c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke()};
 c.strokeStyle='rgba(71,48,33,.19)';c.lineWidth=.8;
 for(let i=0;i<1800;i++){let x=rand()*900,y=rand()*480;line(x,y,x+3+rand()*15,y+rand()*4)}
 if(art==='piano'||art==='keyboard-diagram'){
  c.fillStyle='#4B382D';c.fillRect(0,0,900,120);
  for(let i=0;i<11;i++){c.fillStyle=ivory;c.fillRect(35+i*76,125,73,310);c.strokeStyle='#6C5544';c.strokeRect(35+i*76,125,73,310)}
  for(let i=0;i<10;i++){if([2,6,9].includes(i))continue;c.fillStyle=espresso;c.fillRect(90+i*76,125,39,190)}
  if(art==='keyboard-diagram'){// E–F are adjacent white keys in a C–D–E–F sequence.
   c.fillStyle='rgba(125,91,55,.65)';c.fillRect(35+2*76,325,73,110);c.fillRect(35+3*76,325,73,110);
   // Labels are drawn by the surrounding slide copy, not baked into the illustration.
  }
 }else{
  const horizon=art==='beach'?165:190;
  c.fillStyle='#BCA78C';c.fillRect(0,horizon,900,480-horizon);
  c.strokeStyle='#65503F';c.lineWidth=1.8;line(0,horizon,900,horizon);
  for(let row=0;row<48;row++){
   const y=horizon+row*6.3;
   c.strokeStyle=row%3===0?'rgba(57,42,33,.62)':'rgba(87,66,49,.32)';c.lineWidth=1+row*.025;
   c.beginPath();c.moveTo(0,y);
   for(let x=0;x<=900;x+=12)c.lineTo(x,y+Math.sin(x/(33+row*.7)+row*.85)*((art==='waves'?5:2)+row*.14)+Math.sin(x/91+seed)*3);
   c.stroke();
  }
  if(art==='ocean-fin'||art==='beach'){
   const x=art==='beach'?650:510,y=art==='beach'?270:315,s=art==='beach'?.45:1;
   c.save();c.translate(x,y);c.scale(s,s);c.fillStyle='#382B23';c.beginPath();c.moveTo(-62,8);c.quadraticCurveTo(-15,-74,48,-103);c.quadraticCurveTo(15,-48,50,8);c.closePath();c.fill();c.restore();
  }
  if(art==='beach'){
   c.fillStyle='#E2D2B6';c.beginPath();c.moveTo(900,225);c.quadraticCurveTo(650,300,280,480);c.lineTo(900,480);c.closePath();c.fill();
   c.strokeStyle='#79614A';c.lineWidth=1;for(let i=0;i<45;i++){const x=650+rand()*250,y=365+rand()*110;line(x,y,x-5-rand()*22,y-15-rand()*35)}
  }
 }
 c.restore();c.strokeStyle=bronze;c.lineWidth=1;c.strokeRect(r.x,r.y,r.w,r.h);
}
function textBlock(c:CanvasRenderingContext2D,value:string,r:Rect,headline:boolean,color:string){
 if(!value.trim())return;
 const family=headline?'Persona Carousel Cormorant':'Persona Carousel Inter',weight=headline?600:400;
 const max=headline?90:47,min=headline?58:38,leading=headline?1.08:1.35;
 for(let size=max;size>=min;size-=2){
  c.font=weight+' '+size+'px "'+family+'"';
  let lines:string[];try{lines=wrapEditorialText(value,r.w,v=>c.measureText(v).width)}catch{continue}
  if(lines.length*size*leading>r.h)continue;
  c.fillStyle=color;c.textAlign='left';c.textBaseline='top';
  lines.forEach((line,i)=>c.fillText(line,r.x,r.y+i*size*leading));return;
 }
 throw Error('Текст не помещается в композицию Old Money. Нужна редактура.');
}
export async function renderLocalBrandTrial(post:EditorialPost,slide:EditorialSlide,index:number):Promise<Blob>{
 if(post.slides[index]?.id!==slide.id)throw Error('Несогласованный порядок слайдов');
 const spec=brandTrialArt(slide.id);
 const blocks=slide.text.split(/\n\s*\n/u).map(s=>s.trim()).filter(Boolean);
 if(!blocks.length||blocks.length>3)throw Error('Нужно 1–3 текстовых блока');
 const faces=await Promise.all([document.fonts.load('600 80px "Persona Carousel Cormorant"',blocks[0]),document.fonts.load('400 44px "Persona Carousel Inter"',blocks.slice(1).join(' ')||'А')]);
 if(faces.some(a=>!a.length))throw Error('Шрифты бренд-теста не загружены');
 const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
 const c=canvas.getContext('2d');if(!c)throw Error('Canvas 2D недоступен');
 const dark=spec.palette==='dark',fg=dark?ivory:espresso;
 c.fillStyle=dark?espresso:ivory;c.fillRect(0,0,W,H);
 // Subtle deterministic print texture.
 let n=0x271126;for(let i=0;i<18000;i++){n=(Math.imul(n,1664525)+1013904223)>>>0;const x=n%W;n=(Math.imul(n,1664525)+1013904223)>>>0;const y=n%H;c.fillStyle=dark?'rgba(255,244,220,.025)':'rgba(70,45,30,.035)';c.fillRect(x,y,2,1)}
 const body=blocks.slice(1).join('\n');
 if(index===0){
  textBlock(c,blocks[0],{x:94,y:92,w:892,h:345},true,fg);
  textBlock(c,body,{x:96,y:454,w:888,h:220},false,fg);
  drawArt(c,{x:94,y:730,w:892,h:520},spec.art,index);
 }else if(index%2===1){
  drawArt(c,{x:94,y:92,w:892,h:462},spec.art,index);
  textBlock(c,blocks[0],{x:94,y:608,w:892,h:270},true,fg);
  textBlock(c,body,{x:96,y:894,w:888,h:355},false,fg);
 }else{
  textBlock(c,blocks[0],{x:94,y:92,w:892,h:270},true,fg);
  drawArt(c,{x:94,y:402,w:892,h:420},spec.art,index);
  textBlock(c,body,{x:96,y:884,w:888,h:365},false,fg);
 }
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG не создан')),'image/png'));
}
