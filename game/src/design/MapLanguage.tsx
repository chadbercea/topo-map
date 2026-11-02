import type { ReactNode } from 'react';
import { Section, Spec } from './DesignSystem';

// The map's language (ILI-1328): every mark the map draws, in the colours and weights the map
// draws it with (MapScene), each on a tile of the map's own ground.
const C = { teal: '#35d0a5', team: '#f2c14e', red: '#e5484d', blue: '#8fb8ff', grey: '#b8c4bf', orange: '#ff8a2a', water: '#5fa8d3', ink: '#cfe8dc', bg: '#0b0f0d' };

function Tile({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <svg className="ds-tile" viewBox="0 0 200 140" role="img" aria-label={label}>
      <rect width="200" height="140" fill={C.bg} />
      {/* contours, faint, and the grid */}
      {[18, 34, 50].map((r) => (
        <ellipse key={r} cx="150" cy="40" rx={r * 1.4} ry={r} fill="none" stroke={C.teal} strokeOpacity="0.16" />
      ))}
      <path d="M0 47 H200 M0 94 H200 M67 0 V140 M134 0 V140" stroke={C.teal} strokeOpacity="0.35" strokeWidth="0.8" />
      {children}
    </svg>
  );
}

const ping = (x: number, y: number, c: string, pulse = false) => (
  <g>
    {pulse && <circle cx={x} cy={y} r="14" fill="none" stroke={c} strokeOpacity="0.4" strokeWidth="1.5" />}
    <circle cx={x} cy={y} r="9" fill={C.bg} stroke={c} strokeWidth="2" />
    <circle cx={x} cy={y} r="4" fill={c} fillOpacity="0.7" />
  </g>
);
const tri = (x: number, y: number, c: string, dir = 1, z = 8) => (
  <g>
    <polygon points={`${x + z * dir},${y} ${x - z * dir},${y - z * 0.8} ${x - z * dir},${y + z * 0.8}`} fill="none" stroke={C.bg} strokeWidth="3.5" strokeOpacity="0.8" />
    <polygon points={`${x + z * dir},${y} ${x - z * dir},${y - z * 0.8} ${x - z * dir},${y + z * 0.8}`} fill="none" stroke={c} strokeWidth="1.6" />
  </g>
);
const label = (x: number, y: number, t: string, c: string, size = 8) => (
  <text x={x} y={y} fill={c} fontSize={size} textAnchor="middle" fontFamily="JetBrains Mono" letterSpacing="0.06em" paintOrder="stroke" stroke={C.bg} strokeWidth="3">
    {t}
  </text>
);

