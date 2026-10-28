import { useEffect, useRef } from 'react';
import { useGame } from '../sim/store';
import { currentCall, kindOf, sending } from '../sim/comms';
import { Replies } from './AskWindow';
import { gameClock } from '../sim/gameTime';

export const RELAY = 'RELAY-7'; // the comms satellite HQ talks to the team through

// COMMS SAT (ILI-1199): RELAY-7 and the link through it to ALPHA, under the intel stream. A
// log of every text and call both ways, HQ's answers included. When ALPHA needs something its
// flag goes up on the map (AskWindow), and the replies wait here too, under the thread
// (ILI-1207): the comms panel is where HQ answers comms. They wait out a mini game, as the flag does.
// An answer takes a moment to reach the team (ILI-1209): it shows as sending until ALPHA reads it back.
export function CommsPanel() {
  const callsign = useGame((s) => s.team.callsign);
  const comms = useGame((s) => s.comms);
  const messages = comms.messages;
  const call = useGame((s) => (s.minigame?.status === 'active' ? undefined : currentCall(s.comms)));
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
        {thread.map((m) => {
          const out = sending(comms, m.id); // HQ's answer on its way up the link (ILI-1209)
          const label = (id: string | null | undefined) => (id ? m.responses?.find((r) => r.id === id)?.label : 'Copy');
          const waiting = kindOf(m) === 'call' && m.status === 'new' && !out;
          return (
            <li key={m.id} className={m.from === callsign ? 'in' : 'out'} data-waiting={waiting}>
              <span className="t">{gameClock(m.atMs, Math.floor)}</span> <b>{m.from}</b> {m.text}
              {m.answer && <span className="answer"> HQ › {label(m.answer)}</span>}
              {out && (
                <span className="answer sending" data-testid="sending">
                  {' '}
                  HQ › {label(out.responseId)} · sending
                </span>
              )}
              {waiting && <span className="awaiting"> · waiting on HQ</span>}
            </li>
          );
        })}
      </ol>
      {call && <Replies call={call} testId="satcom-responses" />}
    </section>
  );
}
