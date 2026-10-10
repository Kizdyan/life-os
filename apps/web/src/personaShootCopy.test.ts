import {describe,expect,it} from "vitest";
import {shootActionOnly} from "./personaShootCopy";

describe("Persona SHOOT: one human action, setup in its own field",()=>{
 it("strips placement and makes actor direction imperative",()=>{
  const x=shootActionOnly("Поставь iPhone вертикально на устойчивую опору на уровне глаз. Сними один дубль, меняя взгляд и интонацию после каждой короткой паузы.",2,25);
  expect(x).toBe("Сними 2 дубля по 25 секунд. Меняй взгляд и интонацию после каждой короткой паузы.");
  expect(x).not.toMatch(/iPhone|опору|телефон/i);
 });
 it("avoids dangling piano nouns when converting an infinitive",()=>{
  expect(shootActionOnly("Снять один вертикальный статичный дубль клавиатуры и лица, сыграть три коротких варианта.",1,25))
   .toBe("Сними 1 дубль по 25 секунд. Сыграй три коротких варианта.");
 });
 it("does not drop the theater permission and bystander protection",()=>{
  expect(shootActionOnly("Если есть разрешение театра, снять себя и свои предметы в безопасном месте без других людей и чужой речи.",2,25))
   .toContain("Если есть разрешение театра, сними себя и свои предметы");
 });
 it("keeps adapted take count and duration without invented directions",()=>{
  expect(shootActionOnly("",1,25)).toBe("Сними 1 дубль по 25 секунд.");
  expect(shootActionOnly("Установи телефон на стол. Сними один дубль, меняя эмоцию.",3,30))
   .toBe("Сними 3 дубля по 30 секунд. Меняй эмоцию.");
 });
});
