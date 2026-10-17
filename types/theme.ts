// types/theme.ts
export type Theme = 'classic' | 'modern';

export interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  toggle: () => void;  // alias for backward compat
  isClassic: boolean;
}
