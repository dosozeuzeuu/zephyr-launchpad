/* eslint-disable @next/next/no-img-element */
const TONES = ['#123F2F', '#A9824A', '#B0432E', '#2F5D73', '#6B5B3E', '#3E6B4F'];

export function TokenAvatar({ src, symbol, size = 40 }: { src?: string | null; symbol: string; size?: number }) {
  if (src) return <img src={src} alt="" width={size} height={size} className="rounded-full object-cover bg-line shrink-0 ring-1 ring-line" style={{ width: size, height: size }} />;
  const tone = TONES[(symbol.charCodeAt(0) + (symbol.charCodeAt(1) || 0)) % TONES.length];
  return (
    <span className="rounded-full grid place-items-center font-display shrink-0 text-white" style={{ width: size, height: size, background: tone, fontSize: size * 0.42 }}>
      {symbol.slice(0, 1).toUpperCase()}
    </span>
  );
}
