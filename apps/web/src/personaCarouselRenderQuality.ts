/** Technical image QA, not an aesthetic judgement or author approval. */
export function measureEditorialPixels(data:Uint8ClampedArray){
 if(data.length<4||data.length%4)throw Error('Нет декодированных пикселей');
 let sum=0,sum2=0,dark=0,light=0,transparent=0;
 const n=data.length/4;
 for(let i=0;i<data.length;i+=4){
  const l=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
  sum+=l;sum2+=l*l;if(l<8)dark++;if(l>247)light++;if(data[i+3]<250)transparent++;
 }
 const mean=sum/n,sd=Math.sqrt(Math.max(0,sum2/n-mean*mean));
 const warnings:string[]=[];
 if(dark/n>.98)warnings.push('Почти полностью чёрный кадр');
 if(light/n>.98)warnings.push('Почти полностью белый кадр');
 if(sd<4)warnings.push('Почти однородное изображение');
 if(transparent/n>.001)warnings.push('Непрозрачность нарушена');
 return {meanLuma:Math.round(mean*100)/100,lumaStdDev:Math.round(sd*100)/100,darkFraction:dark/n,lightFraction:light/n,transparentFraction:transparent/n,warnings};
}
export async function inspectEditorialRenderedSlides(images:Blob[]){
 if(images.length<5||images.length>8)throw Error('Для автономной карусели нужно 5–8 PNG');
 const slides=[];
 const seen=new Set<string>();
 for(const [index,blob] of images.entries()){
  if(blob.type!=='image/png'||blob.size<1000||blob.size>25*1024*1024)throw Error('Некорректный PNG '+(index+1));
  const bytes=await blob.arrayBuffer();
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const bitmap=await createImageBitmap(blob);
  try{
   if(bitmap.width!==1080||bitmap.height!==1350)throw Error('Неверный размер слайда '+(index+1));
   const canvas=document.createElement('canvas');canvas.width=216;canvas.height=270;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Canvas QA недоступен');
   ctx.drawImage(bitmap,0,0,216,270);
   const stats=measureEditorialPixels(ctx.getImageData(0,0,216,270).data);
   if(seen.has(sha256))stats.warnings.push('Побайтово идентичный PNG уже есть в карусели');
   seen.add(sha256);
   slides.push({index:index+1,sha256,bytes:blob.size,width:bitmap.width,height:bitmap.height,...stats});
  }finally{bitmap.close()}
 }
 return {version:1,scope:'decoded-rendered-pngs',status:slides.some(s=>s.warnings.length)?'TECHNICAL_REVIEW_REQUIRED':'TECHNICAL_CHECKS_PASS',artisticReview:'NOT_PERFORMED',approved:false,published:false,slides};
}
