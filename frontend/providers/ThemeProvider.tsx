import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isReady: boolean;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

type ThemeProviderProps = {
  children: React.ReactNode;
};

const STORAGE_KEY = 'udc-theme-preference';

const getPreferredTheme = (): Theme => {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }

  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
};

const applyThemeToDocument = (theme: Theme) => {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.style.colorScheme = theme;
};

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => (typeof window === 'undefined' ? 'light' : getPreferredTheme()));
  const [isReady, setIsReady] = useState<boolean>(false);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
    applyThemeToDocument(next);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }, [theme, setTheme]);

  useEffect(() => {
    const initial = getPreferredTheme();
    setThemeState(initial);
    applyThemeToDocument(initial);
    setIsReady(true);

    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = (event: MediaQueryListEvent) => {
        const autoTheme: Theme = event.matches ? 'dark' : 'light';
        const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
        if (stored !== 'light' && stored !== 'dark') {
          setTheme(autoTheme);
        }
      };
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }

    return undefined;
  }, [setTheme]);

  useEffect(() => {
    if (isReady) {
      applyThemeToDocument(theme);
    }
  }, [isReady, theme]);

  const value = useMemo<ThemeContextValue>(() => ({ theme, setTheme, toggleTheme, isReady }), [theme, setTheme, toggleTheme, isReady]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
