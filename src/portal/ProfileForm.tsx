import { useState } from 'react';
import { Camera, Check } from 'lucide-react';
import { genres } from '../data';
import type { Language } from '../i18n';
import { translate } from '../i18n';
import { countryCodes, currencies } from './countries';
import { labelServiceNames, parsePrice, priceInput, profileProblem } from './model';
import type { LabelService, Profile } from './model';

export function ProfileForm({initial,language,onSave,onPreview,signup=false}:{initial:Profile;language:Language;onSave:(profile:Profile,submit:boolean)=>void;onPreview?:(profile:Profile)=>void;signup?:boolean}) {
 const t=(text:string)=>translate(language,text);
 const [draft,setDraft]=useState<Profile>(()=>({...initial,languages:signup?[language]:initial.languages}));
 const [price,setPrice]=useState(()=>priceInput(initial.priceMinor));
 const [error,setError]=useState('');
 const regionNames=new Intl.DisplayNames([language],{type:'region'});
 const countries=countryCodes.map(code=>({code,name:regionNames.of(code)??code})).sort((a,b)=>a.name.localeCompare(b.name,language));
 const update=<K extends keyof Profile>(key:K,value:Profile[K])=>{setDraft(current=>({...current,[key]:value}));setError('');};
 const toggleGenre=(genre:string)=>update('genres',draft.genres.includes(genre)?draft.genres.filter(item=>item!==genre):[...draft.genres,genre]);
 const toggleLanguage=(value:Language)=>update('languages',draft.languages.includes(value)?draft.languages.filter(item=>item!==value):[...draft.languages,value]);
 const toggleService=(service:LabelService)=>update('labelServices',draft.labelServices.includes(service)?draft.labelServices.filter(item=>item!==service):[...draft.labelServices,service]);
 const currentProfile=()=>({...draft,name:draft.name.trim(),priceMinor:parsePrice(price)??0});
 const save=(submit:boolean)=>{const profile=currentProfile();const problem=profileProblem(profile);if(problem){setError(problem);return;}onSave(profile,submit);setError('');};
 return <form className="portal-form" onSubmit={event=>{event.preventDefault();save(false);}}>
  {!signup&&<div className="portal-card profile-photo-row">
   <div className="portal-avatar">{draft.photo?<img src={draft.photo} alt={draft.name}/>:<span>{draft.name.trim().slice(0,2).toUpperCase()||'FW'}</span>}</div>
   <div><h2>{t('Фотография профиля')}</h2><p>{t('JPG, PNG или WebP до 1 МБ. Фото останется в этой вкладке.')}</p>
   <label className="portal-upload"><Camera size={18}/>{t('Загрузить фото')}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async event=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>1024*1024){setError('Выбери JPG, PNG или WebP размером до 1 МБ.');return;}
    try{
     const bytes=new Uint8Array(await file.arrayBuffer());
     const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
     const png=[137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value);
     const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
     if(!jpg&&!png&&!webp){setError('Не удалось прочитать изображение. Выбери другое фото.');return;}
     const reader=new FileReader();reader.onload=()=>{if(typeof reader.result==='string')update('photo',reader.result);};reader.onerror=()=>setError('Не удалось прочитать изображение. Выбери другое фото.');reader.readAsDataURL(file);
    }catch{setError('Не удалось прочитать изображение. Выбери другое фото.');}
   }}/></label>{draft.photo&&<button type="button" className="portal-text-button" onClick={()=>update('photo',null)}>{t('Удалить фото')}</button>}</div>
  </div>}
  <div className="portal-form-grid">
   <section className="portal-card"><h2>{t(signup?'Начнём с знакомства':'О себе')}</h2>
    <label>{t('Сценическое имя')}<input required maxLength={80} value={draft.name} onChange={event=>update('name',event.target.value)} placeholder="Demo Expert" autoComplete="off"/></label>
    <label>{t('Страна проживания')}<select aria-label={t('Страна проживания')} required value={draft.country} onChange={event=>update('country',event.target.value)}><option value="">{t('Выбери страну')}</option>{countries.map(({code,name})=><option key={code} value={code}>{name}</option>)}</select></label>
    <fieldset className="portal-fieldset"><legend>{t('Твои жанры')}</legend><div className="portal-chips">{genres.slice(1).map(genre=><button type="button" key={genre} aria-pressed={draft.genres.includes(genre)} onClick={()=>toggleGenre(genre)}>{draft.genres.includes(genre)&&<Check size={14}/>} {genre}</button>)}</div></fieldset>
    {!signup&&<>
     <label>{t('Описание на русском')}<textarea maxLength={1200} value={draft.bioRu} onChange={event=>update('bioRu',event.target.value)} placeholder={t('Опыт, звучание и помощь с лейблами')}/></label>
     <label>{t('Описание на английском')}<textarea maxLength={1200} value={draft.bioEn} onChange={event=>update('bioEn',event.target.value)} placeholder="Your experience, sound and label expertise"/></label>
     <label>{t('Лейблы и релизы')}<textarea maxLength={2000} value={draft.releases} onChange={event=>update('releases',event.target.value)} placeholder={t('Добавь названия и ссылки на свои релизы')}/></label>
    </>}
   </section>
   <section className="portal-card"><h2>{t('Условия разбора')}</h2>
    <div className="portal-fields-row"><label>{t('Цена разбора')}<input required inputMode="decimal" value={price} onChange={event=>{setPrice(event.target.value);setError('');}} maxLength={12}/></label><label>{t('Валюта цены')}<select aria-label={t('Валюта цены')} value={draft.currency} onChange={event=>update('currency',event.target.value)}>{currencies.map(currency=><option key={currency}>{currency}</option>)}</select></label></div>
    <label>{t('Срок разбора, рабочих дней')}<select aria-label={t('Срок разбора, рабочих дней')} value={draft.days} onChange={event=>update('days',Number(event.target.value))}>{[1,3,5,7].map(days=><option key={days}>{days}</option>)}</select></label>
    <fieldset className="portal-fieldset"><legend>{t('Язык разбора')}</legend><div className="portal-checks">{(['ru','en'] as const).map(value=><label key={value}><input type="checkbox" checked={draft.languages.includes(value)} onChange={()=>toggleLanguage(value)}/>{value==='ru'?t('Русский язык'):t('Английский язык')}</label>)}</div></fieldset>
    <div className="portal-note">{t('Один трек, голосовой разбор и один раунд до пяти вопросов в течение 72 часов.')}</div>
    {!signup&&<><label className="portal-check"><input type="checkbox" checked={draft.available} onChange={event=>update('available',event.target.checked)}/>{t('Принимаю новые заказы')}</label><p className="portal-small">{t('Новая цена и доступность не меняют уже созданные заказы.')}</p></>}
   </section>
  </div>
  {!signup&&<section className="portal-card"><h2>{t('Помощь с лейблами')}</h2><p>{t('Выбери, с чем готов помогать после разбора. Для каждого проекта условия обсуждаются отдельно.')}</p><div className="portal-checks services-checks">{(Object.keys(labelServiceNames) as LabelService[]).map(service=><label key={service}><input type="checkbox" checked={draft.labelServices.includes(service)} onChange={()=>toggleService(service)}/>{t(labelServiceNames[service])}</label>)}</div><p className="portal-small">{t('Личная рекомендация — только по твоему решению. Решение о релизе принимает лейбл.')}</p></section>}
  {error&&<p className="portal-error" role="alert">{t(error)}</p>}
  <div className="portal-form-actions"><button className="button primary" type="submit">{t(signup?'Создать демо-кабинет':'Сохранить профиль')}</button>{!signup&&<><button type="button" className="button secondary" onClick={()=>onPreview?.(currentProfile())}>{t('Предпросмотр')}</button><button type="button" className="portal-text-button" onClick={()=>save(true)}>{t('Симулировать отправку на проверку')}</button></>}</div>
 </form>;
}
