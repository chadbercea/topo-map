import { useEffect, useRef, useState } from 'react';
import { game, useGame } from '../sim/store';
import { currentCall, kindOf, waitingCalls } from '../sim/comms';
import { blocked } from '../sim/responses';
import { gameClock } from '../sim/gameTime';

export const RELAY = 'RELAY-7'; // the comms satellite HQ talks to the team through

// Satcom (ILI-1186), bottom right beside the team panel: RELAY-7, the comms satellite, and
// the link through it to the team (ILI-1195). Only the team's short texts and calls live
// here, any call waiting on HQ pinned under them with its answers; imagery is ORION-3's (ILI-1172: several page as "1 of N"; ALPHA waits as long as it takes; a
// call never interrupts a mini game).
export function CommsPanel() {
  const s = useGame((x) => x);
  const [focus, setFocus] = useState<string | null>(null);
  const log = useRef<HTMLOListElement>(null);
  // Calls still waiting show pinned below with their answers, not in the thread.
  const thread = s.comms.messages.filter((m) => (m.from === s.team.callsign || kindOf(m) === 'call') && !(kindOf(m) === 'call' && m.status === 'new'));
  const calls = waitingCalls(s.comms);
  const call = calls.find((m) => m.id === focus) ?? currentCall(s.comms);
  const at = call ? calls.indexOf(call) : -1;
  const page = (d: number) => setFocus(calls[(at + d + calls.length) % calls.length].id);
  const playing = s.minigame?.status === 'active';

  // Keep the newest text in view.
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length]);

  return (
    <section className="panel satcom" data-testid="satcom" aria-label="Satcom">
      <h2>
        <span>COMMS SAT</span>
        <span className="status" data-testid="relay-status">
          {RELAY} ↔ {s.team.callsign} · link good
        </span>
      </h2>
      <ol className="thread" ref={log} role="log" aria-live="polite">
        {thread.map((m) => (
          <li key={m.id} className={m.from === s.team.callsign ? 'in' : 'out'}>
            <span className="t">{gameClock(m.atMs, Math.floor)}</span> <b>{m.from}</b> {m.text}
            {m.answer && <span className="answer"> → {m.responses?.find((r) => r.id === m.answer)?.label}</span>}
          </li>
        ))}
      </ol>

      {call && playing && <p className="waiting">{call.from} is waiting on you. Finish the job on the map first.</p>}
      {call && !playing && (
        <div className="call comms" data-testid="comms">
          <div className="incoming">
            <span className="dot" aria-hidden /> {call.from} · NEEDS A DECISION
            {calls.length > 1 && (
              <span className="pager">
                <button onClick={() => page(-1)} aria-label="Previous call">
                  ◂
                </button>
                {at + 1} of {calls.length}
                <button onClick={() => page(1)} aria-label="Next call" data-testid="more-calls">
                  ▸
                </button>
              </span>
            )}
          </div>
          <p className="text" data-testid="comms-text">
            {call.text}
          </p>
          <div className="actions" data-testid="responses">
            {call.responses ? (
              call.responses.map((r, i) => {
                const why = blocked(s, r);
                return (
                  <button key={r.id} className={i === 0 && !why ? 'primary' : undefined} disabled={!!why} onClick={() => game.respond(call.id, r.id)}>
                    {r.label}
                    {why && <small> · {why}</small>}
                  </button>
                );
              })
            ) : (
              <button className="primary" onClick={() => game.confirmCall(call.id)}>
                {call.holds ? 'Copy, proceed' : 'Copy'}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
