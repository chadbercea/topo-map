import { useEffect, useRef, useState } from 'react';
import { game, useGame } from '../sim/store';
import { kindOf, sending, type Message } from '../sim/comms';
import { classify } from '../sim/stream';
import { gameClock } from '../sim/gameTime';
import { bus, EV, getAskHidden } from '../game/events';
import { FeedIcon, type Tier } from './feedIcons';

export const RELAY = 'RELAY-7'; // the comms satellite HQ talks to the team through

// Whether ALPHA's waiting ask is out of sight on the map (under the square card, or waiting
// out a mini game): TEAM's call box answers for it then (ILI-1255).
export function useAskHidden() {
  const [hidden, setHidden] = useState(getAskHidden);
  useEffect(() => {
    setHidden(getAskHidden());
    bus.on(EV.askHidden, setHidden);
    return () => void bus.off(EV.askHidden, setHidden);
  }, []);
  return hidden;
}

// COMMS (ILI-1199, ILI-1225, ILI-1255): HQ's one feed, through RELAY-7, and only a list of
// what's happening. ALPHA's texts and calls, HQ's answers, and HQ's report lines: ORION-3,
// SIGINT, the strike assets, HQ's news, and what the analysts had before the mission. Routine
// lines sit quiet; a line that names a square selects it on the map. Nothing to press here:
// ALPHA's call is answered at its flag on the map, or from the call box on TEAM (CallBox). An
// answer takes a moment to reach the team (ILI-1209): it shows as sending until ALPHA reads it back.
export function CommsPanel() {
  const callsign = useGame((s) => s.team.callsign);
  const comms = useGame((s) => s.comms);
  const notes = useGame((s) => s.stream.items);
  const messages = comms.messages;
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
      <ol className="thread" ref={log} role="log" aria-live="polite" data-testid="comms-feed">
        {feed.map((f) => {
          if ('note' in f) {
            const n = f.note;
            const tier: Tier = n.source === 'SIGINT' ? 'sigint' : n.source === 'HUMINT' ? 'humint' : 'intel';
            return (
              <li key={n.id} className="report" data-kind="note" data-tier={tier} data-quiet>
                <span className="t">PRE</span>
                <FeedIcon tier={tier} />
                <span className="body">
                  <b>{n.source}</b> {n.text}
                </span>
              </li>
            );
          }
          const m = f.msg;
          const team = m.from === callsign;
          const out = sending(comms, m.id); // HQ's answer on its way up the link (ILI-1209)
          const label = (id: string | null | undefined) => (id ? m.responses?.find((r) => r.id === id)?.label : 'Copy');
          const waiting = kindOf(m) === 'call' && m.status === 'new' && !out;
          const report = team || kindOf(m) === 'call' ? null : classify(m);
          const tier = tierOf(m, team, report);
          const text =
            m.square && report ? (
              <button className="text" onClick={() => game.selectSquare(m.square!)}>
                {m.text}
              </button>
            ) : (
              m.text
            );
          return (
            <li
              key={m.id}
              className={team ? 'in' : report ? 'report' : 'out'}
              data-kind={report?.kind}
              data-tier={tier}
              data-quiet={report?.quiet || undefined}
              data-waiting={waiting}
              data-testid={report?.kind === 'alert' ? 'banner' : undefined}
            >
              <span className="t">{gameClock(m.atMs, Math.floor)}</span>
              <FeedIcon tier={tier} />
              <span className="body">
                <b>{m.from}</b> {text}
                {m.answer && <span className="answer"> HQ › {label(m.answer)}</span>}
                {out && (
                  <span className="answer sending" data-testid="sending">
                    {' '}
                    HQ › {label(out.responseId)} · sending
                  </span>
                )}
                {waiting && <span className="awaiting"> · waiting on HQ</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// A line's tier (ILI-1258), in rising order of how much it asks of HQ: chatter (the team's
// routine traffic: grey, no icon); the reports, each with its icon and colour (ORION-3,
// SIGINT, the analysts' and HQ's intel, the strike assets); communications (ALPHA's calls and
// the other callsigns HQ talks to: the flag's orange); and alerts (red, the whole line).
function tierOf(m: Message, team: boolean, report: ReturnType<typeof classify> | null): Tier {
  if (team) return kindOf(m) === 'call' ? 'comms' : 'chatter';
  if (!report) return 'comms';
  switch (report.kind) {
    case 'alert':
      return 'alert';
    case 'imagery':
      return 'sat';
    case 'sigint':
      return 'sigint';
    case 'strike':
      return 'strike';
    default:
      return m.from === 'HQ' ? 'intel' : 'comms';
  }
}
