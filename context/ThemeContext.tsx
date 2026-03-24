'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Theme, ThemeContextType } from '@/types/theme';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'life-rpg-theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('classic');

  // Load persisted theme on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored && (stored === 'classic' || stored === 'modern')) {
      setTheme(stored);
    }
  }, []);

  // Sync data-theme attribute & persist
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'classic' ? 'modern' : 'classic'));
  };

  const value: ThemeContextType = {
    theme,
    toggleTheme,
    toggle: toggleTheme,
    isClassic: theme === 'classic',
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
