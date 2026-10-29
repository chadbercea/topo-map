import { useGame } from '../sim/store';
import { DRONE_CALLSIGN, droneArrived, droneGone, FLIGHT_MS, LINGER_MS } from '../sim/drone';
import type { DroneState } from './droneScene'; // a type only: the module itself loads lazily
import { WireAvatar } from './OrionAvatar';

const loadDrone = () => import('./droneScene');
const LEAVE_MS = 400; // the panel's way out, at the end of its linger

// The drone panel (ILI-1252): it pops open when HQ calls REAPER-1 in. The drone, and the time to
// target counting down; then a "Tango down" for each fighter as the drone passes over it on the
// map, "All targets neutralized", and the panel goes.
export function DronePanel() {
  const d = useGame((s) => s.drone);
  const now = useGame((s) => s.elapsedMs);
  if (!d || droneGone(d, now)) return null;
  const arrived = droneArrived(d, now);
  const left = Math.max(0, d.arriveMs - now);
  const down = (d.kills ?? []).filter((k) => k.atMs <= now);
  const done = d.doneMs !== null;
  const leaving = done && now >= d.doneMs! + LINGER_MS - LEAVE_MS;
  const state: DroneState = done ? 'done' : arrived ? 'strike' : 'inbound';
  return (
    <section className="panel drone" data-testid="drone-panel" data-state={state} data-leaving={leaving || undefined} role="status" aria-label="Drone strike">
      <h2>
        <span>{DRONE_CALLSIGN}</span>
        <span className="where">drone strike · {d.square}</span>
      </h2>
      <WireAvatar state={state} fallback={<DroneMark />} load={loadDrone} className="d-model" />
      {!arrived ? (
        <div className="d-clock">
          <small>Time to target</small>
          <b data-testid="drone-eta">0:{String(Math.ceil(left / 1000)).padStart(2, '0')}</b>
          <span className="decay" role="progressbar" aria-label="Time to target" aria-valuenow={Math.round((left / FLIGHT_MS) * 100)}>
            <span style={{ width: `${(left / FLIGHT_MS) * 100}%` }} />
          </span>
        </div>
      ) : (
        <ol className="d-log" data-testid="drone-log">
          {down.map((k) => (
            <li key={`${k.contactId}-${k.unit}`}>Tango down</li>
          ))}
          {done && <li className="d-all">{d.kills!.length ? 'All targets neutralized' : 'No targets in the square'}</li>}
        </ol>
      )}
    </section>
  );
}

// REAPER-1 in outline, top down: shown until the Three.js drone loads, or without WebGL.
function DroneMark() {
  return (
    <svg className="d-mark" viewBox="0 0 120 60" aria-hidden>
      <path d="M60 8 L60 50 M8 26 L112 26 L112 30 L8 30 Z M44 50 L76 50 M60 8 Q56 12 56 18 L64 18 Q64 12 60 8" />
    </svg>
  );
}
