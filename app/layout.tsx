// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/context/ThemeContext';

export const metadata: Metadata = {
  title: 'Life-RPG Protocol',
  description: 'Transform your focus sessions into legendary quests. Earn Aura. Level up for real.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#080c14',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="classic" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
