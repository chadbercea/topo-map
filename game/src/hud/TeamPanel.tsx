import { game, useGame } from '../sim/store';
import { teamFatigue } from '../sim/movement';
import { currentCall } from '../sim/comms';
import { blocked } from '../sim/responses';

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// Team panel. Mode A (GDD): callsign, activity, general status. Mode C: the radio comms
// window slides open under it when a call comes in. The full readout (Mode B) is ILI-1123.
export function TeamPanel() {
  const callsign = useGame((s) => s.team.callsign);
  const activity = useGame((s) => s.team.activity);
  const fit = useGame((s) => s.team.operators.filter((o) => o.health > 0).length);
  const size = useGame((s) => s.team.operators.length);
  const fatigue = useGame((s) => Math.round(teamFatigue(s.team.operators)));
  const comms = useGame((s) => s.comms);
  const state = useGame((s) => s);
  const call = currentCall(comms);
  const waiting = comms.messages.filter((m) => m.status === 'new').length;
  const mode = call && !comms.minimized ? 'C' : 'A';

  return (
    <section className="panel team" data-testid="team-panel" data-mode={mode}>
      <h2>{callsign}</h2>
      <p className="activity">{activity}</p>
      <p>
        {fit}/{size} fit · fatigue {fatigue}%
      </p>
      {call && comms.minimized && (
        <button className="comms-badge" onClick={() => game.setCommsMinimized(false)} data-testid="comms-badge">
          ◂ {waiting} incoming
        </button>
      )}
      {mode === 'C' && call && (
        <div className="comms" data-testid="comms" role="log" aria-live="polite">
          <div className="incoming">
            <span className="dot" aria-hidden /> INCOMING · {call.from} · {clock(call.atMs)}
            <button className="min" onClick={() => game.setCommsMinimized(true)} aria-label="Minimize comms">
              –
            </button>
          </div>
          <p className="text" data-testid="comms-text">
            {call.text}
          </p>
          <div className="actions" data-testid="responses">
            {call.responses ? (
              call.responses.map((r, i) => {
                const why = blocked(state, r);
                return (
                  <button
                    key={r.id}
                    className={i === 0 && !why ? 'primary' : undefined}
                    disabled={!!why}
                    onClick={() => game.respond(call.id, r.id)}
                  >
                    {r.label}
                    {why && <small> · {why}</small>}
                  </button>
                );
              })
            ) : (
              <button className="primary" onClick={() => game.confirmCall(call.id)}>
                {call.holds ? 'Copy, proceed' : 'Copy'}
              </button>
            )}
            <button className="quiet" onClick={() => game.dismissCall(call.id)}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
