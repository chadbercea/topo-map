import { useGame } from '../sim/store';
import { RUN_MS, SNIPER_CALLSIGN, sniperGone } from '../sim/sniper';
import type { RifleState } from './rifleScene'; // a type only: the module itself loads lazily
import { WireAvatar } from './OrionAvatar';

const loadRifle = () => import('./rifleScene');
const FLASH_MS = 400; // "Tango down" after a hit, before it reads "Racking"

// The sniper panel (ILI-1253), at its square's anchor (ILI-1303): OVERWATCH's rifle, its rounds,
// the five seconds it has, and what it's doing: on target, a shot, racking the bolt. Its
// crosshairs are on the map (MapScene). It goes when it's done firing.
export function SniperPanel({ square }: { square: string }) {
  const r = useGame((s) => s.sniper);
  const now = useGame((s) => s.elapsedMs);
  if (!r || r.square !== square || sniperGone(r, now)) return null;
  const fired = r.shots.filter((x) => x.atMs <= now);
  const last = fired.at(-1);
  const left = Math.max(0, r.endMs - now);
  const line = r.done
    ? fired.length ? `${fired.filter((x) => x.hit).length} down` : 'No shot'
    : last && now - last.atMs < FLASH_MS
      ? last.hit ? 'Tango down' : 'Miss'
      : fired.length < r.shots.length
        ? fired.length ? 'Racking' : 'On target'
        : 'Holding';
  const state: RifleState = r.done ? 'done' : last && now - last.atMs < FLASH_MS ? 'firing' : 'aiming';
  return (
    <section className="sniper" data-testid="sniper-panel" data-state={state} data-leaving={r.done || undefined} role="status" aria-label="Sniper">
      <h3>
        <span>{SNIPER_CALLSIGN}</span>
        <span className="where">sniper · {r.square}</span>
      </h3>
      <WireAvatar state={state} fallback={<RifleMark />} load={loadRifle} className="s-model" />
      <div className="s-read">
        <b data-testid="sniper-line">{line}</b>
        <span className="s-rounds" aria-label={`${r.rounds - fired.length} rounds left`} data-testid="sniper-rounds">
          {Array.from({ length: r.rounds }, (_, i) => (
            <i key={i} data-spent={i < fired.length || undefined} />
          ))}
        </span>
        <span className="decay" role="timer" aria-label="Time left">
          <span style={{ width: `${(left / RUN_MS) * 100}%` }} />
        </span>
      </div>
    </section>
  );
}

// OVERWATCH's rifle in outline, side on: shown until the Three.js rifle loads, or without WebGL.
function RifleMark() {
  return (
    <svg className="s-mark" viewBox="0 0 120 40" aria-hidden>
      <path d="M4 18 L30 16 L30 24 L18 30 L4 30 Z M30 17 L60 17 L60 22 L30 22 M60 19 L114 19 M38 10 L58 10 L58 14 L38 14 Z M44 22 L46 30 M100 20 L96 34 M100 20 L104 34" />
    </svg>
  );
}
