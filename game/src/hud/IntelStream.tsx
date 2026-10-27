import { useMemo } from 'react';
import { game, useGame } from '../sim/store';
import { streamView } from '../sim/stream';
import { zulu } from '../sim/gameTime';

// The intel stream (ILI-1186): the whole theater's feed, always running, down the left.
// Filter it by code name, source or grid. A code name chip filters to that code name; a
// line that names a square in ALPHA's AO selects it on the map.
export function IntelStream() {
  const stream = useGame((s) => s.stream);
  const link = useGame((s) => s.link);
  const messages = useGame((s) => s.comms.messages);
  const events = useGame((s) => s.events);
  const callsign = useGame((s) => s.team.callsign);
  const items = useMemo(() => streamView(game.get()), [stream, link, messages, events, callsign]);
  const linked = link.state === 'linked';

  return (
    <section className="panel stream" data-testid="intel-stream" aria-label="Intel stream">
      <h2>
        INTEL STREAM <span className="count">{items.length}</span>
      </h2>
      <div className="filter">
        <input
          type="search"
          value={stream.filter}
          onChange={(e) => game.setFilter(e.target.value)}
          placeholder="Filter: code name, source, grid"
          aria-label="Filter intel"
          data-testid="intel-filter"
          spellCheck={false}
        />
        {stream.filter && (
          <button onClick={() => game.setFilter('')} aria-label="Clear filter">
            ✕
          </button>
        )}
      </div>
      {linked && stream.filter.trim().toUpperCase() === link.codename && <p className="scope">Showing {link.codename} only: ALPHA’s war.</p>}
      <ol className="items" data-testid="intel-items">
        {items.map((i) => (
          <li key={i.id} data-tags={i.tags.join(',')}>
            <div className="meta">
              <span className="t">{zulu(i.atMs)}</span>
              <span className="src">{i.source}</span>
              {i.tags.map((t) => (
                <button key={t} className="tag" onClick={() => game.setFilter(t)} data-testid="intel-tag">
                  {t}
                </button>
              ))}
            </div>
            {i.square && linked ? (
              <button className="text" onClick={() => game.selectSquare(i.square!)}>
                {i.text}
              </button>
            ) : (
              <p className="text">{i.text}</p>
            )}
          </li>
        ))}
        {!items.length && <li className="empty">Nothing matches “{stream.filter}”.</li>}
      </ol>
    </section>
  );
}
