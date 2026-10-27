import { game, useGame } from '../sim/store';
import { liveAlerts } from '../sim/comms';
import { TargetMenu } from './TargetMenu';

const LABEL = { contact: 'CONTACT', request: 'REQUEST', site: 'KILL SITE', signal: 'SIGNAL' } as const;

// Alerts strip at the top of the map: a short banner for news the map doesn't show (ILI-1171),
// then one chip per event the player hasn't opened yet.
export function EventAlerts() {
  const events = useGame((s) => s.events);
  const comms = useGame((s) => s.comms);
  const now = useGame((s) => s.elapsedMs);
  const fresh = events.filter((e) => e.status === 'new');
  const banners = liveAlerts(comms, now);
  if (!fresh.length && !banners.length) return null;
  return (
    <div className="alerts" data-testid="alerts">
      {banners.map((m) => (
        <div key={m.id} className="panel banner" role="status" data-testid="banner">
          <b>{m.from}</b> {m.text}
        </div>
      ))}
      {fresh.map((e) => (
        <button key={e.id} className="panel alert" data-kind={e.kind} onClick={() => game.openEvent(e.id)}>
          <b>{LABEL[e.kind]}</b> {e.square} · {e.title}
        </button>
      ))}
    </div>
  );
}

// The card for an opened event. Decision points and mini games plug in here later.
export function EventCard() {
  const id = useGame((s) => s.openEvent);
  const events = useGame((s) => s.events);
  const e = events.find((x) => x.id === id);
  const call = useGame((s) => s.comms.messages.find((m) => m.eventId === id));
  if (!e) return null;
  return (
    <section className="panel event-card" data-kind={e.kind} data-testid="event-card" role="dialog" aria-label={e.title}>
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
