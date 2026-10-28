import React from 'react';
import {renderToString} from 'react-dom/server';
import {describe,expect,it,vi,afterEach} from 'vitest';
import PersonaFactory from './PersonaFactory';
import {
  analyzeReferenceDuplicates,makeReferenceItem,mergeReferenceItems,normalizedReferenceStem,
  parseInventoryReport,readReferenceCatalog,REFERENCE_CATEGORIES,
} from './personaReferenceCatalog';

const SHA_A='a'.repeat(64),SHA_B='b'.repeat(64);
function file(name:string,sha256:string|null,sizeBytes=100) {
  return makeReferenceItem({name,type:name.endsWith('.mp4')?'video':'image',sizeBytes,sha256,source:'inventory'});
}
afterEach(()=>vi.unstubAllGlobals());

describe('Persona reference library safety',()=>{
  it('keeps every original name and only classifies likely repeats',()=>{
    const items=[file('duplicate.jpg',SHA_A),file('duplicate(1).jpg',SHA_A),
      file('clip.mp4',SHA_A),file('clip(1).mp4',SHA_B)];
    const groups=analyzeReferenceDuplicates(items);
    expect(groups.exact).toHaveLength(1);
    expect(groups.exact[0]).toHaveLength(3);
    expect(groups.candidates).toHaveLength(1);
    expect(groups.candidates[0].map(x=>x.name)).toEqual(['clip.mp4','clip(1).mp4']);
    expect(normalizedReferenceStem('scene (2).mp4')).toBe('scene');
  });

  it('treats same-name unverified files as candidates, never exact copies',()=>{
    const a=makeReferenceItem({name:'clip.mp4',type:'video',sizeBytes:20_000_000,source:'files',lastModified:1});
    const b=makeReferenceItem({name:'clip (1).mp4',type:'video',sizeBytes:20_000_000,source:'files',lastModified:2});
    const groups=analyzeReferenceDuplicates([a,b]);
    expect(groups.exact).toHaveLength(0);
    expect(groups.candidates).toHaveLength(1);
    expect(a.sha256).toBeNull();
  });

  it('requires explicit readonly schema and rejects path injection and fake hashes',()=>{
    const report={schemaVersion:1,readOnly:true,entries:[
      {name:'reel.mp4',type:'video',sizeBytes:500,sha256:SHA_A}
    ]};
    expect(parseInventoryReport(JSON.stringify(report))[0].name).toBe('reel.mp4');
    expect(()=>parseInventoryReport(JSON.stringify({...report,readOnly:false}))).toThrow();
    expect(()=>parseInventoryReport(JSON.stringify({...report,entries:[{...report.entries[0],name:'../secrets.mp4'}]}))).toThrow();
    expect(()=>parseInventoryReport(JSON.stringify({...report,entries:[{...report.entries[0],sha256:'unknown'}]}))).toThrow();
  });

  it('preserves human category reviews on repeated import without modifying sources',()=>{
    const original=file('mycolor.jpg',SHA_A);
    const reviewed={...original,category:'свет' as const,reviewed:true};
    const merged=mergeReferenceItems([reviewed],[file('mycolor.jpg',SHA_A),file('new.jpg',SHA_B)]);
    expect(merged).toHaveLength(2);
    expect(merged[0].category).toBe('свет');
    expect(merged[0].reviewed).toBe(true);
    expect(REFERENCE_CATEGORIES).toContain('цвет');
    const restored=readReferenceCatalog(JSON.stringify({schemaVersion:1,items:merged}));
    expect(restored.items).toEqual(merged);
  });

  it('does not silently interpret malformed storage as valid',()=>{
    expect(readReferenceCatalog('{broken').items).toEqual([]);
    expect(readReferenceCatalog(JSON.stringify({schemaVersion:99,items:[]})).items).toEqual([]);
  });

  it('renders library on direct iPhone route without needing a project',()=>{
    vi.stubGlobal('navigator',{onLine:true});
    vi.stubGlobal('location',{hash:'#persona/references'});
    vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>undefined});
    const markup=renderToString(React.createElement(PersonaFactory));
    expect(markup).toContain('Библиотека референсов');
    expect(markup).toContain('Подтвердить');
    expect(markup).toContain('Сортировка');
    expect(markup).toContain('Исходники не перемещаются');
  });
});
