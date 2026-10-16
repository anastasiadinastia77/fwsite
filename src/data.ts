export const genres = ['Все жанры', 'Organic House', 'Progressive House', 'Trance', 'Melodic House & Techno', 'Indie Dance', 'Techno', 'Drum & Bass'];
export const experts = genres.slice(1).map((genre, i) => ({id:String(i + 1),genre,title:`Эксперт / ${genre}`,code:['ORG.01','PRG.02','TRN.03','MLD.04','IND.05','TCH.06','DNB.07'][i],description:['Глубина, органичная фактура и пространство.','Драматургия, движение и эмоциональная история.','Мелодия, энергия и развитие композиции.','Баланс мелодической идеи и клубной энергии.','Характер, грув и нестандартный саунд.','Ритмическая архитектура и сила минимализма.','Бас, брейкбит и точность продакшена.'][i]}));
export type Expert = typeof experts[number];
export type Stage = 'checkout' | 'paid' | 'submitted' | 'reviewed' | 'questions' | 'complete';
export function nextStage(stage:Stage):Stage {return ({checkout:'paid',paid:'submitted',submitted:'reviewed',reviewed:'questions',questions:'complete',complete:'complete'} as const)[stage];}
