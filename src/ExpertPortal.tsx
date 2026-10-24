import { useLayoutEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight, AudioLines, Check, ClipboardList, CreditCard, Disc3, Globe2, Search, UserRound } from 'lucide-react';
import { LanguageSwitch } from './LanguageSwitch';
import type { Language } from './i18n';
import { translate } from './i18n';
import { countryCodes } from './portal/countries';
import { ProfileForm } from './portal/ProfileForm';
import { PortalDialog } from './portal/PortalDialog';
import { OrderDetail } from './portal/OrderDetail';
import { createWorkspace, DEMO_WORKSPACE_KEY, emptyProfile, labelServiceNames, money, orderAction, readWorkspace, setOffer, splitAmount, statusNames, writeWorkspace } from './portal/model';
import type { DemoOrder, LabelService, Profile, Tab, Workspace } from './portal/model';
import './portal.css';

function restore(){try{return readWorkspace(window.sessionStorage);}catch{return null;}}
const tabs=[{id:'orders',label:'Заказы',icon:ClipboardList},{id:'labels',label:'Помощь с лейблами',icon:Disc3},{id:'payouts',label:'Расчёты',icon:CreditCard},{id:'profile',label:'Профиль',icon:UserRound}] as const;

export default function ExpertPortal({language,onLanguage}:{language:Language;onLanguage:(language:Language)=>void}) {
 const t=(text:string)=>translate(language,text);
 const [workspace,setWorkspace]=useState<Workspace|null>(restore);
 const [tab,setTab]=useState<Tab>(()=>{const value=new URLSearchParams(location.search).get('tab');return tabs.some(item=>item.id===value)?value as Tab:'orders';});
 const [toast,setToast]=useState('');
 const [filter,setFilter]=useState('all');
 const [query,setQuery]=useState('');
 const [selected,setSelected]=useState<string|null>(null);
 const [preview,setPreview]=useState<Profile|null>(null);
 const [reset,setReset]=useState(false);
 const [error,setError]=useState('');
 const hasWorkspace=workspace!==null;
 useLayoutEffect(()=>{window.scrollTo({top:0,behavior:'instant'});},[hasWorkspace,tab]);
 const home=`${import.meta.env.BASE_URL}?lang=${language}`;
 const commit=(next:Workspace,message='Изменения сохранены в этой вкладке.')=>{
  let saved=false;try{saved=writeWorkspace(window.sessionStorage,next);}catch{/* The demo still works in memory. */}
  setWorkspace(next);setToast(saved?message:'Сохранено в памяти страницы. После обновления данные сбросятся.');setError('');
 };
 const navigate=(value:Tab)=>{setTab(value);setToast('');setError('');const url=new URL(location.href);url.searchParams.set('tab',value);try{history.replaceState(history.state,'',url);}catch{/* Navigation remains usable. */}};
 const saveProfile=(profile:Profile,submit:boolean)=>{
  const next={...profile,reviewState:submit?'pending' as const:'draft' as const};
  if(workspace)commit({...workspace,profile:next},submit?'Демо: профиль отмечен как отправленный на проверку. Данные никуда не переданы.':'Изменения сохранены в этой вкладке.');
  else{commit(createWorkspace(next),'Демо-кабинет создан. Все заказы вымышлены.');navigate('orders');}
 };
 const resetDemo=()=>{try{sessionStorage.removeItem(DEMO_WORKSPACE_KEY);}catch{/* Only this workspace is reset. */}setWorkspace(null);setSelected(null);setReset(false);setToast('');setError('');setFilter('all');setQuery('');navigate('orders');};

 if(!workspace)return <div className="expert-portal portal-welcome"><a className="skip-link" href="#expert-main">{t('Перейти к содержимому')}</a>
  <div className="portal-welcome-header"><a className="portal-brand" href={home} aria-label="FW Label Network">FW<span><ArrowUpRight size={30}/></span><small>LABEL NETWORK</small></a><LanguageSwitch language={language} onChange={onLanguage}/></div>
  <main className="portal-welcome-main" id="expert-main" tabIndex={-1}><div className="portal-welcome-copy"><span className="portal-eyebrow">{t('Демонстрация для экспертов')}</span><h1>{t('Твой опыт.')}<br/><span className="accent">{t('Их следующий релиз.')}</span></h1><p>{t('Зарегистрируйся в демо и посмотри, как принимать разборы, помогать с лейблами и управлять своим профилем.')}</p><div className="portal-note"><strong>{t('Это демо, а не настоящий аккаунт.')}</strong><p>{t('Анкета и изменения сохраняются только в этой вкладке браузера. Платежей, публикации профиля и отправки данных нет. Используй тестовые данные.')}</p></div><ul className="portal-welcome-list">{['Сам устанавливаешь цену и срок','Помощь с лейблами после разбора','Один раунд до пяти вопросов','Русский и английский интерфейс'].map(item=><li key={item}><Check size={18}/>{t(item)}</li>)}</ul><a className="portal-back" href={home}><ArrowLeft size={17}/>{t('Вернуться на сайт')}</a></div><section className="portal-signup" aria-labelledby="portal-signup-title"><h2 id="portal-signup-title">{t('Регистрация в демо')}</h2><p>{t('Заполни короткую анкету. Остальное можно добавить в профиле.')}</p><ProfileForm initial={emptyProfile()} language={language} onSave={saveProfile} signup/></section></main>
 </div>;

 const {profile,orders}=workspace;
 const selectedOrder=orders.find(order=>order.id===selected);
 const completed=orders.filter(order=>order.paid&&order.status==='completed');
 const working=orders.filter(order=>order.paid&&order.status!=='completed');
 const totalExpert=completed.reduce((sum,order)=>sum+splitAmount(order.totalMinor).expert,0);
 const totalPlatform=completed.reduce((sum,order)=>sum+splitAmount(order.totalMinor).platform,0);
 const filtered=orders.filter(order=>(filter==='all'||(filter==='unpaid'?!order.paid:order.paid&&order.status===filter))&&`${order.title} ${order.artist} ${order.genre}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 const updateOrder=(id:string,next:DemoOrder)=>commit({...workspace,orders:orders.map(order=>order.id===id?next:order)},'Демо обновлено. Сообщения клиентам не отправлялись.');
 const handleAction=(action:'review'|'questions'|'waive'|'answer'|'ready'|'work',text='')=>{if(!selectedOrder)return;try{updateOrder(selectedOrder.id,orderAction(selectedOrder,action,text));}catch{setError('Действие недоступно на этом этапе.');}};
 const handleOffer=(services:LabelService[],confirmed:boolean,price:number|null)=>{if(!selectedOrder)return;try{updateOrder(selectedOrder.id,setOffer(selectedOrder,services,confirmed,price));}catch{setError('Проверь условия предложения.');}};

 return <div className="expert-portal portal-layout"><a className="skip-link" href="#expert-main">{t('Перейти к содержимому')}</a>
  <aside className="portal-sidebar"><a className="portal-brand" href={home} aria-label="FW Label Network">FW<span><ArrowUpRight size={30}/></span><small>LABEL NETWORK</small></a><span className="portal-demo-pill">{t('Демо-кабинет')}</span><div className="portal-nav" role="navigation" aria-label={t('Разделы кабинета')}>{tabs.map(({id,label,icon:Icon})=><button key={id} className={tab===id?'selected':''} aria-current={tab===id?'page':undefined} onClick={()=>navigate(id)}><Icon size={21}/>{t(label)}</button>)}</div><div className="portal-sidebar-bottom"><p>{t('Профиль виден только тебе в этой вкладке.')}</p><a href={home}><ArrowLeft size={16}/>{t('На сайт')}</a><button onClick={()=>setReset(true)}>{t('Сбросить демо')}</button></div></aside>
  <div className="portal-body"><div className="portal-topbar"><div><span className="portal-small">{t('Кабинет эксперта')}</span><strong>{profile.name}</strong></div><LanguageSwitch language={language} onChange={onLanguage}/></div>
   <div className="portal-demo-strip"><Globe2 size={17}/><span>{t('Демо: заказы вымышлены. Платежи и выплаты отключены.')}</span></div>
   <main className="portal-workspace" id="expert-main" tabIndex={-1}>
    {toast&&<p className="portal-toast" role="status"><Check size={17}/>{t(toast)}</p>}{error&&<p className="portal-error" role="alert">{t(error)}</p>}
    <div className="portal-page-heading"><div><span className="portal-eyebrow">FW / EXPERT SPACE</span><h1>{t(tabs.find(item=>item.id===tab)!.label)}</h1><p>{t({orders:'Треки, вопросы и следующие шаги для музыки.',labels:'Помоги артисту подготовиться к подходящему лейблу.',payouts:'Пример расчётов по завершённым заказам.',profile:'Так тебя смогут увидеть музыканты.'}[tab])}</p></div>{tab!=='profile'&&<button className="portal-profile-shortcut" onClick={()=>navigate('profile')}><div className="portal-avatar small">{profile.photo?<img src={profile.photo} alt=""/>:<UserRound size={24}/>}</div><span>{t(profile.available?'Принимаю заказы':'Новые заказы на паузе')}<ArrowUpRight size={16}/></span></button>}</div>
    {tab==='orders'&&<>
     <div className="portal-stats"><article><span>{t('В работе')}</span><strong>{working.length}</strong></article><article><span>{t('Разборов завершено')}</span><strong>{completed.length}</strong></article><article><span>{t('Расчётная доля за завершённые')}</span><strong>{money(totalExpert,'RUB',language)}</strong><small>{t('До налогов и расходов · не выплата')}</small></article></div>
     <div className="portal-order-tools"><label className="portal-search"><Search size={19}/><span className="portal-sr-only">{t('Поиск заказов')}</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder={t('Трек или артист')}/></label><label><span className="portal-sr-only">{t('Статус заказа')}</span><select aria-label={t('Статус заказа')} value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">{t('Все заказы')}</option>{Object.entries(statusNames).map(([key,label])=><option key={key} value={key}>{t(label)}</option>)}<option value="unpaid">{t('Ожидает оплаты')}</option></select></label></div>
     <div className="portal-order-list">{filtered.map(order=><article key={order.id} className="portal-order-card"><div className="portal-order-icon"><AudioLines size={26}/></div><div className="portal-order-main"><span className="portal-small">{order.id} · {order.genre}</span><h2>{order.title}</h2><p>{order.artist}</p></div><div className="portal-order-side"><span className={`portal-status ${!order.paid?'unpaid':''}`}>{t(!order.paid?'Ожидает оплаты':statusNames[order.status])}</span><strong>{money(order.totalMinor,order.currency,language)}</strong><button className="portal-open-order" onClick={()=>{setSelected(order.id);setError('');}}>{t('Открыть заказ')}<ArrowUpRight size={17}/></button></div></article>)}{!filtered.length&&<div className="portal-empty"><Search size={32}/><h2>{t('Заказы не найдены')}</h2><p>{t('Измени поиск или выбери другой статус.')}</p><button className="button secondary" onClick={()=>{setQuery('');setFilter('all');}}>{t('Показать все заказы')}</button></div>}</div>
    </>}
    {tab==='profile'&&<><div className="portal-profile-status"><span className="portal-status">{t(profile.reviewState==='pending'?'Демо: на проверке':'Демо: черновик профиля')}</span><p>{t('Отправка на проверку здесь симулируется. Анкета не попадает в каталог или к оператору.')}</p></div><ProfileForm initial={profile} language={language} onSave={saveProfile} onPreview={setPreview}/></>}
    {tab==='labels'&&<>
     <div className="portal-card portal-label-intro"><span className="portal-eyebrow">DIRECT LABEL ACCESS</span><h2>{t('Разбор только начало')}</h2><p>{t('Сначала — готовность музыки и подходящие лейблы. Личная рекомендация возможна только по твоему решению и не гарантирует релиз.')}</p><div className="portal-label-services">{profile.labelServices.map(service=><span key={service}><Check size={16}/>{t(labelServiceNames[service])}</span>)}</div><button className="portal-text-button" onClick={()=>navigate('profile')}>{t('Настроить услуги в профиле')}<ArrowUpRight size={16}/></button></div>
     <h2 className="portal-section-title">{t('Треки для следующего шага')}</h2><div className="portal-label-projects">{orders.filter(order=>order.paid&&order.status==='completed').map(order=><article className="portal-card" key={order.id}><span className="portal-status">{t(order.verdict==='ready'?'Готов к отправке':'Нужна доработка')}</span><h3>{order.title}</h3><p>{order.artist} · {order.genre}</p>{order.offer.length>0&&<p>{order.offer.map(service=>t(labelServiceNames[service])).join(' · ')}</p>}<button className="button secondary" onClick={()=>setSelected(order.id)}>{t(order.verdict==='ready'?'Составить предложение':'Посмотреть итог')}<ArrowUpRight size={17}/></button></article>)}</div><div className="portal-note">{t('Стоимость и доля платформы за сопровождение к лейблам согласуются отдельно. Это не автоматический питчинг.')}</div>
    </>}
    {tab==='payouts'&&<>
     <div className="portal-note"><strong>{t('Платежи и выплаты не подключены')}</strong><p>{t('Ни одна сумма в этом кабинете не является настоящим балансом. Здесь показан расчёт по вымышленным заказам.')}</p></div>
     <div className="portal-stats"><article><span>{t('Завершённые разборы')}</span><strong>{money(totalExpert+totalPlatform,'RUB',language)}</strong></article><article><span>{t('Доля платформы · 40%')}</span><strong>{money(totalPlatform,'RUB',language)}</strong></article><article><span>{t('Твоя расчётная доля · 60%')}</span><strong>{money(totalExpert,'RUB',language)}</strong><small>{t('До налогов и расходов')}</small></article></div>
     <div className="portal-card"><h2>{t('Расчёт по заказам')}</h2><div className="portal-ledger">{orders.filter(order=>order.paid).map(order=><div key={order.id}><div><strong>{order.title}</strong><span>{t(order.status==='completed'?'Завершён':'В работе — ещё не в расчёте')}</span></div><div><strong>{money(splitAmount(order.totalMinor).expert,order.currency,language)}</strong><span>{t('60% от стоимости разбора')}</span></div></div>)}</div></div>
     <PayoutPreferences profile={profile} language={language} onSave={next=>commit({...workspace,profile:next})}/>
     <div className="portal-note">{t('Для продакшна, мастеринга и доработки согласована доля платформы 33,3%. Условия сопровождения к лейблам и повторных заказов обсуждаются отдельно.')}</div>
    </>}
   </main><div className="portal-footer"><span>FW LABEL NETWORK / DEMO</span><span>{t('Закрытие вкладки может сбросить демо. Это не серверный аккаунт.')}</span><button className="portal-text-button portal-mobile-reset" onClick={()=>setReset(true)}>{t('Сбросить демо')}</button></div>
  </div>
  {selectedOrder&&<PortalDialog title={selectedOrder.title} language={language} onLanguage={onLanguage} onClose={()=>{setSelected(null);setError('');}}><OrderDetail key={selectedOrder.id} order={selectedOrder} language={language} onAction={handleAction} onOffer={handleOffer}/></PortalDialog>}
  {preview&&<PortalDialog title={t('Предпросмотр профиля')} language={language} onLanguage={onLanguage} onClose={()=>setPreview(null)}><div className="portal-preview"><div className="portal-avatar">{preview.photo?<img src={preview.photo} alt={preview.name}/>:<UserRound size={40}/>}</div><h3>{preview.name}</h3><p>{preview.genres.join(' · ')}</p><p>{(language==='en'?preview.bioEn:preview.bioRu)||t('Описание пока не добавлено.')}</p><p>{money(preview.priceMinor,preview.currency,language)} · {preview.days} {t('рабочих дней')}</p><span className="portal-status">{t('Демо-профиль · не опубликован')}</span></div></PortalDialog>}
  {reset&&<PortalDialog title={t('Сбросить демо?')} language={language} onLanguage={onLanguage} onClose={()=>setReset(false)}><p>{t('Анкета и действия с вымышленными заказами в этой вкладке будут удалены. Язык сайта сохранится.')}</p><div className="portal-form-actions"><button className="button primary" onClick={resetDemo}>{t('Сбросить и начать заново')}</button><button className="button secondary" onClick={()=>setReset(false)}>{t('Отмена')}</button></div></PortalDialog>}
 </div>;
}

function PayoutPreferences({profile,language,onSave}:{profile:Profile;language:Language;onSave:(profile:Profile)=>void}) {
 const t=(text:string)=>translate(language,text);
 const [country,setCountry]=useState(profile.bankCountry||profile.country);
 const [status,setStatus]=useState(profile.recipientStatus);
 const names=new Intl.DisplayNames([language],{type:'region'});
 const countries=countryCodes.map(code=>({code,name:names.of(code)??code})).sort((a,b)=>a.name.localeCompare(b.name,language));
 return <form className="portal-card portal-form" onSubmit={event=>{event.preventDefault();onSave({...profile,bankCountry:country,recipientStatus:status});}}><h2>{t('Предпочтения для будущих выплат')}</h2><p>{t('Укажи страну и статус для обсуждения условий. Номер карты, паспорт и кошелёк в демо не нужны.')}</p><div className="portal-fields-row"><label>{t('Страна банковского счёта')}<select aria-label={t('Страна банковского счёта')} required value={country} onChange={event=>setCountry(event.target.value)}><option value="">{t('Выбери страну')}</option>{countries.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}</select></label><label>{t('Твой статус')}<select aria-label={t('Твой статус')} value={status} onChange={event=>setStatus(event.target.value)}><option value="">{t('Пока не указан')}</option>{Object.entries({individual:'Физлицо без предпринимательского статуса',self_employed:'Самозанятость или местный аналог',sole_trader:'ИП или местный аналог',company:'Компания',undecided:'Нужна помощь с выбором статуса'}).map(([key,label])=><option key={key} value={key}>{t(label)}</option>)}</select></label></div><button className="button secondary">{t('Сохранить настройки')}</button><p className="portal-small">{t('Сохранение этих полей не подключает приём денег, выплаты или криптовалюту.')}</p></form>;
}
