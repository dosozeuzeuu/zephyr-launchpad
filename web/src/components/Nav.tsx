'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { ConnectButton } from './ConnectButton';
import { Logo } from './Logo';

const LINKS = [
  { href: '/', label: 'Explore' },
  { href: '/launch', label: 'Launch' },
  { href: '/fees', label: 'Fees' },
  { href: '/bridge', label: 'Bridge' },
  { href: '/docs', label: 'Docs' },
];

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-paper/85 border-b border-line">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6 h-16 flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2.5 shrink-0" aria-label="Zephyr home">
          <Logo />
        </Link>
        <nav className="hidden md:flex items-center gap-1 relative">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={`relative px-3.5 py-2 rounded-[10px] text-[15px] transition-colors ${active(l.href) ? 'text-paper' : 'text-muted hover:text-laurel'}`}>
              {active(l.href) && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-[10px] bg-laurel" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
              <span className="relative">{l.label}</span>
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ConnectButton />
          <button className="md:hidden btn-ghost h-10 w-10 px-0" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              {open ? <path d="M4 4l10 10M14 4L4 14" /> : <path d="M3 5h12M3 9h12M3 13h12" />}
            </svg>
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="md:hidden overflow-hidden border-t border-line/60">
            <div className="px-4 py-3 flex flex-col">
              {LINKS.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={`py-3 text-lg font-display ${active(l.href) ? 'text-laurel' : 'text-ink'}`}>
                  {l.label}
                </Link>
              ))}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
