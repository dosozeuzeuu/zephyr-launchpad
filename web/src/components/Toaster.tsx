'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

type Toast = { id: number; kind: 'ok' | 'err' | 'wait'; title: string; body?: string; href?: string };
let listeners: ((t: Toast[]) => void)[] = [];
let toasts: Toast[] = [];
let nextId = 1;

function emit() {
  for (const l of listeners) l([...toasts]);
}

export function toast(t: Omit<Toast, 'id'>, ms = 6000): number {
  const id = nextId++;
  toasts = [...toasts, { ...t, id }];
  emit();
  if (t.kind !== 'wait') setTimeout(() => dismiss(id), ms);
  return id;
}

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    listeners.push(setItems);
    return () => {
      listeners = listeners.filter((l) => l !== setItems);
    };
  }, []);
  return (
    <div className="fixed z-50 bottom-4 inset-x-4 sm:left-auto sm:right-6 sm:w-[360px] flex flex-col gap-2" aria-live="polite">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40 }}
            className="panel bg-dusk px-4 py-3 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]"
          >
            <div className="flex items-start gap-3">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.kind === 'ok' ? 'bg-buy' : t.kind === 'err' ? 'bg-sell' : 'bg-lilac animate-pulse'}`} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.title}</p>
                {t.body && <p className="text-sm text-mist break-words">{t.body}</p>}
                {t.href && (
                  <a href={t.href} target="_blank" rel="noreferrer" className="text-sm text-lilac hover:underline">
                    View transaction
                  </a>
                )}
              </div>
              <button onClick={() => dismiss(t.id)} className="text-mist hover:text-cloud" aria-label="Dismiss">
                ×
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
