import { useGame } from '../sim/store';
import { AIR, airGone, arrived, LINGER_MS, type AirWeapon } from '../sim/air';
import type { DroneState as AirState } from './droneScene'; // a type only: the scenes load lazily
import { WireAvatar } from './OrionAvatar';

const LOAD = { drone: () => import('./droneScene'), heli: () => import('./heliScene') };
const LEAVE_MS = 400; // the panel's way out, at the end of its linger

// An air strike's panel (ILI-1252, ILI-1254): it pops open when HQ calls REAPER-1 or HAMMER-2
// in. The aircraft, and the time to target counting down; then a "Tango down" for each fighter
// as it passes over it on the map, a sign-off, and the panel goes.
export function AirPanel({ weapon }: { weapon: AirWeapon }) {
  const r = useGame((s) => (weapon === 'drone' ? s.drone : s.heli));
  const now = useGame((s) => s.elapsedMs);
  const contacts = useGame((s) => s.contacts);
  if (!r || airGone(r, now)) return null;
  const over = arrived(r, now);
  const flight = AIR[weapon].flightMs;
  const left = Math.max(0, r.arriveMs - now);
  const kills = r.kills ?? [];
  const down = kills.filter((k) => k.atMs <= now);
  const done = r.doneMs !== null;
  const leaving = done && now >= r.doneMs! + LINGER_MS - LEAVE_MS;
  const state: AirState = done ? 'done' : over ? 'strike' : 'inbound';
  const cleared = done && !contacts.some((c) => c.square === r.square && (c.status === 'hidden' || c.status === 'revealed') && c.units.length);
  const signOff = !kills.length ? 'No targets in the square' : cleared ? 'All targets neutralized' : `${kills.length} down`;
  return (
    <section className={`panel air ${weapon}`} data-testid={`${weapon}-panel`} data-state={state} data-leaving={leaving || undefined} role="status" aria-label={AIR[weapon].label}>
      <h2>
        <span>{AIR[weapon].callsign}</span>
        <span className="where">
          {AIR[weapon].label} · {r.square}
        </span>
      </h2>
      <WireAvatar state={state} fallback={weapon === 'drone' ? <DroneMark /> : <HeliMark />} load={LOAD[weapon]} className="d-model" />
      {!over ? (
        <div className="d-clock">
          <small>Time to target</small>
          <b data-testid={`${weapon}-eta`}>0:{String(Math.ceil(left / 1000)).padStart(2, '0')}</b>
          <span className="decay" role="progressbar" aria-label="Time to target" aria-valuenow={Math.round((left / flight) * 100)}>
            <span style={{ width: `${(left / flight) * 100}%` }} />
          </span>
        </div>
      ) : (
        <ol className="d-log" data-testid={`${weapon}-log`}>
          {down.map((k) => (
            <li key={`${k.contactId}-${k.unit}`}>Tango down</li>
          ))}
          {done && <li className="d-all">{signOff}</li>}
        </ol>
      )}
    </section>
  );
}

// The aircraft in outline, top down: shown until the Three.js model loads, or without WebGL.
function DroneMark() {
  return (
    <svg className="d-mark" viewBox="0 0 120 60" aria-hidden>
      <path d="M60 8 L60 50 M8 26 L112 26 L112 30 L8 30 Z M44 50 L76 50 M60 8 Q56 12 56 18 L64 18 Q64 12 60 8" />
    </svg>
  );
}
function HeliMark() {
  return (
    <svg className="d-mark" viewBox="0 0 120 60" aria-hidden>
      <path d="M40 30 Q40 20 52 20 L70 20 Q78 20 78 30 Q78 40 70 40 L52 40 Q40 40 40 30 Z M78 30 L112 30 M108 24 L112 36 M20 14 L100 14 M60 14 L60 20" />
    </svg>
  );
}
