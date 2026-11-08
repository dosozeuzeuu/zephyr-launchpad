'use client';

import { useEffect, useRef } from 'react';

type Gust = { id: string; isBuy: boolean; hype: number };

/**
 * Faint streamlines drift across the hero. Each live trade sends a gust: a bright band of
 * particles in the trade's colour, sized by how much HYPE moved.
 */
export function WindField({ gusts }: { gusts: Gust[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const seen = useRef<Set<string>>(new Set());
  const queue = useRef<Gust[]>([]);
  const primed = useRef(false);

  useEffect(() => {
    // The first batch is history: mark it seen without animating
    if (!primed.current) {
      gusts.forEach((g) => seen.current.add(g.id));
      primed.current = gusts.length > 0;
      return;
    }
    for (const g of gusts) {
      if (seen.current.has(g.id)) continue;
      seen.current.add(g.id);
      queue.current.push(g);
    }
  }, [gusts]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d')!;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let dpr = 1;

    type P = { x: number; y: number; age: number; life: number; color: string; speed: number; width: number };
    let ps: P[] = [];

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = w * dpr;
      el.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // Smooth, slowly evolving flow angle: mostly west-to-east with gentle swells
    const angle = (x: number, y: number, t: number) =>
      Math.sin(x * 0.0042 + t * 0.00021) * 0.42 + Math.cos(y * 0.0061 - t * 0.00017) * 0.32 + Math.sin((x + y) * 0.0019 + t * 0.0001) * 0.2;

    const spawn = (color: string, speed: number, life: number, width: number, y?: number) => {
      ps.push({ x: -20 + Math.random() * w * 0.15, y: y ?? Math.random() * h, age: 0, life, color, speed, width });
    };

    let raf = 0;
    let last = performance.now();

    const drawStatic = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = 'round';
      for (let i = 0; i < 26; i++) {
        let x = 0;
        let y = (i / 26) * h + 10;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s < 80; s++) {
          const a = angle(x, y, 0);
          x += Math.cos(a) * 14;
          y += Math.sin(a) * 14;
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(183,168,255,0.10)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };

    if (reduce) {
      drawStatic();
      return () => ro.disconnect();
    }

    const frame = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;

      // Calm air: a steady trickle of faint streamers
      if (ps.length < 160 && Math.random() < 0.55) spawn('183,168,255', 0.9 + Math.random() * 0.6, 260 + Math.random() * 260, 1);

      // Gusts from live trades
      while (queue.current.length) {
        const g = queue.current.shift()!;
        const strength = Math.min(1, Math.log10(1 + g.hype * 10) / 2.2);
        const n = Math.round(14 + strength * 46);
        const band = Math.random() * h;
        const color = g.isBuy ? '91,224,179' : '255,125,156';
        for (let i = 0; i < n; i++) spawn(color, 2.2 + strength * 2.6 + Math.random(), 120 + Math.random() * 120, 1.4 + strength * 1.6, band + (Math.random() - 0.5) * h * 0.25);
      }

      // Fade the previous frame for trails
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.085)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';

      const next: P[] = [];
      for (const p of ps) {
        const a = angle(p.x, p.y, now);
        const step = p.speed * (dt / 16);
        const nx = p.x + Math.cos(a) * step * 2.2;
        const ny = p.y + Math.sin(a) * step * 2.2;
        const k = p.age / p.life;
        const alpha = Math.sin(Math.PI * Math.min(1, k)) * (p.width > 1 ? 0.9 : 0.3);
        ctx.strokeStyle = `rgba(${p.color},${alpha})`;
        ctx.lineWidth = p.width;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        p.x = nx;
        p.y = ny;
        p.age += dt / 16;
        if (p.age < p.life && p.x < w + 20 && p.y > -40 && p.y < h + 40) next.push(p);
      }
      ps = next;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden />;
}
