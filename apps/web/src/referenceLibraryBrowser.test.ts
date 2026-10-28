import {describe,it,expect} from 'vitest';
import {classifyReferenceFile,referenceStem,referenceGroups,type ReferenceEntry} from './referenceLibraryBrowser';
const item=(id:number,name:string,sha256:string|null,hashStatus:ReferenceEntry['hashStatus']='verified'):ReferenceEntry=>({
  id,name,kind:classifyReferenceFile(name),sizeBytes:100,sha256,hashStatus
});
describe('reference library classification',()=>{
  it('understands common video, photo and document extensions',()=>{
    expect(classifyReferenceFile('take.MOV')).toBe('video');
    expect(classifyReferenceFile('image.HEIC')).toBe('image');
    expect(classifyReferenceFile('brief.pdf')).toBe('document');
    expect(classifyReferenceFile('secret.env')).toBe('other');
  });
  it('normalizes numbered copy suffixes but preserves real names',()=>{
    expect(referenceStem('Camera (2).MP4')).toBe('camera');
    expect(referenceStem('Camera.mp4')).toBe('camera');
    expect(referenceStem('Camera-alt.mp4')).toBe('camera-alt');
  });
});
describe('reference library duplicate evidence',()=>{
  it('shows identical hashes as exact copies, independent of name',()=>{
    const result=referenceGroups([item(0,'A.jpg','same'),item(1,'B.jpg','same')]);
    expect(result.exactDuplicates).toHaveLength(1);
    expect(result.exactDuplicates[0].files).toHaveLength(2);
    expect(result.similarNames).toHaveLength(0);
  });
  it('never calls differently hashed same-name clips exact duplicates',()=>{
    const result=referenceGroups([item(0,'clip.mp4','one'),item(1,'clip (1).mp4','two')]);
    expect(result.exactDuplicates).toHaveLength(0);
    expect(result.similarNames).toHaveLength(1);
  });
  it('cannot infer exact duplicate from filename/size without a verified hash',()=>{
    const result=referenceGroups([
      item(0,'clip.mov',null,'too_large'),
      item(1,'clip (1).mov',null,'too_large')
    ]);
    expect(result.exactDuplicates).toHaveLength(0);
    expect(result.similarNames).toHaveLength(1);
  });
  it('does not group completely unrelated files',()=>{
    const result=referenceGroups([item(0,'clip.mov','x'),item(1,'photo.jpg','y')]);
    expect(result.exactDuplicates).toHaveLength(0);
    expect(result.similarNames).toHaveLength(0);
  });
});
