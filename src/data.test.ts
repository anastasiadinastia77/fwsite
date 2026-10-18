import { describe, it, expect } from 'vitest';
import { experts, genres, candidates, demoExpert, nextStage, DEMO_PRICE, demoPromoPrice } from './data';
describe('Демо-процесс',()=>{
 it('передача трека доступна после оплаты, затем разбор и один раунд',()=>{
 expect(nextStage('checkout')).toBe('paid');
 expect(nextStage('paid')).toBe('submitted');
 expect(nextStage('submitted')).toBe('reviewed');
 expect(nextStage('reviewed')).toBe('questions');
 expect(nextStage('questions')).toBe('complete');
 expect(nextStage('complete')).toBe('complete');
 });
 it('заказ отделён от реальных кандидатов',()=>{
 for(const candidate of candidates){
  const demo=demoExpert(candidate.genres[0]);
  expect(demo.title).toContain('Демо-эксперт');
  expect(demo.title).not.toContain(candidate.name);
 }
 });
 it('каждый жанр имеет отдельный демо-профиль',()=>{
 expect(experts.map(e=>e.genre)).toEqual(genres.slice(1));
 expect(new Set(experts.map(e=>e.id)).size).toBe(experts.length);
 });
});

describe('Демонстрационный промокод',()=>{
 it('учитывает регистр и пробелы, возвращает целую сумму в рублях',()=>{
  expect(demoPromoPrice(' demo10 ')).toBe(1791);
  expect(demoPromoPrice('DEMO10')).toBe(DEMO_PRICE-199);
 });
 it('не применяет скидку к пустому или неизвестному коду',()=>{
  expect(demoPromoPrice('')).toBeNull();
  expect(demoPromoPrice('OTHER')).toBeNull();
 });
});
