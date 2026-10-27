import { useEffect, useMemo, useState } from 'react';
import { game, useGame } from '../sim/store';
import { streamView } from '../sim/stream';
import { zulu } from '../sim/gameTime';
import { currentCall } from '../sim/comms';
import { bus, EV, getAskHidden } from '../game/events';

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

const STATE = { new: 'NEW', seen: 'OPEN', resolved: 'DONE' } as const;

// The intel stream (ILI-1186, ILI-1194, ILI-1197): this mission's intel, newest first, down
// the left. Each kind reads differently; routine items sit quiet. Events run inline: open one
// to work it beside its square on the map (strike, listen, search), and what it produces
// lands here as the next item. A line that names a square selects it on the map. When
// ALPHA's ask can't be seen on the map, it's raised in orange at the top (ILI-1203).
export function IntelStream() {
  const stream = useGame((s) => s.stream);
  const messages = useGame((s) => s.comms.messages);
  const events = useGame((s) => s.events);
  const open = useGame((s) => s.openEvent);
  const items = useMemo(() => streamView(game.get()), [stream, messages, events]);
  const hidden = useAskHidden();
  const playing = useGame((s) => s.minigame?.status === 'active');
  const call = useGame((s) => currentCall(s.comms));

  return (
    <section className="panel stream" data-testid="intel-stream" aria-label="Intel stream">
      <h2>
        INTEL <span className="count">{items.length}</span>
      </h2>
      <ol className="items" data-testid="intel-items">
        {hidden && call && (
          // ALPHA's flag is out of sight: raise the ask here, where it can't be missed.
          <li className="incoming-alert" data-testid="incoming-alert" role="alert">
            <span className="who">INCOMING · {call.from}</span>
            <p>{call.text}</p>
            {playing ? (
              <small>Answer when the strike is done.</small>
            ) : (
              <button onClick={() => bus.emit(EV.openAsk)} data-testid="answer-alpha">
                Answer ›
              </button>
            )}
          </li>
        )}
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
