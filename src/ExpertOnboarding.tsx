import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { genres } from './data';
import { translate } from './i18n';
import type { Language } from './i18n';

// ISO 3166-1 regions describe residence and bank location, not citizenship or payment eligibility.
const countryCodes = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const currencies = Intl.supportedValuesOf('currency');
const statusLabels = {
 individual: 'Физлицо без предпринимательского статуса',
 self_employed: 'Самозанятость или местный аналог',
 sole_trader: 'ИП или местный аналог',
 company: 'Компания',
 undecided: 'Нужна помощь с выбором статуса',
};

export function ExpertOnboarding({language}:{language:Language}) {
 const t=(text:string)=>translate(language,text);
 const [step,setStep]=useState(0);
 const [finished,setFinished]=useState(false);
 const [cryptoPreference,setCryptoPreference]=useState(false);
 const [error,setError]=useState('');
 const [draft,setDraft]=useState({name:'',contact:'',country:'',genre:'Organic House',bio:'',releases:'',status:'',bankCountry:'',currency:'RUB',price:'',days:'3',paymentMode:'help',provider:'',paymentUrl:''});
 const update=(key:keyof typeof draft,value:string)=>{setDraft(current=>({...current,[key]:value}));setError('');};
 const regionNames=new Intl.DisplayNames([language],{type:'region'});
 const countries=countryCodes.map(code=>({code,name:regionNames.of(code)??code})).sort((a,b)=>a.name.localeCompare(b.name,language));
 const countryOptions=<><option value="">{t('Выбери страну')}</option>{countries.map(({code,name})=><option key={code} value={code}>{name}</option>)}</>;
 const status=draft.status ? t(statusLabels[draft.status as keyof typeof statusLabels]) : '';
 const price=Number(draft.price).toLocaleString(language==='en'?'en-GB':'ru-RU',{maximumFractionDigits:2});

 if(finished)return <div className="onboarding-result">
  <span className="pill">{t('ДЕМО / БЕЗ ОТПРАВКИ ДАННЫХ')}</span>
  <h2><Check size={28}/>{t('Демо-регистрация пройдена')}</h2>
  <p>{t('Анкета никуда не отправлена. Профиль не опубликован, приём оплаты не подключён.')}</p>
  <div className="notice">{t('В рабочей версии команда проверит профиль, согласует условия и поможет подобрать доступный платёжный сервис. Платные заказы откроются после подтверждения подключения.')}</div>
  <button className="button secondary" onClick={()=>{setFinished(false);setStep(2);}}>{t('Вернуться к анкете')}</button>
 </div>;

 return <>
  <span className="pill">{t('ДЕМО / ДЛЯ МЕЖДУНАРОДНЫХ ЭКСПЕРТОВ')}</span>
  <h2>{t('Стать экспертом')}</h2>
  <p>{t('Покажи свой опыт, задай цену и выбери удобный способ подключения оплаты.')}</p>
  <div className="notice onboarding-demo">{t('Это демонстрация регистрации. Используй вымышленные данные. Паспорт, банковские реквизиты и секретные ключи здесь не нужны.')}</div>
  <ol className="onboarding-steps" aria-label={t('Этапы регистрации')}>{['Профиль','Оплата','Предпросмотр'].map((label,index)=><li key={label} aria-current={step===index?'step':undefined}>{index+1}. {t(label)}</li>)}</ol>
  <form onSubmit={event=>{
   event.preventDefault();
   if(step===1&&draft.paymentMode==='existing'&&draft.paymentUrl){
    try{const url=new URL(draft.paymentUrl);if(url.protocol!=='https:'||url.username||url.password)throw new Error();}
    catch{setError('Укажи HTTPS-ссылку без логина и пароля.');return;}
   }
   setError('');
   if(step===2)setFinished(true);else setStep(step+1);
  }}>
  {step===0&&<>
   <label>{t('Сценическое имя')}<input required maxLength={80} value={draft.name} onChange={event=>update('name',event.target.value)} placeholder={t('Например, Demo Expert')}/></label>
   <label>{t('Тестовый контакт')}<input required maxLength={100} value={draft.contact} onChange={event=>update('contact',event.target.value)} placeholder="@demo_expert"/></label>
   <div className="form-grid">
    <label>{t('Страна проживания')}<select aria-label={t('Страна проживания')} required value={draft.country} onChange={event=>{const value=event.target.value;setDraft(current=>({...current,country:value,bankCountry:current.bankCountry||value}));}}>{countryOptions}</select></label>
    <label>{t('Основной жанр')}<select aria-label={t('Основной жанр')} value={draft.genre} onChange={event=>update('genre',event.target.value)}>{genres.slice(1).map(genre=><option key={genre}>{genre}</option>)}</select></label>
   </div>
   <label>{t('Опыт и помощь с лейблами')}<textarea required maxLength={1200} value={draft.bio} onChange={event=>update('bio',event.target.value)} placeholder={t('Какие треки и жанры разбираешь? С какими лейблами знаком по собственному опыту?')}/></label>
   <label>{t('Подтверждённые релизы')} <span>{t('(необязательно)')}</span><textarea maxLength={1200} value={draft.releases} onChange={event=>update('releases',event.target.value)} placeholder={t('Ссылки на страницы релизов или лейблов')}/></label>
  </>}
  {step===1&&<>
   <h3>{t('Оплата поступает напрямую тебе')}</h3>
   <p>{t('Мы помогаем выбрать и подключить сервис. Возможность приёма платежей зависит от страны, статуса и решения провайдера, а не только от гражданства.')}</p>
   <fieldset className="payment-choice"><legend>{t('Желаемые способы оплаты')}</legend>
    <p>{t('Банковские карты — основной вариант. Доступность конкретных карт проверяется при подключении.')}</p>
    <label><input type="checkbox" checked={cryptoPreference} onChange={event=>setCryptoPreference(event.target.checked)}/><span>{t('Хочу также рассмотреть криптооплату')}</span></label>
   </fieldset>
   {cryptoPreference&&<div className="notice">{t('Криптооплата отмечена только как пожелание. Её доступность зависит от применимого законодательства и провайдера. Для получателей, подпадающих под российский запрет приёма цифровой валюты за услуги, этот способ не подключается. В демо кошелёк не создаётся и деньги не принимаются.')}</div>}
   <label>{t('Статус для приёма оплаты')}<select aria-label={t('Статус для приёма оплаты')} required value={draft.status} onChange={event=>update('status',event.target.value)}><option value="">{t('Выбери статус')}</option>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}</select></label>
   <label>{t('Страна банковского счёта')}<select aria-label={t('Страна банковского счёта')} required value={draft.bankCountry} onChange={event=>update('bankCountry',event.target.value)}>{countryOptions}</select></label>
   <div className="form-grid">
    <label>{t('Цена разбора')}<input required type="number" min="1" max="10000000" step="0.01" value={draft.price} onChange={event=>update('price',event.target.value)}/></label>
    <label>{t('Валюта цены')}<select aria-label={t('Валюта цены')} value={draft.currency} onChange={event=>update('currency',event.target.value)}>{currencies.map(currency=><option key={currency}>{currency}</option>)}</select></label>
   </div>
   <p className="fine">{t('Валюта указывается для согласования. Её поддержка и зарубежные карты проверяются при подключении сервиса.')}</p>
   <label>{t('Срок разбора, рабочих дней')}<select aria-label={t('Срок разбора, рабочих дней')} value={draft.days} onChange={event=>update('days',event.target.value)}>{['1','3','5','7'].map(days=><option key={days}>{days}</option>)}</select></label>
   <fieldset className="payment-choice"><legend>{t('Как подключить оплату')}</legend>
    <label><input type="radio" name="payment-mode" value="help" checked={draft.paymentMode==='help'} onChange={()=>update('paymentMode','help')}/><span>{t('Помогите подобрать сервис')}</span></label>
    <label><input type="radio" name="payment-mode" value="existing" checked={draft.paymentMode==='existing'} onChange={()=>update('paymentMode','existing')}/><span>{t('У меня уже есть платёжный сервис')}</span></label>
   </fieldset>
   {draft.paymentMode==='existing'&&<>
    <label>{t('Название платёжного сервиса')}<input required maxLength={80} value={draft.provider} onChange={event=>update('provider',event.target.value)}/></label>
    <label>{t('Ссылка на оплату')} <span>{t('(необязательно)')}</span><input type="url" maxLength={500} placeholder="https://example.com/payment" value={draft.paymentUrl} onChange={event=>update('paymentUrl',event.target.value)}/></label>
    <p className="fine">{t('Ссылка сама по себе не подключает оплату. Для уведомлений бота нужна проверенная серверная интеграция; секретные ключи передаются только через защищённые настройки.')}</p>
   </>}
   <div className="notice">{t('Для физлиц без предпринимательского статуса доступность подключения проверяется отдельно. Эта анкета не означает одобрение платёжным сервисом.')}</div>
  </>}
  {step===2&&<>
   <h3>{t('Проверь анкету')}</h3>
   <dl className="application-summary">
    {[
     ['Сценическое имя',draft.name],['Тестовый контакт',draft.contact],['Страна проживания',regionNames.of(draft.country)??draft.country],['Основной жанр',draft.genre],['Статус для приёма оплаты',status],['Страна банковского счёта',regionNames.of(draft.bankCountry)??draft.bankCountry],['Цена разбора',`${price} ${draft.currency}`],['Срок разбора, рабочих дней',draft.days],['Подключение оплаты',draft.paymentMode==='help'?t('Поможем подобрать сервис'):draft.provider],['Желаемые способы оплаты',cryptoPreference?t('Карты; криптооплата — на проверку'):t('Банковские карты')],
    ].map(([label,value])=><div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}
   </dl>
   <div className="notice"><strong>{t('Условия для обсуждения')}</strong><p>{t('Доля платформы: 40% за разбор; 33,3% за продакшн, мастеринг и доработку. Сопровождение к лейблам и повторные заказы согласуются отдельно.')}</p></div>
   <p>{t('В реальном запуске профиль появится в каталоге после проверки и согласования условий. Этот шаг только завершает демо.')}</p>
  </>}
  {error&&<p role="alert" className="error">{t(error)}</p>}
  <div className="onboarding-actions">{step>0&&<button type="button" className="button secondary" onClick={()=>{setStep(step-1);setError('');}}>{t('Назад')}</button>}<button type="submit" className="button primary">{t(step===2?'Завершить демо':'Продолжить')}<ArrowRight size={18}/></button></div>
  </form>
 </>;
}
