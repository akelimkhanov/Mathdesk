'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { dictionaries, type Locale, type TranslationKey } from './dictionaries';
type Settings = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  t: (key: TranslationKey) => string;
};
const Context = createContext<Settings | null>(null);
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('ru');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const lang = localStorage.getItem('mathdesk-language');
      if (lang === 'ru' || lang === 'kk' || lang === 'en') setLocale(lang);
      if (localStorage.getItem('mathdesk-theme') === 'dark') setTheme('dark');
    } catch {}
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.lang = locale;
    try {
      localStorage.setItem('mathdesk-language', locale);
    } catch {}
  }, [locale, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('mathdesk-theme', theme);
    } catch {}
  }, [theme, hydrated]);
  return (
    <Context.Provider
      value={{
        locale,
        setLocale,
        theme,
        toggleTheme: () => setTheme((v) => (v === 'light' ? 'dark' : 'light')),
        t: (key) => dictionaries[locale][key],
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSettings() {
  const value = useContext(Context);
  if (!value) throw new Error('Missing settings provider');
  return value;
}
