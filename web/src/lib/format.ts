export function fmtNum(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(digits) + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(digits) + 'M';
  if (abs >= 1e3) return (n / 1e3).toFixed(digits) + 'K';
  if (abs >= 1) return n.toFixed(digits);
  if (abs === 0) return '0';
  return n.toPrecision(3);
}

/** Prices are tiny; show them with subscript zeros like 0.0₆412 */
export function fmtPrice(n: number): string {
  if (!isFinite(n) || n <= 0) return '—';
  if (n >= 0.01) return n.toFixed(4);
  const s = n.toExponential(3); // 4.123e-8
  const [m, e] = s.split('e-');
  const zeros = Number(e) - 1;
  const digits = m.replace('.', '').slice(0, 4);
  const sub = String(zeros).split('').map((d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]).join('');
  return `0.0${sub}${digits}`;
}

export function fmtHype(n: number, digits = 2): string {
  return `${fmtNum(n, digits)} HYPE`;
}

export function shortAddr(a?: string): string {
  if (!a) return '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function pct(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}
