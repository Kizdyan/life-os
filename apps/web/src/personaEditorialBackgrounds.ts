import config from '../../../config/carousel-backgrounds.json';
export type CinematicBackground={libraryId:keyof typeof config.library;generatedRef?:string;sha256?:string};
export function libraryBackground(index:number):CinematicBackground{
 return {libraryId:config.sequence[index%config.sequence.length] as CinematicBackground['libraryId']};
}
export function backgroundAssetUrl(background:CinematicBackground):string{
 return '/carousel-backgrounds/v1/'+config.library[background.libraryId].file;
}
export function validCinematicBackground(value:unknown):value is CinematicBackground{
 if(!value||typeof value!=='object')return false;
 const b=value as CinematicBackground;
 return Object.hasOwn(config.library,b.libraryId)&&
  (b.generatedRef===undefined?b.sha256===undefined:
   typeof b.generatedRef==='string'&&/^[-A-Za-z0-9]{3,75}\/[-A-Za-z0-9]{3,75}$/.test(b.generatedRef)&&
   typeof b.sha256==='string'&&/^[a-f0-9]{64}$/.test(b.sha256));
}
