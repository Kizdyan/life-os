import {runStudioPython} from './persona-studio-python.mjs';

export async function planFraming(input,candidate,media,config) {
 const width=media.displayWidth??media.width,height=media.displayHeight??media.height;
 if(width*16===height*9)return {mode:'native'};
 try {
  const plan=await runStudioPython(config,'./studio_face_crop.py',
   [input,candidate.startSec,candidate.endSec,width,height].map(String),55000);
  if(plan.mode==='fit')return {...plan,warning:'Безопасная вертикальная обрезка не подтверждена. В кадре сохранено всё изображение.'};
  const rect=plan.rect;
  if(plan.mode==='face-crop'&&Array.isArray(rect)&&rect.length===4&&rect.every(Number.isSafeInteger)){
   const [x,y,w,h]=rect;
   if(x>=0&&y>=0&&w>0&&h>0&&w*16===h*9&&x+w<=width&&y+h<=height)
    return {...plan,detector:'OpenCV YuNet',analysisFps:5};
  }
 } catch { /* Keep the full picture when safe framing cannot be measured. */ }
 return {mode:'fit',reason:'face_analysis_unavailable',warning:'Локальный анализ лица недоступен. В кадре сохранено всё изображение.'};
}
