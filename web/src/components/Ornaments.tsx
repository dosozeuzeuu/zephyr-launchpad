/** Greek key (meander) band, drawn as a repeating SVG pattern. */
export function Meander({ className = '', color = '#123F2F', height = 14 }: { className?: string; color?: string; height?: number }) {
  const id = `meander-${height}-${color.replace('#', '')}`;
  return (
    <svg className={`block w-full ${className}`} height={height} aria-hidden preserveAspectRatio="none">
      <defs>
        <pattern id={id} width={height * 2} height={height} patternUnits="userSpaceOnUse">
          <path
            d={`M0 ${height - 1} H${height * 1.7} V1 H${height * 0.3} V${height * 0.72} H${height * 1.2} V${height * 0.36} H${height * 0.72}`}
            fill="none"
            stroke={color}
            strokeWidth={1.4}
            transform={`scale(1 1)`}
          />
        </pattern>
      </defs>
      <rect width="100%" height={height} fill={`url(#${id})`} />
    </svg>
  );
}

/** A temple among city towers, in fine line work. */
export function CityTemple({ className = '' }: { className?: string }) {
  const ink = '#123F2F';
  const wash = '#EEF2EC';
  const cols = [196, 237.6, 279.2, 320.8, 362.4, 404];
  const windows = (x: number, y: number, w: number, h: number, cols: number, rows: number) => {
    const out = [];
    const gx = w / (cols + 1);
    const gy = h / (rows + 1);
    for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) out.push(<rect key={`${x}-${r}-${c}`} x={x + c * gx - 2.5} y={y + r * gy - 3} width={5} height={6} fill={ink} opacity={(r + c) % 3 === 0 ? 0.55 : 0.14} />);
    return out;
  };
  return (
    <svg viewBox="0 0 600 380" className={className} role="img" aria-label="A Greek temple among city towers">
      <circle cx="474" cy="92" r="38" fill={wash} />
      <circle cx="474" cy="92" r="46" fill="none" stroke={ink} strokeOpacity="0.15" />
      <g fill="none" stroke={ink} strokeWidth="1.2" strokeLinecap="round">
        <path d="M70 70l6 5 6-5M96 58l5 4 5-4M520 150l5 4 5-4" strokeOpacity="0.6" />
      </g>

      {/* city, left */}
      <g stroke={ink} strokeWidth="1.3" fill="#fff">
        <rect x="18" y="214" width="52" height="126" />
        <rect x="76" y="168" width="42" height="172" />
        <line x1="97" y1="168" x2="97" y2="146" />
        <rect x="122" y="244" width="34" height="96" />
      </g>
      {windows(18, 214, 52, 126, 3, 7)}
      {windows(76, 168, 42, 172, 2, 9)}
      {windows(122, 244, 34, 96, 2, 5)}

      {/* city, right */}
      <g stroke={ink} strokeWidth="1.3" fill="#fff">
        <rect x="446" y="196" width="44" height="144" />
        <rect x="496" y="150" width="40" height="190" />
        <line x1="516" y1="150" x2="516" y2="122" />
        <rect x="542" y="232" width="46" height="108" />
      </g>
      {windows(446, 196, 44, 144, 2, 8)}
      {windows(496, 150, 40, 190, 2, 10)}
      {windows(542, 232, 46, 108, 3, 6)}

      {/* temple */}
      <g stroke={ink} strokeWidth="1.4" strokeLinejoin="round">
        <polygon points="164,132 300,76 436,132" fill="#fff" />
        <polygon points="190,126 300,90 410,126" fill={wash} strokeOpacity="0.5" />
        <rect x="164" y="132" width="272" height="9" fill="#fff" />
        <rect x="172" y="141" width="256" height="19" fill="#fff" />
        {Array.from({ length: 16 }).map((_, i) => (
          <line key={i} x1={182 + i * 15.6} y1="144" x2={182 + i * 15.6} y2="157" strokeOpacity="0.45" />
        ))}
        {cols.map((c) => (
          <g key={c}>
            <rect x={c - 14} y="160" width="28" height="8" fill="#fff" />
            <rect x={c - 10} y="168" width="20" height="124" fill="#fff" />
            <line x1={c - 4} y1="172" x2={c - 4} y2="288" strokeOpacity="0.4" />
            <line x1={c + 4} y1="172" x2={c + 4} y2="288" strokeOpacity="0.4" />
            <rect x={c - 13} y="292" width="26" height="6" fill="#fff" />
          </g>
        ))}
        <rect x="170" y="298" width="260" height="10" fill="#fff" />
        <rect x="160" y="308" width="280" height="10" fill="#fff" />
        <rect x="150" y="318" width="300" height="10" fill="#fff" />
      </g>
      <line x1="0" y1="340" x2="600" y2="340" stroke={ink} strokeWidth="1.4" />
      <rect x="150" y="328" width="300" height="12" fill={wash} stroke={ink} strokeWidth="1.4" />
    </svg>
  );
}

/** Small line icons for the fee roads */
export function RoadIcon({ kind }: { kind: 'creator' | 'buyback' | 'holders' }) {
  const s = { fill: 'none', stroke: '#A9824A', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden>
      {kind === 'creator' && (
        <g {...s}>
          <path d="M18 33C9 30 6 20 10 9M22 33c9-3 12-13 8-24" />
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <ellipse cx={8.6 + i * 0.4} cy={13 + i * 5} rx="3.2" ry="1.5" transform={`rotate(${-40 + i * 12} ${8.6 + i * 0.4} ${13 + i * 5})`} />
              <ellipse cx={31.4 - i * 0.4} cy={13 + i * 5} rx="3.2" ry="1.5" transform={`rotate(${40 - i * 12} ${31.4 - i * 0.4} ${13 + i * 5})`} />
            </g>
          ))}
        </g>
      )}
      {kind === 'buyback' && (
        <g {...s}>
          <path d="M20 33c-6 0-9-4-9-9 0-6 6-8 6-14 3 2 5 5 5 8 1-1 2-3 2-5 3 3 5 6 5 11 0 5-3 9-9 9z" />
          <path d="M20 33c-2 0-4-2-4-4 0-3 4-5 4-8 2 2 4 4 4 8 0 2-2 4-4 4z" />
        </g>
      )}
      {kind === 'holders' && (
        <g {...s}>
          <path d="M7 12l13-6 13 6zM8 12h24" />
          <path d="M11 15v14M17 15v14M23 15v14M29 15v14M7 32h26M9 29h22" />
        </g>
      )}
    </svg>
  );
}
