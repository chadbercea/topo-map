import { useState } from 'react';
import { game, useGame } from '../sim/store';
import { currentCall, waitingCalls } from '../sim/comms';
import { blocked } from '../sim/responses';
import { callDeadline } from '../sim/progress';
import { clock } from './MissionBar';

// The call card (ILI-1172): decisions only, in their own card at the bottom, apart from the
// team panel. Several waiting calls page as "1 of N". Minimize sends it to a chip on the
// mission bar. There's no Dismiss: ALPHA waits for an answer (only the client's offer runs
// out, and the card shows that clock). A call never covers a mini game; it waits on the bar.
export function CallCard() {
  const s = useGame((x) => x);
  const [focus, setFocus] = useState<string | null>(null);
  const calls = waitingCalls(s.comms);
  const call = calls.find((m) => m.id === focus) ?? currentCall(s.comms);
  if (!call || s.comms.minimized || s.minigame?.status === 'active') return null;
  const at = calls.indexOf(call);
  const page = (d: number) => setFocus(calls[(at + d + calls.length) % calls.length].id);
  const deadline = callDeadline(s, call);

  return (
    <section className="panel comms" data-testid="comms" role="log" aria-live="polite">
      <div className="incoming">
        <span className="dot" aria-hidden /> {call.from} · {call.responses || call.holds ? 'NEEDS A DECISION' : 'INCOMING'}
        {deadline !== null && (
          <span className="deadline" data-testid="call-deadline">
            {clock(deadline - s.elapsedMs)}
          </span>
        )}
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
        <button className="min" onClick={() => game.setCommsMinimized(true)} aria-label="Minimize comms">
          –
        </button>
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
    </section>
  );
}
