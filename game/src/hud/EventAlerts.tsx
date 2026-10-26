import { game, useGame } from '../sim/store';

const LABEL = { contact: 'CONTACT', request: 'REQUEST' } as const;

// Alerts strip at the top of the map: one chip per event the player hasn't opened yet.
export function EventAlerts() {
  const events = useGame((s) => s.events);
  const fresh = events.filter((e) => e.status === 'new');
  if (!fresh.length) return null;
  return (
    <div className="alerts" data-testid="alerts">
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
      {call ? (
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
