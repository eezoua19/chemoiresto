import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);

const STORAGE_KEY = 'chemoiresto-theme';

function lireThemeInitial() {
  if (typeof window === 'undefined') return 'light';
  try {
    const stocke = window.localStorage.getItem(STORAGE_KEY);
    if (stocke === 'dark' || stocke === 'light') return stocke;
  } catch {
    // localStorage indisponible (navigation privee, etc.) : on retombe sur
    // la preference systeme.
  }
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/** Theme clair/sombre pour toute l'application, persiste et applique au <html>. */
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(lireThemeInitial);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Rien a faire : le theme reste actif pour la session en cours.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(
    () => ({ theme, isDark: theme === 'dark', setTheme, toggleTheme }),
    [theme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme doit être utilise dans un ThemeProvider');
  return context;
}