export function MapLanguage() {
  return (
    <Section id="map" title="The map" intro="A topographic map in 500 m squares (an 8 × 5 grid, A1 to H5): contours, rivers, roads and the town under a teal grid. Ours is gold and teal, theirs is red. Every mark is an outline over a dark halo, so it reads on the contours.">
      <div className="ds-grid ds-map">
        <Spec name="Ground and grid" rule="Contours faint teal, the index lines brighter; rivers blue; roads grey; the grid teal with each square's name in its corner.">
          <Tile label="ground">
            <path d="M0 120 C40 100 70 110 100 80 S160 50 200 60" fill="none" stroke={C.water} strokeWidth="2" />
            <path d="M30 0 L60 140" stroke="#8a8f8c" strokeWidth="2" opacity="0.7" />
            {label(80, 58, 'F4', '#6f8a7d')}
            {label(14, 58, 'E4', '#6f8a7d')}
          </Tile>
        </Spec>
        <Spec name="Pings" rule="Something happened in a square: red a contact, gold a request or building, blue a signal, grey a kill site. New ones pulse until looked at; hover names them.">
          <Tile label="pings">
            {ping(35, 30, C.red, true)}
            {ping(100, 30, C.team)}
            {ping(165, 30, C.blue)}
            {ping(35, 110, C.grey)}
            {label(35, 58, 'contact', C.red)}
            {label(100, 58, 'building', C.team)}
            {label(165, 58, 'signal', C.blue)}
            {label(35, 138, 'kill site', C.grey)}
            <rect x="62" y="96" width="136" height="18" fill={C.bg} fillOpacity="0.9" stroke={C.red} />
            {label(130, 108, 'E3 · A fortified checkpoint', C.red, 7)}
          </Tile>
        </Spec>
        <Spec name="ALPHA and its route" rule="Five gold dots in formation, its callsign beside them. The route: walked legs faint, imaged legs solid, unimaged dashed, a leg into a known contact red.">
          <Tile label="route">
            <path d="M20 120 L60 95" stroke={C.team} strokeOpacity="0.25" strokeWidth="1.5" />
            <path d="M60 95 L110 70" stroke={C.team} strokeOpacity="0.6" strokeWidth="1.5" />
            <path d="M110 70 L150 40" stroke={C.team} strokeOpacity="0.6" strokeWidth="1.5" strokeDasharray="4 4" />
            <path d="M150 40 L190 15" stroke={C.red} strokeOpacity="0.8" strokeWidth="1.5" />
            {[0, 1, 2, 3, 4].map((i) => (
              <circle key={i} cx={56 + (i % 3) * 5} cy={92 + Math.floor(i / 3) * 6} r="2.6" fill={C.team} />
            ))}
            {label(86, 92, 'ALPHA', C.team)}
          </Tile>
        </Spec>
        <Spec name="Vehicles" rule="Every vehicle is the same outlined triangle pointing the way it's going, its callsign under it: red for strikes, orange for the exfil bird (ILI-1294).">
          <Tile label="vehicles">
            {tri(40, 60, C.red)}
            {label(40, 82, 'REAPER-1', C.red)}
            {tri(100, 60, C.red, -1)}
            {label(100, 82, 'HAMMER-2', C.red)}
            {tri(160, 60, C.orange)}
            {label(160, 82, 'RAVEN-6', C.orange)}
          </Tile>
        </Spec>
        <Spec name="Strikes on the ground" rule="OVERWATCH's crosshair on the fighter it shoots next; a red X where a fighter fell, kept as the aftermath; a pale ring where a round missed.">
          <Tile label="strikes">
            <g stroke={C.red} strokeWidth="1.5" fill="none">
              <circle cx="50" cy="60" r="12" />
              <path d="M32 60 H44 M56 60 H68 M50 42 V54 M50 66 V78" />
            </g>
            <g stroke={C.red} strokeWidth="2">
              <path d="M95 55 l10 10 M105 55 l-10 10" />
              <path d="M120 75 l10 10 M130 75 l-10 10" />
            </g>
            <circle cx="160" cy="62" r="5" fill="none" stroke={C.ink} strokeOpacity="0.6" />
          </Tile>
        </Spec>
        <Spec name="CLEAR / CONTACT" rule="Where ALPHA walked in blind: the square flashes what it found, fading over four seconds (ILI-1309).">
          <Tile label="stamps">
            <rect x="67" y="0" width="67" height="47" fill={C.teal} fillOpacity="0.15" stroke={C.teal} strokeWidth="2" />
            {label(100, 27, 'F4 · CLEAR', C.teal, 7)}
            <rect x="67" y="94" width="67" height="46" fill={C.red} fillOpacity="0.15" stroke={C.red} strokeWidth="2" />
            {label(100, 121, 'E3 · CONTACT', C.red, 7)}
          </Tile>
        </Spec>
        <Spec name="Mission points" rule="A, B and C: the infil, the crash site, the exfil. Gold rings, named under them.">
          <Tile label="mission points">
            {['A · INFIL', 'B · CRASH SITE', 'C · EXFIL'].map((t, i) => (
              <g key={t}>
                <circle cx={35 + i * 65} cy="60" r="12" fill="none" stroke={C.team} strokeWidth="2" />
                {label(35 + i * 65, 86, t, C.team, 7)}
              </g>
            ))}
          </Tile>
        </Spec>
        <Spec name="The anchor's leader" rule="A dashed line from a square's anchor to its square, a dot on the square. Off the map, it ends in an arrow at the edge pointing the way, the square named beside it (ILI-1305).">
          <Tile label="leader">
            <rect x="140" y="20" width="56" height="60" fill={C.bg} stroke={C.teal} />
            {label(168, 34, 'E3', C.teal, 7)}
            <path d="M140 50 H70" stroke={C.teal} strokeDasharray="4 3" />
            <circle cx="67" cy="50" r="3" fill={C.teal} />
            <path d="M140 70 L22 118" stroke={C.teal} strokeDasharray="4 3" />
            <polygon points="12,122 26,111 28,124" fill={C.teal} />
            {label(40, 108, 'A1', C.teal, 7)}
          </Tile>
        </Spec>
      </div>
    </Section>
  );
}
