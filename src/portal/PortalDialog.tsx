import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { translate } from '../i18n';
import type { Language } from '../i18n';
import { LanguageSwitch } from '../LanguageSwitch';

export function PortalDialog({title,language,onLanguage,onClose,children}:{title:string;language:Language;onLanguage:(language:Language)=>void;onClose:()=>void;children:ReactNode}) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  const overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
  return ()=>{document.body.style.overflow=overflow;previous?.focus();};
 },[]);
 return <div className="modal-backdrop" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
  <dialog open ref={ref} className="modal portal-dialog" aria-label={title} onKeyDown={event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}
   if(event.key==='Tab'){
    const focusable=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])'));
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
   }
  }}>
   <button className="close" aria-label={translate(language,'Закрыть')} onClick={onClose}><X/></button>
   <div className="modal-language"><LanguageSwitch language={language} onChange={onLanguage}/></div>
   <span className="pill">{translate(language,'Демо-кабинет')}</span>
   <h2>{title}</h2>{children}
  </dialog>
 </div>;
}
