export const genres = ['Все жанры', 'Organic House', 'Melodic House & Techno', 'Progressive House', 'Trance', 'Uplifting Trance', 'Indie Dance', 'Drum & Bass'];
export type Candidate = {
 id: string;
 name: string;
 genres: string[];
 tagline: string;
 description: string;
 photo: string | null;
 photoPosition?: string;
 source: string;
};

// Участие всех артистов пока не подтверждено. Данные MOS и Maxxim — от заказчика.
// Рейтинги лейблов не публикуются без источника, категории и даты.
export const candidates: Candidate[] = [
 {id:'mos',name:'M.O.S.',genres:['Organic House','Progressive House'],tagline:'Основатели Melody Of the Soul · Anjunadeep · All Day I Dream',description:'Дуэт Пола и Ильи. Organic и Progressive House, релизы на Anjunadeep, All Day I Dream и UV. В 2020 году основали Melody Of the Soul — лейбл с артистами из разных стран.',photo:'experts/foHaFz9w.jpeg',photoPosition:'50% 20%',source:'https://soundcloud.com/mosmusique'},
 {id:'maxxim',name:'Maxxim',genres:['Organic House','Melodic House & Techno'],tagline:'Владелец Songuara · Anjunadeep',description:'DJ и продюсер. Релизы на Anjunadeep и A Tribe Called Kotori. В музыке и сетах соединяет Organic, Melodic и Progressive House. Владелец Songuara — по информации заказчика.',photo:'experts/maxxim.jpg',source:'https://soundcloud.com/maxximdj'},
 {id:'gydra',name:'Gydra',genres:['Drum & Bass'],tagline:'Menfort & Bes · Drum & Bass',description:'Drum & Bass-дуэт Menfort и Bes. В подтверждённом профиле проекта на SoundCloud представлены участники и музыка Gydra.',photo:'experts/IMG_8374.JPG',photoPosition:'50% 35%',source:'https://soundcloud.com/gydramusic'},
 {id:'alexander-popov',name:'Alexander Popov',genres:['Trance','Uplifting Trance'],tagline:'Interplay · Trance · Uplifting',description:'DJ и продюсер, автор альбома Reflected. Выпускает Interplay Radioshow. Направления для будущей экспертизы — Trance и Uplifting Trance.',photo:'experts/alexander-popov.jpg',source:'https://soundcloud.com/popovmusic'},
 {id:'deflee',name:'DEFLEE',genres:['Indie Dance'],tagline:'DJ / продюсер · Indie Dance',description:'DJ и продюсер. Направление для будущей экспертизы — Indie Dance: характер трека, грув и клубное звучание. Музыка и сеты артиста доступны в его профиле SoundCloud.',photo:'experts/deflee.jpg',source:'https://soundcloud.com/user-14520440'},
];

export const experts = genres.slice(1).map((genre, i) => ({id:String(i+1),genre,title:`Демо-эксперт / ${genre}`}));
export type Expert = typeof experts[number];
export function demoExpert(genre:string):Expert {
 return experts.find(e=>e.genre===genre) ?? experts[0];
}
export type Stage = 'checkout' | 'paid' | 'submitted' | 'reviewed' | 'questions' | 'complete';
export function nextStage(stage:Stage):Stage {return ({checkout:'paid',paid:'submitted',submitted:'reviewed',reviewed:'questions',questions:'complete',complete:'complete'} as const)[stage];}
