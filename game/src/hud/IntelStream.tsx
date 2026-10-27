import { useMemo } from 'react';
import { game, useGame } from '../sim/store';
import { streamView } from '../sim/stream';
import { zulu } from '../sim/gameTime';

// The intel stream (ILI-1186, MVP in ILI-1194): this mission's intel, newest first, down the
// left. A line that names a square in ALPHA's AO selects it on the map.
export function IntelStream() {
  const stream = useGame((s) => s.stream);
  const messages = useGame((s) => s.comms.messages);
  const events = useGame((s) => s.events);
  const items = useMemo(() => streamView(game.get()), [stream, messages, events]);

  return (
    <section className="panel stream" data-testid="intel-stream" aria-label="Intel stream">
      <h2>
        INTEL <span className="count">{items.length}</span>
      </h2>
      <ol className="items" data-testid="intel-items">
        {items.map((i) => (
          <li key={i.id}>
            <div className="meta">
              <span className="t">{zulu(i.atMs)}</span>
              <span className="src">{i.source}</span>
            </div>
            {i.square ? (
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
