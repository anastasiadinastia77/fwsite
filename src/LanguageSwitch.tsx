import { translate } from './i18n';
import type { Language } from './i18n';

export function LanguageSwitch({language,onChange}:{language:Language;onChange:(language:Language)=>void}) {
 return <div className="language-switch" role="group" aria-label={translate(language,'Язык сайта')}>
  <button type="button" lang="ru" aria-label="Русский" aria-pressed={language==='ru'} onClick={()=>onChange('ru')}>RU</button>
  <button type="button" lang="en" aria-label="English" aria-pressed={language==='en'} onClick={()=>onChange('en')}>EN</button>
 </div>;
}
