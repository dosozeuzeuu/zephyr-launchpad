'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

type Body = { id: string; label?: string; href?: string; image?: string | null; ring: number; phase: number; speed: number; r: number; kind: 'token' | 'moon' | 'sat' };

const W = 640;
const H = 540;
const CX = 320;
const CY = 300;
const RINGS = [
  { rx: 270, ry: 70, rot: -9 },
  { rx: 222, ry: 52, rot: 7 },
  { rx: 300, ry: 96, rot: 3 },
];
const PAPER = '#F7F7F3';
const GOLD = '#C9A25E';

function pos(ring: number, t: number) {
  const g = RINGS[ring];
  const x = g.rx * Math.cos(t);
  const y = g.ry * Math.sin(t);
  const a = (g.rot * Math.PI) / 180;
  return { x: CX + x * Math.cos(a) - y * Math.sin(a), y: CY + x * Math.sin(a) + y * Math.cos(a), front: Math.sin(t) > 0, depth: Math.sin(t) };
}

// fixed pseudo-random stars
const STARS = Array.from({ length: 70 }, (_, i) => {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  const r = s - Math.floor(s);
  const s2 = Math.sin(i * 78.233) * 12345.678;
  const r2 = s2 - Math.floor(s2);
  return { x: r * W, y: r2 * H * 0.9, r: i % 9 === 0 ? 1.4 : 0.7, o: 0.25 + ((i * 37) % 60) / 100 };
});

