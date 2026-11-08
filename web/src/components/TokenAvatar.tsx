/* eslint-disable @next/next/no-img-element */
const HUES = ['#B7A8FF', '#5BE0B3', '#FF7D9C', '#8FC7FF', '#FFD07A', '#C3F07A'];

export function TokenAvatar({ src, symbol, size = 40 }: { src?: string | null; symbol: string; size?: number }) {
  if (src) return <img src={src} alt="" width={size} height={size} className="rounded-xl object-cover bg-haze shrink-0" style={{ width: size, height: size }} />;
  const hue = HUES[(symbol.charCodeAt(0) + (symbol.charCodeAt(1) || 0)) % HUES.length];
  return (
    <span className="rounded-xl grid place-items-center font-display font-bold shrink-0 text-night" style={{ width: size, height: size, background: hue, fontSize: size * 0.4 }}>
      {symbol.slice(0, 2).toUpperCase()}
    </span>
  );
}
