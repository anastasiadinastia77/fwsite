import { genres } from '../data';
import type { Language } from '../i18n';
import { countryCodes, currencies } from './countries';

export const DEMO_WORKSPACE_KEY='fw-expert-demo-v1';
export type LabelService='selection'|'preparation'|'introduction';
export type OrderStatus='awaiting_review'|'reviewed'|'questions_pending'|'ready_finish'|'completed';
export type Tab='orders'|'labels'|'payouts'|'profile';
export type Profile={
 name:string;country:string;genres:string[];languages:Language[];bioRu:string;bioEn:string;releases:string;
 priceMinor:number;currency:string;days:number;available:boolean;photo:string|null;labelServices:LabelService[];
 bankCountry:string;recipientStatus:string;reviewState:'draft'|'pending';
};
export type DemoOrder={
 id:string;title:string;artist:string;genre:string;status:OrderStatus;paid:boolean;totalMinor:number;currency:string;
 verdict:'ready'|'work'|null;answer:string;offer:LabelService[];introductionConfirmed:boolean;offerPriceMinor:number|null;
};
export type Workspace={version:1;profile:Profile;orders:DemoOrder[]};
export const labelServiceNames:Record<LabelService,string>={selection:'Подбор лейблов',preparation:'Подготовка демо к отправке',introduction:'Личная рекомендация'};
export const statusNames:Record<OrderStatus,string>={awaiting_review:'Ждёт разбора',reviewed:'Разбор готов',questions_pending:'Вопросы клиента',ready_finish:'Подвести итог',completed:'Завершён'};

export function emptyProfile():Profile {
 return {name:'',country:'',genres:['Organic House'],languages:['ru'],bioRu:'',bioEn:'',releases:'',priceMinor:300000,currency:'RUB',days:3,available:true,photo:null,labelServices:['selection','preparation'],bankCountry:'',recipientStatus:'',reviewState:'draft'};
}
export function createWorkspace(profile:Profile):Workspace {
 const order=(id:string,title:string,artist:string,status:OrderStatus,totalMinor:number,paid=true):DemoOrder=>({id,title,artist,status,totalMinor,paid,genre:'Organic House',currency:'RUB',verdict:status==='completed'?'ready':null,answer:'',offer:[],introductionConfirmed:false,offerPriceMinor:null});
 return {version:1,profile,orders:[
  order('DEMO-101','Afterhours','Demo Artist','awaiting_review',300000),
  order('DEMO-102','Hidden Motion','Demo Producer','questions_pending',300000),
  order('DEMO-103','First Light','Demo Musician','completed',500000),
  order('DEMO-104','New Horizons','Demo Artist','awaiting_review',300000,false),
 ]};
}
export function parsePrice(value:string):number|null {
 const normalized=value.trim().replace(',','.');
 if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(normalized))return null;
 const [whole,fraction='']=normalized.split('.');
 const minor=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 return minor>0&&minor<=100000000?minor:null;
}
export function priceInput(minor:number):string{return (minor/100).toFixed(2).replace(/\.00$/,'');}
export function money(minor:number,currency:string,language:Language):string {
 return new Intl.NumberFormat(language==='ru'?'ru-RU':'en-GB',{style:'currency',currency,minimumFractionDigits:0,maximumFractionDigits:2}).format(minor/100).replace(/\u00a0/g,' ');
}
export function splitAmount(minor:number,kind:'review'|'personal'='review') {
 const platform=Math.round(minor*(kind==='review'?4000:3330)/10000);
 return {platform,expert:minor-platform};
}
export function orderAction(order:DemoOrder,action:'review'|'questions'|'waive'|'answer'|'ready'|'work',text=''):DemoOrder {
 if(!order.paid)throw new Error('PAYMENT_REQUIRED');
 const next={...order};
 if(action==='review'&&order.status==='awaiting_review')next.status='reviewed';
 else if(action==='questions'&&order.status==='reviewed')next.status='questions_pending';
 else if(action==='waive'&&order.status==='reviewed')next.status='ready_finish';
 else if(action==='answer'&&order.status==='questions_pending'&&text.trim()&&text.length<=2000){next.answer=text.trim();next.status='ready_finish';}
 else if((action==='ready'||action==='work')&&order.status==='ready_finish'){next.verdict=action;next.status='completed';}
 else throw new Error('INVALID_STEP');
 return next;
}
export function setOffer(order:DemoOrder,services:LabelService[],confirmed:boolean,priceMinor:number|null):DemoOrder {
 if(!order.paid||order.status!=='completed'||order.verdict!=='ready')throw new Error('NOT_READY');
 if(services.length<1||services.length>2||new Set(services).size!==services.length||services.some(service=>!Object.hasOwn(labelServiceNames,service)))throw new Error('INVALID_SERVICES');
 if(services.includes('introduction')&&!confirmed)throw new Error('INTRODUCTION_CONFIRMATION_REQUIRED');
 if(priceMinor!==null&&(!Number.isSafeInteger(priceMinor)||priceMinor<=0||priceMinor>100000000))throw new Error('INVALID_PRICE');
 return {...order,offer:services,introductionConfirmed:services.includes('introduction')&&confirmed,offerPriceMinor:priceMinor};
}
export function profileProblem(profile:Profile):string|null {
 if(!profile.name.trim()||profile.name.trim().length>80)return 'Укажи сценическое имя.';
 if(!countryCodes.includes(profile.country))return 'Выбери страну проживания.';
 if(!profile.genres.length||profile.genres.some(genre=>!genres.slice(1).includes(genre)))return 'Выбери хотя бы один жанр.';
 if(!profile.languages.length||profile.languages.some(language=>language!=='ru'&&language!=='en'))return 'Выбери язык разбора.';
 if(!Number.isSafeInteger(profile.priceMinor)||profile.priceMinor<=0||profile.priceMinor>100000000||!currencies.includes(profile.currency))return 'Укажи корректную цену разбора.';
 if(![1,3,5,7].includes(profile.days))return 'Выбери срок разбора.';
 if(profile.bioRu.length>1200||profile.bioEn.length>1200||profile.releases.length>2000)return 'Сократи описание профиля.';
 return null;
}

