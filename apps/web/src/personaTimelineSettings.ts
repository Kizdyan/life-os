export interface PersonaTimelineSettings {
  width:1080|1920;
  height:1080|1920;
  fps:25|30|60;
}
export const DEFAULT_TIMELINE_SETTINGS:PersonaTimelineSettings={
  width:1080,height:1920,fps:30
};

/**
 * Settings are stored separately from existing v1 clip arrays for backwards
 * compatibility; the source File/Blob bytes are never persisted by this module.
 */
export function loadPersonaTimelineSettings(storage:Pick<Storage,'getItem'>,key:string):PersonaTimelineSettings {
  try{
    const raw=storage.getItem(key);
    if(!raw)return {...DEFAULT_TIMELINE_SETTINGS};
    const value:unknown=JSON.parse(raw);
    if(!value||typeof value!=='object'||Array.isArray(value))return {...DEFAULT_TIMELINE_SETTINGS};
    const settings=value as Partial<PersonaTimelineSettings>;
    if(![[1080,1920],[1920,1080]].some(([w,h])=>settings.width===w&&settings.height===h)
      ||![25,30,60].includes(settings.fps as number))return {...DEFAULT_TIMELINE_SETTINGS};
    return {width:settings.width as 1080|1920,height:settings.height as 1080|1920,fps:settings.fps as 25|30|60};
  }catch{return {...DEFAULT_TIMELINE_SETTINGS}}
}
export function validateReattachedVideo(
  saved:{name:string;sourceDuration:number;sourceSizeBytes?:number},
  candidate:{name:string;size:number},
  durationSec:number
):{ok:boolean;reason:string} {
  if(saved.name!==candidate.name)return {ok:false,reason:'Имя файла отличается от сохранённого исходника'};
  if(!Number.isFinite(durationSec)||durationSec<=0||Math.abs(saved.sourceDuration-durationSec)>0.5)
    return {ok:false,reason:'Длительность файла отличается от сохранённого исходника'};
  if(saved.sourceSizeBytes!==undefined&&saved.sourceSizeBytes!==candidate.size)
    return {ok:false,reason:'Размер файла отличается от сохранённого исходника'};
  return {ok:true,reason:saved.sourceSizeBytes===undefined
    ?'Старый проект не содержит размер файла — дополнительно проверь правильность исходника'
    :'Имя, размер и длительность совпадают; содержимое байт-в-байт не проверено'};
}

export function hasValidTimelineBounds(clip:{startSec:number;durationSec:number;sourceDuration:number}):boolean {
  return Number.isFinite(clip.startSec)&&Number.isFinite(clip.durationSec)&&
    Number.isFinite(clip.sourceDuration)&&clip.sourceDuration>0&&
    clip.startSec>=0&&clip.durationSec>=0.02&&
    clip.startSec+clip.durationSec<=clip.sourceDuration+0.01;
}