export function OrbitalCity({ tokens }: { tokens: { address: string; symbol: string; image: string | null }[] }) {
  const router = useRouter();
  const refs = useRef<Record<string, SVGGElement | null>>({});
  const [hover, setHover] = useState<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  hoverRef.current = hover;

  const bodies = useMemo<Body[]>(() => {
    const list: Body[] = tokens.slice(0, 6).map((t, i) => ({
      id: t.address,
      label: t.symbol,
      href: `/token/${t.address}`,
      image: t.image,
      ring: i % 3,
      phase: (i * 2.3) % (Math.PI * 2),
      speed: 0.00011 + (i % 3) * 0.00003,
      r: 15,
      kind: 'token',
    }));
    list.push(
      { id: 'm1', ring: 0, phase: 3.6, speed: 0.00009, r: 9, kind: 'moon' },
      { id: 'm2', ring: 2, phase: 1.1, speed: 0.00006, r: 6, kind: 'moon' },
      { id: 's1', ring: 1, phase: 4.9, speed: 0.00016, r: 6, kind: 'sat' },
      { id: 's2', ring: 2, phase: 5.6, speed: 0.0001, r: 6, kind: 'sat' },
    );
    return list;
  }, [tokens]);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = performance.now();
    const clock: Record<string, number> = {};
    const place = (now: number) => {
      const dt = now - last;
      last = now;
      for (const b of bodies) {
        if (clock[b.id] === undefined) clock[b.id] = b.phase;
        // hovering anything slows the whole sky so a coin is easy to click
        if (!reduce) clock[b.id] += b.speed * dt * (hoverRef.current ? 0.12 : 1);
        const p = pos(b.ring, clock[b.id]);
        for (const side of ['back', 'front'] as const) {
          const el = refs.current[`${b.id}-${side}`];
          if (!el) continue;
          el.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${(0.82 + 0.22 * (p.depth + 1) / 2).toFixed(3)})`);
          el.style.display = (side === 'front') === p.front ? '' : 'none';
        }
      }
      if (!reduce) raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    const vis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce) {
        last = performance.now();
        raf = requestAnimationFrame(place);
      }
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [bodies]);

  const ringPath = (i: number, half: 'back' | 'front') => {
    const g = RINGS[i];
    // back = top half (sin<0), front = bottom half
    const sweep = half === 'front' ? 1 : 0;
    return (
      <path
        key={`${i}-${half}`}
        d={`M ${CX - g.rx} ${CY} A ${g.rx} ${g.ry} 0 0 ${sweep} ${CX + g.rx} ${CY}`}
        transform={`rotate(${g.rot} ${CX} ${CY})`}
        fill="none"
        stroke={i === 2 ? GOLD : PAPER}
        strokeOpacity={half === 'front' ? (i === 2 ? 0.7 : 0.5) : 0.22}
        strokeWidth={i === 2 ? 1.2 : 1}
        strokeDasharray={i === 1 ? '2 6' : undefined}
      />
    );
  };

  const renderBody = (b: Body, side: 'back' | 'front') => {
    const key = `${b.id}-${side}`;
    const dim = side === 'back' ? 0.55 : 1;
    if (b.kind === 'moon')
      return (
        <g key={key} ref={(el) => { refs.current[key] = el; }} opacity={dim}>
          <circle r={b.r} fill="#1B4D3A" stroke={PAPER} strokeWidth="1" />
          <path d={`M ${-b.r * 0.3} ${-b.r} A ${b.r} ${b.r} 0 0 1 ${-b.r * 0.3} ${b.r} A ${b.r * 0.7} ${b.r} 0 0 0 ${-b.r * 0.3} ${-b.r}`} fill={PAPER} opacity="0.25" />
        </g>
      );
    if (b.kind === 'sat')
      return (
        <g key={key} ref={(el) => { refs.current[key] = el; }} opacity={dim} stroke={PAPER} strokeWidth="1" fill="none">
          <rect x="-2.5" y="-2.5" width="5" height="5" fill="#123F2F" />
          <path d="M-3 0h-6M3 0h6" />
          <rect x="-15" y="-3" width="6" height="6" />
          <rect x="9" y="-3" width="6" height="6" />
        </g>
      );
    const active = hover === b.id;
    return (
      <g
        key={key}
        ref={(el) => { refs.current[key] = el; }}
        opacity={dim}
        className="cursor-pointer"
        role="link"
        tabIndex={side === 'front' ? 0 : -1}
        aria-label={`Open ${b.label}`}
        onMouseEnter={() => setHover(b.id)}
        onMouseLeave={() => setHover(null)}
        onFocus={() => setHover(b.id)}
        onBlur={() => setHover(null)}
        onClick={() => b.href && router.push(b.href)}
        onKeyDown={(e) => e.key === 'Enter' && b.href && router.push(b.href)}
      >
        <circle r={b.r + 5} fill={GOLD} opacity={active ? 0.35 : 0} />
        <circle r={b.r} fill={PAPER} stroke={GOLD} strokeWidth="1.5" />
        {b.image ? (
          <>
            <clipPath id={`clip-${key}`}>
              <circle r={b.r - 2} />
            </clipPath>
            <image href={b.image} x={-(b.r - 2)} y={-(b.r - 2)} width={(b.r - 2) * 2} height={(b.r - 2) * 2} clipPath={`url(#clip-${key})`} preserveAspectRatio="xMidYMid slice" />
          </>
        ) : (
          <text textAnchor="middle" dominantBaseline="central" fontFamily="Marcellus, serif" fontSize="13" fill="#123F2F">
            {(b.label ?? '?').slice(0, 1)}
          </text>
        )}
        <g opacity={active ? 1 : 0} style={{ transition: 'opacity .2s' }}>
          <rect x={b.r + 6} y="-11" width={(b.label?.length ?? 1) * 8 + 16} height="22" rx="6" fill={PAPER} />
          <text x={b.r + 14} y="0" dominantBaseline="central" fontFamily="IBM Plex Sans, sans-serif" fontSize="12" fontWeight="600" fill="#123F2F">
            {b.label}
          </text>
        </g>
      </g>
    );
  };

  const cols = [262, 290.8, 319.6, 348.4, 377.2];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img" aria-label="A floating Greek city orbited by rings, moons and the most traded tokens">
      {/* sky */}
      {STARS.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={PAPER} opacity={s.o} />
      ))}
      <g transform="translate(548 92)">
        <circle r="34" fill="#1B4D3A" stroke={PAPER} strokeOpacity="0.5" />
        <path d="M-34 0a34 34 0 0 0 68 0" fill={PAPER} opacity="0.08" />
        <ellipse rx="58" ry="11" fill="none" stroke={GOLD} strokeOpacity="0.8" transform="rotate(-18)" />
      </g>
      <g stroke={GOLD} strokeOpacity="0.55" strokeWidth="0.8">
        <path d="M70 70 L118 104 L160 88 L196 130" fill="none" />
        {[[70, 70], [118, 104], [160, 88], [196, 130]].map(([x, y]) => (
          <circle key={x} cx={x} cy={y} r="2" fill={GOLD} />
        ))}
      </g>

      {/* back halves of the rings and the bodies behind the island */}
      {RINGS.map((_, i) => ringPath(i, 'back'))}
      {bodies.map((b) => renderBody(b, 'back'))}

      {/* glow under the island */}
      <ellipse cx={CX} cy={470} rx="120" ry="14" fill={PAPER} opacity="0.06" />
      <g stroke={PAPER} strokeOpacity="0.55" strokeLinecap="round">
        {[300, 320, 340].map((x, i) => (
          <line key={x} x1={x} y1={420 + i * 4} x2={x} y2={448 + i * 6} strokeDasharray="2 5" />
        ))}
      </g>

      {/* floating rock */}
      <path d="M168 300 C 190 340, 230 360, 262 392 L 296 432 L 320 446 L 344 430 L 380 396 C 412 362, 452 338, 472 300 Z" fill="#0E2A1F" stroke={PAPER} strokeOpacity="0.6" strokeWidth="1.2" />
      <g stroke={PAPER} strokeOpacity="0.2" fill="none">
        <path d="M196 322 C 260 340, 380 340, 446 320" />
        <path d="M236 360 C 290 372, 352 372, 404 358" />
        <path d="M276 400 C 300 408, 340 408, 364 398" />
      </g>
      <ellipse cx={CX} cy="300" rx="152" ry="26" fill="#123F2F" stroke={PAPER} strokeOpacity="0.8" strokeWidth="1.2" />
      <ellipse cx={CX} cy="300" rx="132" ry="20" fill="none" stroke={GOLD} strokeOpacity="0.5" strokeDasharray="3 4" />

      {/* towers */}
      <g fill="#123F2F" stroke={PAPER} strokeWidth="1.1">
        <rect x="196" y="196" width="22" height="100" />
        <path d="M207 196 V160" />
        <circle cx="207" cy="158" r="2.5" fill={GOLD} stroke="none" />
        <rect x="222" y="228" width="18" height="70" />
        <rect x="404" y="186" width="22" height="110" />
        <path d="M415 186 V146" />
        <circle cx="415" cy="144" r="2.5" fill={GOLD} stroke="none" />
        <rect x="432" y="236" width="18" height="62" />
        <path d="M244 266 a 16 16 0 0 1 32 0 v 30 h -32 z" />
        <path d="M368 266 a 16 16 0 0 1 32 0 v 30 h -32 z" />
      </g>
      {[[196, 196, 22, 100, 7], [222, 228, 18, 70, 5], [404, 186, 22, 110, 8], [432, 236, 18, 62, 4]].flatMap(([x, y, w, h, n]) =>
        Array.from({ length: n }).map((_, j) => <rect key={`${x}-${j}`} x={x + w / 2 - 2} y={y + 10 + j * ((h - 16) / n)} width="4" height="5" fill={j % 3 === 1 ? GOLD : PAPER} opacity={j % 3 === 1 ? 0.9 : 0.35} />),
      )}

      {/* temple */}
      <g stroke={PAPER} strokeWidth="1.2" strokeLinejoin="round" fill="#123F2F">
        <polygon points="246,214 320,182 394,214" />
        <polygon points="262,210 320,190 378,210" fill="none" strokeOpacity="0.45" />
        <rect x="246" y="214" width="148" height="7" />
        <rect x="252" y="221" width="136" height="10" />
        {cols.map((c) => (
          <g key={c}>
            <rect x={c - 8} y="231" width="16" height="5" />
            <rect x={c - 5.5} y="236" width="11" height="48" />
            <line x1={c} y1="238" x2={c} y2="282" strokeOpacity="0.35" />
          </g>
        ))}
        <rect x="248" y="284" width="144" height="6" />
        <rect x="240" y="290" width="160" height="6" />
      </g>
      <circle cx="320" cy="203" r="3" fill={GOLD} />

      {/* front halves */}
      {RINGS.map((_, i) => ringPath(i, 'front'))}
      {bodies.map((b) => renderBody(b, 'front'))}
    </svg>
  );
}
