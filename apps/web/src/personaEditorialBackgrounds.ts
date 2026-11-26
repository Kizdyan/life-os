import config from '../../../config/carousel-backgrounds.json';
/** Generated images have their own immutable namespace, never an author's archive label. */
export function isGeneratedBackgroundRef(ref:string):boolean{return /\/bg-[A-Za-z0-9-]+$/.test(ref)}
export type CinematicBackground={libraryId:keyof typeof config.library;generatedRef?:string;sha256?:string;provenance?:{provider:'openai'|'codex-imagegen';model:string;prompt:string;createdAt:string}};
export function libraryBackground(index:number):CinematicBackground{
 return {libraryId:config.sequence[index%config.sequence.length] as CinematicBackground['libraryId']};
}
export function backgroundAssetUrl(background:CinematicBackground):string{
 return '/carousel-backgrounds/v1/'+config.library[background.libraryId].file;
}
export function validCinematicBackground(value:unknown):value is CinematicBackground{
 if(!value||typeof value!=='object')return false;
 const b=value as CinematicBackground;
 if(b.provenance&&(!b.generatedRef||!['openai','codex-imagegen'].includes(b.provenance.provider)||typeof b.provenance.model!=='string'||!b.provenance.model.trim()||b.provenance.model.length>80||typeof b.provenance.prompt!=='string'||!b.provenance.prompt.trim()||b.provenance.prompt.length>2000||!Number.isFinite(Date.parse(b.provenance.createdAt))))return false;
 return Object.hasOwn(config.library,b.libraryId)&&
  (b.generatedRef===undefined?b.sha256===undefined:
   typeof b.generatedRef==='string'&&/^[-A-Za-z0-9]{3,75}\/[-A-Za-z0-9]{3,75}$/.test(b.generatedRef)&&
   typeof b.sha256==='string'&&/^[a-f0-9]{64}$/.test(b.sha256));
}
