export type PhotoPresetId='natural'|'old-money'|'cinema';
export type PhotoPreset={id:PhotoPresetId;label:string;filter:string};
export const PHOTO_PRESETS:readonly PhotoPreset[]=[
  {id:'natural',label:'Естественно',filter:'brightness(1.01) contrast(1.03) saturate(1.02)'},
  {id:'old-money',label:'Old Money',filter:'brightness(1.02) contrast(1.06) saturate(.92) sepia(.05)'},
  {id:'cinema',label:'Cinema',filter:'brightness(.99) contrast(1.09) saturate(.94) sepia(.025)'},
];
export type PhotoRenderPlan={sourceWidth:number;sourceHeight:number;outputWidth:number;outputHeight:number;cropApplied:false;resizeApplied:false;generativeChanges:false;preset:PhotoPresetId};
export function createPhotoRenderPlan(width:number,height:number,preset:PhotoPresetId):PhotoRenderPlan{
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0)throw new Error('Некорректное разрешение фотографии');
  if(!PHOTO_PRESETS.some(item=>item.id===preset))throw new Error('Неизвестный пресет');
  return{sourceWidth:width,sourceHeight:height,outputWidth:width,outputHeight:height,cropApplied:false,resizeApplied:false,generativeChanges:false,preset};
}
export function photoExportName(sourceName:string,preset:PhotoPresetId){
  const stem=sourceName.replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}._-]+/gu,'-')||'photo';
  return`${stem}-${preset}.png`;
}
