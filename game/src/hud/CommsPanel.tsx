import { useEffect, useRef } from 'react';
import { useGame } from '../sim/store';
import { kindOf } from '../sim/comms';
import { gameClock } from '../sim/gameTime';

export const RELAY = 'RELAY-7'; // the comms satellite HQ talks to the team through

// COMMS SAT (ILI-1199): RELAY-7 and the link through it to ALPHA, under the intel stream. A
// log of every text and call both ways, HQ's answers included. Nothing to press here: when
// ALPHA needs something, its ask pops up beside its marker on the map (AskWindow).
export function CommsPanel() {
  const callsign = useGame((s) => s.team.callsign);
  const messages = useGame((s) => s.comms.messages);
  const log = useRef<HTMLOListElement>(null);
  const thread = messages.filter((m) => m.from === callsign || kindOf(m) === 'call');

  // Keep the newest text in view.
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length]);

  return (
    <section className="panel satcom" data-testid="satcom" aria-label="Comms satellite">
      <h2>
        <span>COMMS SAT</span>
        <span className="status" data-testid="relay-status">
          {RELAY} ↔ {callsign} · link good
        </span>
      </h2>
      <ol className="thread" ref={log} role="log" aria-live="polite">
        {thread.map((m) => (
          <li key={m.id} className={m.from === callsign ? 'in' : 'out'} data-waiting={kindOf(m) === 'call' && m.status === 'new'}>
            <span className="t">{gameClock(m.atMs, Math.floor)}</span> <b>{m.from}</b> {m.text}
            {m.answer && <span className="answer"> HQ › {m.responses?.find((r) => r.id === m.answer)?.label}</span>}
            {kindOf(m) === 'call' && m.status === 'new' && <span className="awaiting"> · waiting on HQ</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
