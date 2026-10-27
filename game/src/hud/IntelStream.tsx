import { useMemo } from 'react';
import { game, useGame } from '../sim/store';
import { streamView } from '../sim/stream';
import { zulu } from '../sim/gameTime';

const STATE = { new: 'NEW', seen: 'OPEN', resolved: 'DONE' } as const;

// The intel stream (ILI-1186, ILI-1194, ILI-1197): this mission's intel, newest first, down
// the left. Each kind reads differently; routine items sit quiet. Events run inline: open one
// to work it beside its square on the map (strike, listen, search), and what it produces
// lands here as the next item. A line that names a square selects it on the map.
export function IntelStream() {
  const stream = useGame((s) => s.stream);
  const messages = useGame((s) => s.comms.messages);
  const events = useGame((s) => s.events);
  const open = useGame((s) => s.openEvent);
  const items = useMemo(() => streamView(game.get()), [stream, messages, events]);

  return (
    <section className="panel stream" data-testid="intel-stream" aria-label="Intel stream">
      <h2>
        INTEL <span className="count">{items.length}</span>
      </h2>
      <ol className="items" data-testid="intel-items">
        {items.map((i) => (
          <li
            key={i.id}
            data-kind={i.kind}
            data-event={i.event?.kind}
            data-quiet={i.quiet}
            data-open={i.event?.id === open || undefined}
            data-testid={i.kind === 'alert' ? 'banner' : i.event?.status === 'new' ? 'new-event' : undefined}
          >
            <div className="meta">
              <span className="t">{zulu(i.atMs)}</span>
              <span className="src">{i.source}</span>
              {i.square && <span className="sq">{i.square}</span>}
              {i.event && <span className="state">{STATE[i.event.status]}</span>}
            </div>
            {i.event ? (
              <button className="text" onClick={() => game.openEvent(i.event!.id)} disabled={i.event.status === 'resolved'}>
                {i.text}
                {i.event.status !== 'resolved' && <span className="go"> Open ›</span>}
              </button>
            ) : i.square ? (
              <button className="text" onClick={() => game.selectSquare(i.square!)}>
                {i.text}
              </button>
            ) : (
              <p className="text">{i.text}</p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
