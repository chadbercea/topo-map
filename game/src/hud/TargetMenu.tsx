import { WEAPON, WEAPONS, weaponBlocked } from '../sim/ordnance';
import { game, useGame } from '../sim/store';

// Contextual target menu (GDD): tap a found enemy's ping and get every ordnance option for
// it, with uses and cooldowns, plus sending the team in.
export function TargetMenu({ contactId }: { contactId: string }) {
  const state = useGame((s) => s);
  const c = state.contacts.find((x) => x.id === contactId);
  if (!c) return null;
  const ahead = state.team.route.slice(state.team.waypoint).includes(c.square);
  const status = (w: (typeof WEAPONS)[number]) => {
    const o = state.ordnance[w];
    return weaponBlocked(state, w) ?? (o.uses === null ? 'Ready' : `${o.uses} use${o.uses === 1 ? '' : 's'}`);
  };
  return (
    <div className="target-menu" data-testid="target-menu">
      <p className="note">
        {c.status === 'cleared' ? 'Destroyed.' : c.status === 'avoided' ? 'Avoided.' : 'Pick ordnance, or send the team.'}
      </p>
      {c.status === 'revealed' && (
        <div className="options">
          {WEAPONS.map((w) => (
            <button key={w} disabled={!!weaponBlocked(state, w)} onClick={() => game.fire(c.id, w)} data-testid={`fire-${w}`}>
              <span>{WEAPON[w].name}</span>
              <small>{status(w)}</small>
            </button>
          ))}
          {ahead && (
            <button onClick={() => game.sendTeam(c.id)} data-testid="send-team">
              <span>Send {state.team.callsign} in</span>
              <small>{state.team.decisions[c.square] === 'attack' ? 'ordered' : 'surprise attack'}</small>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
