import { describe, it, expect } from 'vitest';
import { experts, genres, nextStage } from './data';
describe('Демо-процесс',()=>{
 it('передача трека доступна после оплаты, затем разбор и один раунд',()=>{
 expect(nextStage('checkout')).toBe('paid');
 expect(nextStage('paid')).toBe('submitted');
 expect(nextStage('submitted')).toBe('reviewed');
 expect(nextStage('reviewed')).toBe('questions');
 expect(nextStage('questions')).toBe('complete');
 expect(nextStage('complete')).toBe('complete');
 });
 it('каждый жанр имеет отдельный демо-профиль',()=>{
 expect(experts.map(e=>e.genre)).toEqual(genres.slice(1));
 expect(new Set(experts.map(e=>e.id)).size).toBe(experts.length);
 });
});
