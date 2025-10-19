import React from 'react';
import useTheme from '../hooks/useTheme';

const SunIcon = () => (
  <svg
    className="h-5 w-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2" />
    <path d="M12 19v2" />
    <path d="M5.22 5.22l1.42 1.42" />
    <path d="M17.36 17.36l1.42 1.42" />
    <path d="M3 12h2" />
    <path d="M19 12h2" />
    <path d="M5.22 18.78l1.42-1.42" />
    <path d="M17.36 6.64l1.42-1.42" />
  </svg>
);

const MoonIcon = () => (
  <svg
    className="h-5 w-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12.79A9 9 0 1 1 11.21 3c.47 0 .93.03 1.38.1a7 7 0 0 0 9.31 9.69c.07.45.1.91.1 1.38z" />
  </svg>
);

const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme, isReady } = useTheme();

  if (!isReady) {
    return null;
  }

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="fixed top-6 right-6 z-[4000] inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-100"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span className="sr-only">Toggle theme</span>
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
};

export default ThemeToggle;
