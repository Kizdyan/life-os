import type {ReferenceEntry,ReferenceKind} from './referenceLibraryBrowser';

export interface ReferenceOrganizationSuggestion {
  id:number;
  originalName:string;
  kind:ReferenceKind;
  proposedRelativePath:string;
  duplicateReviewRequired:boolean;
  verification:'sha256'|'unverified';
}
export interface ReferenceOrganizationManifest {
  schemaVersion:1;
  mode:'preview_only';
  generatedAt:string;
  requiresManualApproval:true;
  permissions:{move:false;delete:false;rename:false;upload:false};
  items:ReferenceOrganizationSuggestion[];
}

const folders:Record<ReferenceKind,string>={
  video:'Референсы/Видео',
  image:'Референсы/Фото',
  document:'Референсы/Документы',
  other:'Референсы/Другое'
};

/** File picker labels must never be used as relative directory paths without sanitization. */
export function safeReferenceFilename(input:string):string {
  const lastSegment=input.split(/[\\/]/).pop()??'';
  const cleaned=lastSegment
    .replace(/[\x00-\x1f\x7f<>:"|?*]/g,'_')
    .replace(/\s+/g,' ')
    .trim().replace(/[. ]+$/g,'');
  const stem=cleaned || 'без-названия';
  const safeStem=/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)?'_'+stem:stem;
  return safeStem.slice(0,180);
}
function deduplicatedName(fileName:string,index:number):string {
  const dot=fileName.lastIndexOf('.');
  if(dot<=0)return fileName+' ('+index+')';
  return fileName.slice(0,dot)+' ('+index+')'+fileName.slice(dot);
}

/**
 * Produces a deterministic dry run. It does not move, rename, upload or delete data.
 * Exact duplicate SHA matches are *flagged*, never automatically discarded.
 */
export function suggestReferenceOrganization(entries:ReferenceEntry[]):ReferenceOrganizationSuggestion[] {
  const seenNames=new Set<string>();
  const seenHashes=new Set<string>();
  return entries.map(entry=>{
    const name=safeReferenceFilename(entry.name);
    const folder=folders[entry.kind];
    let candidate=name,index=2;
    while(seenNames.has((folder+'/'+candidate).toLocaleLowerCase())) {
      candidate=deduplicatedName(name,index++);
    }
    seenNames.add((folder+'/'+candidate).toLocaleLowerCase());
    const verification=entry.hashStatus==='verified'&&entry.sha256?'sha256':'unverified';
    const sameHash=verification==='sha256' && seenHashes.has(entry.sha256!);
    if(verification==='sha256')seenHashes.add(entry.sha256!);
    return {
      id:entry.id,
      originalName:entry.name,
      kind:entry.kind,
      proposedRelativePath:folder+'/'+candidate,
      duplicateReviewRequired:!!sameHash,
      verification
    };
  });
}
export function buildReferenceManifest(entries:ReferenceEntry[],generatedAt:string):ReferenceOrganizationManifest {
  if(!Number.isFinite(Date.parse(generatedAt)))throw Error('Invalid manifest date');
  return {
    schemaVersion:1,mode:'preview_only',generatedAt,
    requiresManualApproval:true,
    permissions:{move:false,delete:false,rename:false,upload:false},
    items:suggestReferenceOrganization(entries)
  };
}
