/**
 * Egyszerű i18n: JSON szótárak betöltése, nyelv váltása.
 */

import hu from '../locales/hu.json';
import en from '../locales/en.json';

export type Lang = 'hu' | 'en';

type Dict = Record<string, string>;

const dictionaries: Record<Lang, Dict> = {
  hu: hu as Dict,
  en: en as Dict,
};

let current: Lang = 'hu';

/** Fordítás kulcs szerint; hiányzó kulcsnál a kulcs maga jelenik meg. */
export function t(key: string): string {
  return dictionaries[current][key] ?? dictionaries.en[key] ?? key;
}

export function setLang(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang;
}

export function getLang(): Lang {
  return current;
}
