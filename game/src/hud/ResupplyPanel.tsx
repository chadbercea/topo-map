import { useRef } from 'react';
import { useGame } from '../sim/store';
import { RESUPPLY_FLIGHT_MS } from '../sim/support';
import type { DropState } from './resupplyScene'; // a type only: the scene loads lazily
import { WireAvatar } from './OrionAvatar';

const LOAD = () => import('./resupplyScene');
const LINGER_MS = 3_000; // "Bundle on the ground" stays up this long, then the panel goes
const LEAVE_MS = 400; // its way out, at the end of the linger

// The resupply drop (ILI-1520), built like the exfil's panel but in the HUD's green: DUSTOFF-2's
// bundle coming down under its chute, in 3D, and the time until it lands counting down; then
// "On the ground" and the reload, and the panel goes.
export function ResupplyPanel() {
  const inbound = useGame((s) => s.inbound.find((i) => i.kind === 'resupply') ?? null);
  const now = useGame((s) => s.elapsedMs);
  // When the last drop landed: the sim drops it from `inbound` on landing, the panel lingers after.
  const landed = useRef<number | null>(null);
  if (inbound) landed.current = inbound.arrivesMs;
  const at = inbound?.arrivesMs ?? landed.current;
  if (at === null || now > at + LINGER_MS || (!inbound && now < at)) return null;
  const down = !inbound || now >= at;
  const left = Math.max(0, at - now);
  const state: DropState = down ? 'down' : 'inbound';
  return (
    <section className="panel air resupply" data-testid="resupply-panel" data-state={state} data-leaving={(down && now >= at + LINGER_MS - LEAVE_MS) || undefined} role="status" aria-label="Resupply">
      <h2>
        <span>DUSTOFF-2</span>
        <span className="where">resupply · {down ? 'on the ground' : 'inbound'}</span>
      </h2>
      <WireAvatar state={state} fallback={<DropMark />} load={LOAD} className="d-model" />
      {!down ? (
        <div className="d-clock">
          <small>Resupply lands</small>
          <b data-testid="resupply-eta">0:{String(Math.ceil(left / 1000)).padStart(2, '0')}</b>
          <span className="decay" role="progressbar" aria-label="Time to drop" aria-valuenow={Math.round((left / RESUPPLY_FLIGHT_MS) * 100)}>
            <span style={{ width: `${Math.min(1, left / RESUPPLY_FLIGHT_MS) * 100}%` }} />
          </span>
        </div>
      ) : (
        <ol className="d-log" data-testid="resupply-log">
          <li>Bundle on the ground</li>
          <li className="d-all">Full reload</li>
        </ol>
      )}
    </section>
  );
}

// The bundle under its chute, in outline: shown until the Three.js model loads, or without WebGL.
function DropMark() {
  return (
    <svg className="d-mark" viewBox="0 0 120 60" aria-hidden>
      <path d="M38 22 Q60 -2 82 22 Z M38 22 L54 40 M82 22 L66 40 M50 22 L56 40 M70 22 L64 40 M52 40 L68 40 L68 54 L52 54 Z M52 47 L68 47" />
    </svg>
  );
}
