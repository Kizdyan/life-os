import{describe,expect,it}from'vitest';
import{canvasPhotoExportContract,createPhotoRenderPlan,photoExportName,PHOTO_PRESETS}from'./photoEditor';
describe('Persona Photo render contract',()=>{
  it('keeps every source pixel in a same-resolution output',()=>{expect(createPhotoRenderPlan(4032,3024,'old-money')).toEqual({sourceWidth:4032,sourceHeight:3024,outputWidth:4032,outputHeight:3024,cropApplied:false,resizeApplied:false,generativeChanges:false,preset:'old-money'})});
  it('rejects invalid source dimensions before export',()=>{expect(()=>createPhotoRenderPlan(0,3024,'natural')).toThrow('Некорректное разрешение')});
  it('exposes only restrained deterministic presets',()=>{expect(PHOTO_PRESETS.map(x=>x.id)).toEqual(['natural','old-money','cinema']);expect(PHOTO_PRESETS.every(x=>!x.filter.includes('blur('))).toBe(true)});
  it('creates a stable lossless export filename',()=>{expect(photoExportName('Моё фото.JPG','cinema')).toBe('Моё-фото-cinema.png')});
  it('does not claim metadata fidelity for a browser canvas export',()=>{expect(canvasPhotoExportContract()).toEqual({format:'image/png',samePixelDimensions:true,sourceFileModified:false,preservesExif:false,preservesIccProfile:false,preservesOriginalResolutionMetadata:false})});
});
