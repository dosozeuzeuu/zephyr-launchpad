export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5 text-laurel">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#123F2F" />
        <g fill="none" stroke="#F7F7F3" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
          <path d="M6 12.5L16 7l10 5.5z" />
          <path d="M7 12.5h18M10 15v8M16 15v8M22 15v8M6.5 25.5h19" />
        </g>
      </svg>
      <span className="font-display text-[26px] leading-none tracking-wide">Zephyr</span>
    </span>
  );
}
