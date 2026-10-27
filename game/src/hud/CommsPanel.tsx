import { useEffect, useRef, useState } from 'react';
import { game, useGame } from '../sim/store';
import { currentCall, kindOf, waitingCalls } from '../sim/comms';
import { blocked } from '../sim/responses';
import { replyText, sitrepText } from '../sim/link';
import { gameClock } from '../sim/gameTime';

// Satcom with the team (ILI-1186), bottom right beside the team panel: short texts, both
// ways. Before the link there's one thing to do, send a SITREP; the team answers with its
// code name. Once linked it's the team's texts, and any call waiting on HQ pins under them
// with its answers (ILI-1172: several page as "1 of N"; ALPHA waits as long as it takes; a
// call never interrupts a mini game).
export function CommsPanel() {
  const s = useGame((x) => x);
  const [focus, setFocus] = useState<string | null>(null);
  const log = useRef<HTMLOListElement>(null);
  const { link } = s;
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
  }, [thread.length, link.state]);

  return (
    <section className="panel satcom" data-testid="satcom" data-link={link.state} aria-label="Satcom">
      <h2>
        SATCOM · {link.state === 'linked' ? `${s.team.callsign} · ${link.codename}` : 'NO LINK'}
      </h2>
      <ol className="thread" ref={log} role="log" aria-live="polite">
        {link.state !== 'none' && (
          <li className="out">
            <b>HQ</b> {sitrepText(s)}
          </li>
        )}
        {link.state === 'pinging' && <li className="typing">{s.team.callsign} is typing…</li>}
        {(link.state === 'replied' || link.state === 'linked') && (
          <li className="in" data-testid="sitrep-reply">
            <b>{s.team.callsign}</b> {replyText(s)}
          </li>
        )}
        {thread.map((m) => (
          <li key={m.id} className={m.from === s.team.callsign ? 'in' : 'out'}>
            <span className="t">{gameClock(m.atMs, Math.floor)}</span> <b>{m.from}</b> {m.text}
            {m.answer && <span className="answer"> → {m.responses?.find((r) => r.id === m.answer)?.label}</span>}
          </li>
        ))}
      </ol>

      {link.state === 'none' && (
        <div className="actions">
          <button className="primary" onClick={game.sitrep} data-testid="sitrep">
            Send SITREP
          </button>
          <small>ALPHA is out there. Ask it who it is.</small>
        </div>
      )}
      {link.state === 'replied' && (
        <div className="actions">
          <small>Filter the intel stream for</small>
          <button className="tag" onClick={() => game.setFilter(link.codename)} data-testid="codename">
            {link.codename}
          </button>
        </div>
      )}

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
