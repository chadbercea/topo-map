import { useEffect, useMemo, useRef, useState } from 'react';
import { game, useGame } from '../sim/store';
import { kindOf, sending, type Comms, type Message } from '../sim/comms';
import { cards, type Card, type EventCardKind } from '../sim/cards';
import type { GameState } from '../sim/state';
import { classify, EVENT_LABEL } from '../sim/stream';
import { blocked } from '../sim/responses';
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

// COMMS (ILI-1199, ILI-1225, ILI-1255): HQ's one feed, through RELAY-7.
// Option D (ILI-1347): it's a stack of cards, in the order things came in, with the radio
// lines between them (sim/cards.ts):
// - intel lands in INTEL under ORION-3 now, not here (IA v2 draft A, ILI-1363);
// - event cards: what wants HQ (a contact, radio traffic, a building, a request, ALPHA asking).
//   They stand out, never expire, and the newest open one pulses; answered, they shrink to a dim
//   line. Tapping one opens its square on the map;
// - lines: ALPHA's and HQ's words, and the other callsigns' reports, as before.
// ALPHA's ask is answered at its flag on the map or from TEAM's call box (CallBox). An answer
// takes a moment to reach the team (ILI-1209): it shows as sending until ALPHA reads it back.

type Item =
  | { at: number; o: number; key: string; note: GameState['stream']['items'][number] }
  | { at: number; o: number; key: string; msg: Message }
  | { at: number; o: number; key: string; card: Card };

