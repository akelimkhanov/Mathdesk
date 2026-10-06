import type { Metadata } from 'next';
import 'katex/dist/katex.min.css';
import './globals.css';
import { SettingsProvider } from '@/i18n/context';
export const metadata: Metadata = {
  title: 'Mathdesk · AI Math Board',
  description: 'Interactive mathematics board for teachers',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <SettingsProvider>{children}</SettingsProvider>
      </body>
    </html>
  );
}
