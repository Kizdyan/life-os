import {describe,it,expect} from 'vitest';
import {measureEditorialPixels} from './personaCarouselRenderQuality';
const pixels=(rgba:number[],n=100)=>new Uint8ClampedArray(Array.from({length:n},()=>rgba).flat());
describe('rendered image quality measurements',()=>{
 it('reports black or white uniform frames',()=>{
  expect(measureEditorialPixels(pixels([0,0,0,255])).warnings).toContain('Почти полностью чёрный кадр');
  expect(measureEditorialPixels(pixels([255,255,255,255])).warnings).toContain('Почти полностью белый кадр');
  expect(measureEditorialPixels(pixels([90,90,90,255])).warnings).toContain('Почти однородное изображение');
 });
 it('detects opacity failures and accepts varied pixels without claiming artistic quality',()=>{
  expect(measureEditorialPixels(pixels([40,80,110,0])).warnings).toContain('Непрозрачность нарушена');
  const data=new Uint8ClampedArray([...pixels([30,40,50,255]),...pixels([180,140,100,255])]);
  expect(measureEditorialPixels(data).warnings).toEqual([]);
  expect(()=>measureEditorialPixels(new Uint8ClampedArray(0))).toThrow();
 });
});