export function CommsPanel() {
  const callsign = useGame((s) => s.team.callsign);
  const comms = useGame((s) => s.comms);
  const notes = useGame((s) => s.stream.items);
  const events = useGame((s) => s.events);
  const pushes = useGame((s) => s.intel.pushes);
  const searching = useGame((s) => s.searching);
  const log = useRef<HTMLOListElement>(null);

  const all = useMemo(() => cards({ team: { callsign }, comms, events, intel: { pushes }, searching }), [callsign, comms, events, pushes, searching]);
  const eventIds = new Set(events.map((e) => e.id));
  const newestOpen = all.filter((c) => c.type === 'event' && c.open).at(-1)?.id;

  // Notes and every message that isn't an ask card are lines; asks, events and intel are cards.
  const items: Item[] = [
    ...notes.map((n) => ({ at: n.atMs, o: 0, key: n.id, note: n })),
    ...comms.messages.filter((m) => !(kindOf(m) === 'call' && !(m.eventId && eventIds.has(m.eventId)))).map((m) => ({ at: m.atMs, o: 0, key: m.id, msg: m })),
    ...all.filter((c) => c.type === 'event').map((c) => ({ at: c.atMs, o: c.type === 'event' ? 1 : 2, key: c.id, card: c })),
  ].sort((a, b) => a.at - b.at || a.o - b.o);

  // Keep the newest card in view: as things land, and when the list comes into view (a phone's
  // COMMS tab opening, a hidden list has no height to scroll).
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length]);
  useEffect(() => {
    const el = log.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let was = el.clientHeight;
    const ro = new ResizeObserver(() => {
      if (was === 0 && el.clientHeight > 0) el.scrollTop = el.scrollHeight;
      was = el.clientHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <section className="panel satcom" data-testid="satcom" aria-label="Comms">
      <h2>
        <span>COMMS</span>
        <span className="status" data-testid="relay-status">
          {RELAY} ↔ {callsign} · link good
        </span>
      </h2>
      <ol className="thread" ref={log} role="log" aria-live="polite" data-testid="comms-feed">
        {items.map((it) => {
          if ('note' in it) return <NoteLine key={it.key} n={it.note} />;
          if ('msg' in it) return <MessageLine key={it.key} m={it.msg} callsign={callsign} comms={comms} />;
          const c = it.card;
          if (c.type === 'event') {
            const m = c.messageId ? comms.messages.find((x) => x.id === c.messageId) : undefined;
            return <EventCard key={it.key} c={c} newest={c.id === newestOpen} m={m} comms={comms} />;
          }
          return null;
        })}
      </ol>
    </section>
  );
}

const EVENT_TIER: Record<EventCardKind, Tier> = { contact: 'alert', signal: 'sigint', request: 'intel', building: 'humint', ask: 'comms' };
const EVENT_GO: Record<EventCardKind, string> = { contact: 'Actions', signal: 'Locate', request: 'Scan', building: 'Search', ask: '' };

// What tapping an event card does (ILI-1348): it starts the thing it's about, the mini game we
// already have. Each one opens the event too (marked seen, its square picked), so the map and
// ORION-3 show where it is.
function act(c: Extract<Card, { type: 'event' }>) {
  if (c.eventId) game.openEvent(c.eventId);
  switch (c.kind) {
    case 'signal':
      return; // its square: the prompt there says how to get in range (ILI-1394)
    case 'request':
      return c.square && game.lookAt(c.square); // ORION-3 to the square for the shot
    case 'building':
      return c.square && game.search(c.square); // ALPHA detours to search it
    default:
      return; // a contact: its actions open beside the square
  }
}

// An event card: what wants HQ. Tapping it starts what it's about (act). ALPHA's ask carries its
// words, and HQ answers it right on the card; it shows HQ's answer going up the link, as the
// line did.
function EventCard({ c, newest, m, comms }: { c: Extract<Card, { type: 'event' }>; newest: boolean; m?: Message; comms: Comms }) {
  const tier = EVENT_TIER[c.kind];
  const head = c.kind === 'ask' ? `${m?.from ?? 'ALPHA'} asks` : EVENT_LABEL[c.kind as Exclude<EventCardKind, 'ask'>];
  const out = m ? sending(comms, m.id) : undefined;
  const label = (id: string | null | undefined) => (id ? m?.responses?.find((r) => r.id === id)?.label : 'Copy');
  const answering = c.kind === 'ask' && c.open && !out && m;
  const body = (
    <>
      <FeedIcon tier={tier} />
      <span className="body">
        <b>{head}</b>
        {c.square && <span className="sq"> · {c.square}</span>} <span className="title">{m ? m.text : c.title}</span>
        {m?.answer && <span className="answer"> HQ › {label(m.answer)}</span>}
        {out && (
          <span className="answer sending" data-testid="sending">
            {' '}
            HQ › {label(out.responseId)} · sending
          </span>
        )}
        {answering && <span className="awaiting"> · waiting on HQ</span>}
      </span>
      {c.open && EVENT_GO[c.kind] && (
        <span className="go" aria-hidden>
          {EVENT_GO[c.kind]} ›
        </span>
      )}
    </>
  );
  return (
    <li className="c-card c-event" data-tier={tier} data-kind={c.kind} data-open={c.open} data-newest={newest || undefined} data-waiting={!!answering} data-testid="event-card-stack">
      {c.open && c.kind !== 'ask' ? (
        <button type="button" className="c-open" aria-label={`${head} ${c.square ?? ''}: ${c.title}`} onClick={() => act(c)} data-testid="card-act">
          {body}
        </button>
      ) : (
        <div className="c-open">
          {body}
          {answering && <AskAnswers m={m} />}
        </div>
      )}
    </li>
  );
}

// HQ's answers to ALPHA's ask, on its card: the response tree's options, or a plain Copy.
function AskAnswers({ m }: { m: Message }) {
  const s = useGame((x) => x);
  const options = m.responses ?? [];
  return (
    <span className="c-answers" data-testid="card-responses">
      {options.length ? (
        options.map((r) => {
          const why = blocked(s, r);
          return (
            <button key={r.id} type="button" disabled={!!why} title={why ?? undefined} onClick={() => game.respond(m.id, r.id)}>
              {r.label}
            </button>
          );
        })
      ) : (
        <button type="button" onClick={() => game.confirmCall(m.id)}>
          Copy
        </button>
      )}
    </span>
  );
}

function NoteLine({ n }: { n: GameState['stream']['items'][number] }) {
  const tier: Tier = n.source === 'SIGINT' ? 'sigint' : n.source === 'HUMINT' ? 'humint' : 'intel';
  return (
    <li className="report" data-kind="note" data-tier={tier} data-quiet>
      <span className="t">PRE</span>
      <FeedIcon tier={tier} />
      <span className="body">
        <b>{n.source}</b> {n.text}
      </span>
    </li>
  );
}

function MessageLine({ m, callsign, comms }: { m: Message; callsign: string; comms: Comms }) {
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