function safePhoto(photo:unknown):photo is string|null {
 return photo===null||(typeof photo==='string'&&photo.length<1500000&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(photo));
}
export function readWorkspace(storage:Pick<Storage,'getItem'>):Workspace|null {
 try{
  const raw=storage.getItem(DEMO_WORKSPACE_KEY);if(!raw||raw.length>1700000)return null;
  const data=JSON.parse(raw) as Workspace;
  if(data.version!==1||!data.profile||!Array.isArray(data.orders)||data.orders.length!==4)return null;
  const p=data.profile;
  if(typeof p.name!=='string'||typeof p.country!=='string'||!Array.isArray(p.genres)||!Array.isArray(p.languages)||typeof p.bioRu!=='string'||typeof p.bioEn!=='string'||typeof p.releases!=='string'||!Array.isArray(p.labelServices)||typeof p.available!=='boolean'||!safePhoto(p.photo)||!['draft','pending'].includes(p.reviewState)||typeof p.bankCountry!=='string'||typeof p.recipientStatus!=='string'||(p.bankCountry&&!countryCodes.includes(p.bankCountry))||!['','individual','self_employed','sole_trader','company','undecided'].includes(p.recipientStatus)||p.labelServices.some(service=>!Object.hasOwn(labelServiceNames,service))||profileProblem(p))return null;
  const seed=createWorkspace(p).orders;
  for(let index=0;index<seed.length;index++){
   const item=data.orders[index];const original=seed[index];
   if(item.id!==original.id||item.title!==original.title||item.artist!==original.artist||item.genre!==original.genre||item.paid!==original.paid||item.totalMinor!==original.totalMinor||item.currency!==original.currency||!Object.hasOwn(statusNames,item.status)||!['ready','work',null].includes(item.verdict)||typeof item.answer!=='string'||item.answer.length>2000||!Array.isArray(item.offer)||typeof item.introductionConfirmed!=='boolean')return null;
   if(!item.paid&&(item.status!=='awaiting_review'||item.offer.length))return null;
   if(item.offer.length)setOffer(item,item.offer,item.introductionConfirmed,item.offerPriceMinor);
  }
  return data;
 }catch{return null;}
}
export function writeWorkspace(storage:Pick<Storage,'setItem'>,workspace:Workspace):boolean {
 try{storage.setItem(DEMO_WORKSPACE_KEY,JSON.stringify(workspace));return true;}catch{return false;}
}
