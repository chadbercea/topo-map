import { useEffect, useState } from 'react';
import { game, useGame } from '../sim/store';
import { bus, EV, getMapRect, toScreen } from '../game/events';
import { CELL, parseSquare } from '../map/grid';
import { TargetMenu } from './TargetMenu';

export const LABEL = { contact: 'CONTACT', request: 'REQUEST', site: 'KILL SITE', signal: 'SIGNAL' } as const;
const CARD_W = 320;

// Where the card goes on a wide screen (ILI-1189): beside its square on the map, on whichever
// side has room, kept inside the open map. On a phone it docks at the bottom instead, and the
// map outlines its square.
function useBeside(square: string | null) {
  const [, redraw] = useState(0);
  useEffect(() => {
    const again = () => redraw((n) => n + 1);
    bus.on(EV.camera, again);
    bus.on(EV.mapRect, again);
    return () => {
      bus.off(EV.camera, again);
      bus.off(EV.mapRect, again);
    };
  }, []);
  const sq = square && parseSquare(square);
  const area = getMapRect();
  if (!sq || !area || matchMedia('(max-aspect-ratio: 1/1)').matches) return null;
  const tl = toScreen(sq.col * CELL, sq.row * CELL);
  const br = toScreen((sq.col + 1) * CELL, (sq.row + 1) * CELL);
  if (!tl || !br) return null;
  const right = br.x + 12 + CARD_W <= area.x + area.width;
  const left = right ? br.x + 12 : Math.max(area.x, tl.x - 12 - CARD_W);
  const top = Math.min(Math.max(area.y, tl.y), area.y + area.height - 160);
  return { left, top, side: right ? 'right' : 'left' };
}

// The card for an opened event: what it is and what HQ can do about it, next to where it is.
export function EventCard() {
  const id = useGame((s) => s.openEvent);
  const events = useGame((s) => s.events);
  const e = events.find((x) => x.id === id);
  const call = useGame((s) => s.comms.messages.find((m) => m.eventId === id));
  const at = useBeside(e?.square ?? null);
  if (!e) return null;
  return (
    <section
      className="panel event-card"
      data-kind={e.kind}
      data-testid="event-card"
      data-anchored={!!at}
      data-side={at?.side}
      role="dialog"
      aria-label={e.title}
      style={at ? { position: 'fixed', left: at.left, top: at.top, width: CARD_W } : undefined}
    >
      <h2>
        {LABEL[e.kind]} · {e.square}
      </h2>
      <p className="title">{e.title}</p>
      {e.kind === 'contact' && e.id.startsWith('contact-') ? (
        <TargetMenu contactId={e.id.slice('contact-'.length)} />
      ) : e.kind === 'signal' ? (
        e.status === 'resolved' ? (
          <p>Gone quiet.</p>
        ) : (
          <div className="signal-options">
            <button className="intercept" onClick={() => game.intercept(e.id)}>
              Listen
            </button>
            <button className="jam" onClick={() => game.jam(e.id)} title="Slows the enemy, but you won't learn what they're planning">
              Jam
            </button>
          </div>
        )
      ) : e.kind === 'site' ? (
        <p>{e.status === 'resolved' ? 'Searched or passed.' : 'ALPHA can search it for documents when it gets there.'}</p>
      ) : call ? (
        <p>
          {call.from}: “{call.text}” {call.status === 'new' && call.holds ? 'Answer in comms.' : ''}
        </p>
      ) : (
        <p>Decision point. Responses arrive with comms and mini games.</p>
      )}
      <button onClick={game.closeEvent}>Close</button>
    </section>
  );
}
