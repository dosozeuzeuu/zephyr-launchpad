import type { Metadata, Viewport } from 'next';

import { Footer } from '@/components/Footer';
import { Nav } from '@/components/Nav';
import { loadConfig } from '@/lib/server/config';

import '@fontsource/marcellus';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Zephyr — launch tokens on Elysium',
  description: 'Launch a token on Elysium in one transaction. Pick its fee and who earns it: you, buybacks, holders.',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = { themeColor: '#F7F7F3', width: 'device-width', initialScale: 1 };

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const config = await loadConfig();
  return (
    <html lang="en">
      <body>
        <Providers config={config}>
          <Nav />
          <main className="mx-auto w-full max-w-[1240px] px-4 sm:px-6 pb-24">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
