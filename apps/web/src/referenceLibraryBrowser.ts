export type ReferenceKind = 'video' | 'image' | 'document' | 'other';

export interface ReferenceEntry {
  id: number;
  name: string;
  kind: ReferenceKind;
  sizeBytes: number;
  sha256: string | null;
  hashStatus: 'verified' | 'too_large' | 'unavailable';
}
export interface ReferenceGroup { key: string; files: ReferenceEntry[] }

/** Classifies only local filenames. No remote MIME sniffing or content upload. */
export function classifyReferenceFile(name: string): ReferenceKind {
  const ext=name.toLowerCase().match(/\.[^.]+$/)?.[0]??'';
  if (['.mp4','.mov','.m4v','.webm','.mkv'].includes(ext)) return 'video';
  if (['.jpg','.jpeg','.png','.webp','.heic','.heif','.gif'].includes(ext)) return 'image';
  if (['.pdf','.md','.txt','.doc','.docx','.pptx','.xlsx'].includes(ext)) return 'document';
  return 'other';
}
export function referenceStem(name: string): string {
  return name.replace(/\.[^.]+$/,'').replace(/\s*\(\d+\)$/,'').trim().toLowerCase();
}
function groupBy(items: ReferenceEntry[],keyFn:(entry:ReferenceEntry)=>string|null):ReferenceGroup[] {
  const map=new Map<string,ReferenceEntry[]>();
  for(const item of items) {
    const key=keyFn(item);
    if(!key)continue;
    map.set(key,[...(map.get(key)??[]),item]);
  }
  return [...map.entries()].filter(([,files])=>files.length>1)
    .map(([key,files])=>({key,files}))
    .sort((a,b)=>a.files[0].name.localeCompare(b.files[0].name));
}
export function referenceGroups(items:ReferenceEntry[]):{
  exactDuplicates:ReferenceGroup[];
  similarNames:ReferenceGroup[];
} {
  // A filename or file size match is NEVER evidence of identical bytes.
  const exactDuplicates=groupBy(items,entry=>entry.hashStatus==='verified'?entry.sha256:null);
  const similarNames=groupBy(items,entry=>entry.kind+':'+referenceStem(entry.name))
    .filter(group=>new Set(group.files.map(entry=>entry.sha256??'unverified:'+entry.id)).size>1);
  return {exactDuplicates,similarNames};
}
