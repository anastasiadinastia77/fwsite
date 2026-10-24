import { english } from './translations';

export type Language = 'ru' | 'en';
export const LANGUAGE_STORAGE_KEY = 'fw-site-language';

export function resolveLanguage(query: string | null, saved: string | null): Language {
 if (query === 'ru' || query === 'en') return query;
 return saved === 'en' ? 'en' : 'ru';
}

export function initialLanguage(): Language {
 const query = new URLSearchParams(window.location.search).get('lang');
 let saved: string | null = null;
 try { saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY); } catch { /* Storage may be unavailable in private browsing. */ }
 return resolveLanguage(query, saved);
}

export function saveLanguage(language: Language): void {
 try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* Switching still works without storage. */ }
 const url = new URL(window.location.href);
 url.searchParams.set('lang', language);
 try { window.history.replaceState(window.history.state, '', url); } catch { /* A restricted preview may not allow URL updates. */ }
}

export function translate(language: Language, source: string, values: Record<string, string> = {}): string {
 const translated = language === 'en' ? english[source.trim()] : undefined;
 const text = translated === undefined ? source : source.replace(source.trim(), () => translated);
 return text.replace(/\{(\w+)\}/g, (placeholder, key: string) => values[key] ?? placeholder);
}

export function formatPrice(language: Language, price: number): string {
 return price.toLocaleString(language === 'en' ? 'en-GB' : 'ru-RU').replace(/\u00a0/g, ' ') + ' ₽';
}
