import { useState } from 'react';
import { AudioLines, Check, LockKeyhole } from 'lucide-react';
import { translate } from '../i18n';
import type { Language } from '../i18n';
import { labelServiceNames, money, parsePrice, priceInput, statusNames } from './model';
import type { DemoOrder, LabelService } from './model';

export function OrderDetail({order,language,onAction,onOffer}:{order:DemoOrder;language:Language;onAction:(action:'review'|'questions'|'waive'|'answer'|'ready'|'work',text?:string)=>void;onOffer:(services:LabelService[],confirmed:boolean,price:number|null)=>void}) {
 const t=(text:string)=>translate(language,text);
 const [answer,setAnswer]=useState(order.answer);
 const [services,setServices]=useState<LabelService[]>(order.offer);
 const [confirmed,setConfirmed]=useState(order.introductionConfirmed);
 const [price,setPrice]=useState(order.offerPriceMinor?priceInput(order.offerPriceMinor):'');
 const [error,setError]=useState('');
 const [saved,setSaved]=useState(false);
 if(!order.paid)return <div className="portal-locked"><LockKeyhole size={32}/><h3>{t('Ожидает оплаты')}</h3><p>{t('Трек и действия эксперта откроются после подтверждения оплаты. В кабинете эксперта нельзя самостоятельно подтвердить платёж.')}</p></div>;
 return <>
  <div className="portal-order-facts"><span>{order.artist}</span><span>{order.genre}</span><span>{money(order.totalMinor,order.currency,language)}</span><span className="portal-status">{t(statusNames[order.status])}</span></div>
  <div className="portal-note">{t('Это вымышленный заказ. Кнопки меняют только демо: сообщения, треки и деньги не отправляются.')}</div>
  <div className="portal-track"><AudioLines size={24}/><div><strong>demo-track.mp3</strong><p>{t('Пример трека без аудиофайла')}</p></div></div>
  {order.status==='awaiting_review'&&<><h3>{t('Подготовь разбор')}</h3><p>{t('Оцени готовность к отправке, приоритетные правки и подходящее направление лейблов.')}</p><button className="button primary full" onClick={()=>onAction('review')}>{t('Показать демо-разбор')}</button></>}
  {order.status!=='awaiting_review'&&<div className="portal-voice"><AudioLines size={30}/><div><strong>{t('Голосовой разбор · пример')}</strong><p>{t('В демо запись и воспроизведение не создаются.')}</p></div></div>}
  {order.status==='reviewed'&&<><h3>{t('Один раунд уточнений')}</h3><p>{t('У клиента есть 72 часа и до пяти вопросов текстом или одним голосовым. Здесь можно показать следующий шаг без ожидания.')}</p><div className="portal-form-actions"><button className="button primary" onClick={()=>onAction('questions')}>{t('Симулировать вопросы клиента')}</button><button className="button secondary" onClick={()=>onAction('waive')}>{t('Демо: клиенту всё понятно')}</button></div></>}
  {order.status==='questions_pending'&&<form className="portal-form" onSubmit={event=>{event.preventDefault();onAction('answer',answer);}}><h3>{t('Вопросы клиента')}</h3><ol className="portal-questions"><li>{t('Какие правки важнее перед отправкой?')}</li><li>{t('Каким лейблам может подойти этот трек?')}</li></ol><label>{t('Ответ на раунд вопросов')}<textarea required maxLength={2000} value={answer} onChange={event=>setAnswer(event.target.value)} placeholder={t('Ответь на весь раунд одним сообщением')}/></label><button className="button primary full">{t('Симулировать ответ')}</button></form>}
  {order.answer&&order.status!=='questions_pending'&&<div className="portal-note"><strong>{t('Ответ на уточнения')}</strong><p>{order.answer}</p></div>}
  {order.status==='ready_finish'&&<><h3>{t('Готов ли трек к отправке на лейблы?')}</h3><p>{t('Оценка определяет дальнейшие рекомендации и не гарантирует релиз.')}</p><div className="portal-form-actions"><button className="button primary" onClick={()=>onAction('ready')}>{t('Готов к отправке')}</button><button className="button secondary" onClick={()=>onAction('work')}>{t('Нужна доработка')}</button></div></>}
  {order.status==='completed'&&<><h3><Check size={20}/>{t('Разбор завершён')}</h3>{order.verdict==='work'?<p>{t('Сначала — доработка материала. Помощь с лейблами можно обсудить после правок.')}</p>:<form className="portal-form" onSubmit={event=>{
   event.preventDefault();
   if(!services.length){setError('Выбери хотя бы одну услугу.');return;}
   if(services.includes('introduction')&&!confirmed){setError('Подтверди готовность лично рекомендовать трек.');return;}
   const value=price.trim()?parsePrice(price):null;
   if(price.trim()&&value===null){setError('Укажи корректную стоимость или оставь поле пустым.');return;}
   setError('');onOffer(services,confirmed,value);setSaved(true);
  }}><h3>{t('Следующий шаг — помощь с лейблами')}</h3><p>{t('Выбери до двух услуг для этого трека. Это предложение в демо, клиент его не получит.')}</p>
   <div className="portal-checks">{(Object.keys(labelServiceNames) as LabelService[]).map(service=><label key={service}><input type="checkbox" checked={services.includes(service)} onChange={()=>{
    if(services.includes(service))setServices(services.filter(item=>item!==service));
    else if(services.length<2)setServices([...services,service]);
    else{setError('Можно выбрать до двух услуг.');return;}
    setError('');setSaved(false);
   }}/>{t(labelServiceNames[service])}</label>)}</div>
   {services.includes('introduction')&&<label className="portal-check intro-confirmation"><input type="checkbox" checked={confirmed} onChange={event=>{setConfirmed(event.target.checked);setSaved(false);}}/>{t('Я готов лично рекомендовать этот трек по своим профессиональным контактам.')}</label>}
   <label>{t('Стоимость сопровождения')} <span>({order.currency}, {t('необязательно')})</span><input inputMode="decimal" maxLength={12} value={price} onChange={event=>{setPrice(event.target.value);setSaved(false);}} placeholder={t('По согласованию')}/></label>
   <p className="portal-small">{t('Доля платформы за сопровождение к лейблам согласуется отдельно. Решение о релизе остаётся за лейблом.')}</p>
   {error&&<p role="alert" className="portal-error">{t(error)}</p>}
   <button className="button primary full">{t('Сформировать демо-предложение')}</button>
   {saved&&<div className="portal-note" role="status"><strong>{t('Предложение сохранено в демо')}</strong><p>{services.map(service=>t(labelServiceNames[service])).join(' · ')}</p><p>{price.trim()?money(parsePrice(price)!,order.currency,language):t('Стоимость — по согласованию')}</p></div>}
  </form>}</>}
 </>;
}
