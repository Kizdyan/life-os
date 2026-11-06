import {describe,it,expect} from 'vitest';
import {reviewCarouselGrowth} from './personaGrowthReview';
const slide=(title:string,body='')=>({eyebrow:'ТЕМА',title,body});
describe('carousel growth review',()=>{
 it('scores a blank hook lower than a concrete hook',()=>{
  const weak=[slide('Идея'),slide('Текст'),slide('Вывод')];
  const strong=[slide('Почему актёр теряет внимание за 3 секунды?'),slide('Пример: смена интонации'),slide('Шаг 1: покажи конфликт'),slide('Сохрани и подпишись на продолжение')];
  expect(reviewCarouselGrowth(strong,'followers').score).toBeGreaterThan(reviewCarouselGrowth(weak,'followers').score);
 });
 it('recommends subscription CTA when follower goal is selected',()=>{
  const result=reviewCarouselGrowth([slide('Как актёру держать внимание?'),slide('Итог')],'followers');
  expect(result.recommendations.some(item=>item.includes('подписок'))).toBe(true);
 });
 it('does not confuse save and reach goals',()=>{
  const slides=[slide('Почему сцена не работает?'),slide('Подпишись на продолжение')];
  expect(reviewCarouselGrowth(slides,'saves').recommendations.some(item=>item.includes('сохранений'))).toBe(true);
  expect(reviewCarouselGrowth(slides,'reach').recommendations.some(item=>item.includes('сохранений'))).toBe(false);
 });
});
