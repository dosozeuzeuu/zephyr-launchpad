export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <path d="M8 22c12-9 26 7 42-2M8 34c14-8 30 8 48-1M14 46c10-6 20 4 32-1" fill="none" stroke="#B7A8FF" strokeWidth="6" strokeLinecap="round" />
      </svg>
      <span className="font-display font-extrabold text-[22px] tracking-tight">zephyr</span>
    </span>
  );
}
