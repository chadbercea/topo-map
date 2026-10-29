import { useEffect, useRef, useState } from 'react';
import { game, useGame } from '../sim/store';
import { currentCall, kindOf, sending } from '../sim/comms';
import { classify } from '../sim/stream';
import { Replies } from './AskWindow';
import { gameClock } from '../sim/gameTime';
import { bus, EV, getAskHidden } from '../game/events';
import { CommsStrip } from './CommsStrip';

export const RELAY = 'RELAY-7'; // the comms satellite HQ talks to the team through

// Whether ALPHA's waiting ask is out of sight on the map (under the square card, or waiting
// out a mini game).
export function useAskHidden() {
  const [hidden, setHidden] = useState(getAskHidden);
  useEffect(() => {
    setHidden(getAskHidden());
    bus.on(EV.askHidden, setHidden);
    return () => void bus.off(EV.askHidden, setHidden);
  }, []);
  return hidden;
}

// COMMS (ILI-1199, ILI-1225): HQ's one feed, through RELAY-7. ALPHA's texts and calls, HQ's
// answers, and since the intel stream went (ILI-1225) HQ's report lines too: ORION-3, SIGINT,
// the strike assets, HQ's news, and what the analysts had before the mission. Routine lines
// sit quiet; a line that names a square selects it on the map. The tasks themselves (contacts,
// signals, kill sites) live on the map. When ALPHA needs something its flag goes up on the map
// (AskWindow), and the replies wait here too, under the thread (ILI-1207); when the flag is
// out of sight the ask is raised at the top. They wait out a mini game, as the flag does. An
// answer takes a moment to reach the team (ILI-1209): it shows as sending until ALPHA reads it back.
export function CommsPanel() {
  const callsign = useGame((s) => s.team.callsign);
  const comms = useGame((s) => s.comms);
  const notes = useGame((s) => s.stream.items);
  const messages = comms.messages;
  const call = useGame((s) => (s.minigame?.status === 'active' ? undefined : currentCall(s.comms)));
  const hidden = useAskHidden();
  const log = useRef<HTMLOListElement>(null);
  const feed = [...notes.map((n) => ({ note: n, at: n.atMs })), ...messages.map((m) => ({ msg: m, at: m.atMs }))].sort((a, b) => a.at - b.at);

  // Keep the newest line in view.
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed.length]);

  return (
    <section className="panel satcom" data-testid="satcom" aria-label="Comms">
      <h2>
        <span>COMMS</span>
        <span className="status" data-testid="relay-status">
          {RELAY} ↔ {callsign} · link good
        </span>
      </h2>
      {/* The link itself, always on screen (ILI-1236): ALPHA's SATCOM backpack and RELAY-7's signal. */}
      <CommsStrip />
      {hidden && <IncomingAlert as="div" testId="answer-alpha" />}
      <ol className="thread" ref={log} role="log" aria-live="polite" data-testid="comms-feed">
        {feed.map((f) => {
          if ('note' in f) {
            const n = f.note;
            return (
              <li key={n.id} className="report" data-kind="note" data-quiet>
                <span className="t">PRE</span> <b>{n.source}</b> {n.text}
              </li>
            );
          }
          const m = f.msg;
          const team = m.from === callsign;
          const out = sending(comms, m.id); // HQ's answer on its way up the link (ILI-1209)
          const label = (id: string | null | undefined) => (id ? m.responses?.find((r) => r.id === id)?.label : 'Copy');
          const waiting = kindOf(m) === 'call' && m.status === 'new' && !out;
          const report = team || kindOf(m) === 'call' ? null : classify(m);
          const text = m.square && report ? (
            <button className="text" onClick={() => game.selectSquare(m.square!)}>
              {m.text}
            </button>
          ) : (
            m.text
          );
          return (
            <li key={m.id} className={team ? 'in' : report ? 'report' : 'out'} data-kind={report?.kind} data-quiet={report?.quiet || undefined} data-waiting={waiting} data-testid={report?.kind === 'alert' ? 'banner' : undefined}>
              <span className="t">{gameClock(m.atMs, Math.floor)}</span> <b>{m.from}</b> {text}
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

// ALPHA's ask, raised where it can't be missed when its flag is out of sight: at the top of
// COMMS, and on a phone at the top of the action panel that covers the dock (brief: one line,
// so the strikes under it stay in view).
export function IncomingAlert({ as: Tag, testId, brief = false }: { as: 'li' | 'div'; testId: string; brief?: boolean }) {
  const playing = useGame((s) => s.minigame?.status === 'active');
  const call = useGame((s) => currentCall(s.comms));
  if (!call) return null;
  return (
    <Tag className="incoming-alert" data-testid="incoming-alert" data-brief={brief} role="alert">
      <span className="who">INCOMING · {call.from}</span>
      {!brief && <p>{call.text}</p>}
      {playing ? (
        <small>Answer when the strike is done.</small>
      ) : (
        <button onClick={() => bus.emit(EV.openAsk)} data-testid={testId}>
          Answer ›
        </button>
      )}
    </Tag>
  );
}
