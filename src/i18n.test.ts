import { describe, expect, it } from 'vitest';
import { candidates } from './data';
import { formatPrice, resolveLanguage, translate } from './i18n';

describe('RU / EN',()=>{
 it('respects an explicit language link, then saved choice, then Russian',()=>{
  expect(resolveLanguage('en','ru')).toBe('en');
  expect(resolveLanguage('ru','en')).toBe('ru');
  expect(resolveLanguage(null,'en')).toBe('en');
  expect(resolveLanguage('fr','ru')).toBe('ru');
  expect(resolveLanguage(null,'invalid')).toBe('ru');
 });
 it('translates every candidate description and tagline without changing names',()=>{
  for(const candidate of candidates){
   expect(translate('en',candidate.description)).not.toMatch(/[А-Яа-яЁё]/u);
   expect(translate('en',candidate.tagline)).not.toMatch(/[А-Яа-яЁё]/u);
   expect(translate('en',candidate.name)).toBe(candidate.name);
  }
 });
 it('preserves text spacing, interpolates labels and retains original Russian',()=>{
  expect(translate('en',' · промокод DEMO10')).toBe(' · promo code DEMO10');
  expect(translate('en','Подробнее: {name}',{name:'M.O.S.'})).toBe('More about M.O.S.');
  expect(translate('ru','Подробнее: {name}',{name:'M.O.S.'})).toBe('Подробнее: M.O.S.');
 });
 it('changes number formatting without converting the demo currency',()=>{
  expect(formatPrice('ru',1990)).toBe('1 990 ₽');
  expect(formatPrice('en',1990)).toBe('1,990 ₽');
 });
});
