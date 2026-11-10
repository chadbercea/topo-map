import { useLayoutEffect, useRef } from 'react';
import { useGame } from '../sim/store';
import { aboard, EXFIL_FLIGHT_MS, exfilStage, TRANSPORT } from '../sim/exfil';
import type { TransportState } from './transportScene'; // a type only: the scene loads lazily
import { WireAvatar } from './OrionAvatar';

const LOAD = () => import('./transportScene');

// The exfil's panel (ILI-1264), built like an air strike's but orange: an exfil, not a strike.
// RAVEN-6 and its time out counting down; on the ground, each operator as they board; then the
// extraction called good, until the After Action Report takes over.
// Where the panel last sat on screen (ILI-1426): the After Action Report grows it from there.
export let exfilRect: DOMRect | null = null;

// header: the After Action Report's own copy, at its top (ILI-1426). The band's copy steps aside
// once the mission's over, so there's one RAVEN-6 on screen.
export function ExfilPanel({ header = false }: { header?: boolean }) {
  const r = useGame((s) => s.exfil);
  const now = useGame((s) => s.elapsedMs);
  const operators = useGame((s) => s.team.operators);
  const ended = useGame((s) => s.phase === 'ended');
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!header && ref.current) exfilRect = ref.current.getBoundingClientRect();
  });
  if (!r || (ended && !header)) return null;
  const stage = exfilStage(r, now);
  const left = Math.max(0, r.arriveMs - now);
  const ids = aboard(
    r,
    operators.map((o) => o.id),
    now,
  );
  const state: TransportState = stage === 'enroute' ? 'enroute' : stage === 'done' ? 'done' : 'down';
  const where = stage === 'enroute' ? 'en route' : stage === 'landing' ? 'inbound' : stage === 'waiting' || stage === 'boarding' ? 'on the ground' : 'lifting';
  return (
    <section ref={ref} className="panel air exfil" data-testid={header ? 'aar-exfil' : 'exfil-panel'} data-stage={stage} data-header={header || undefined} role="status" aria-label="Exfil">
      <h2>
        <span>{TRANSPORT.callsign}</span>
        <span className="where">
          exfil · {r.square} · {where}
        </span>
      </h2>
      <WireAvatar state={state} fallback={<TransportMark />} load={LOAD} className="d-model" />
      {stage === 'enroute' ? (
        <div className="d-clock">
          <small>Exfil helo en route</small>
          <b data-testid="exfil-eta">0:{String(Math.ceil(left / 1000)).padStart(2, '0')}</b>
          <span className="decay" role="progressbar" aria-label="Time to exfil" aria-valuenow={Math.round((left / EXFIL_FLIGHT_MS) * 100)}>
            <span style={{ width: `${(left / EXFIL_FLIGHT_MS) * 100}%` }} />
          </span>
        </div>
      ) : (
        <ol className="d-log" data-testid="exfil-log">
          {stage === 'landing' && <li>Coming in</li>}
          {stage === 'waiting' && <li>Waiting on {r.square}</li>}
          {ids.map((id) => (
            <li key={id}>{operators.find((o) => o.id === id)?.name} aboard</li>
          ))}
          {stage === 'done' && <li className="d-all">Successful extraction</li>}
        </ol>
      )}
    </section>
  );
}

// The transport in outline, side on: shown until the Three.js model loads, or without WebGL.
function TransportMark() {
  return (
    <svg className="d-mark" viewBox="0 0 120 60" aria-hidden>
      <path d="M30 24 L74 24 L84 32 L84 40 L30 40 Z M30 30 L8 28 L4 16 M44 26 L44 38 L58 38 L58 26 M14 18 L106 18 M56 18 L56 24 M40 40 L40 46 M74 40 L74 46" />
    </svg>
  );
}
