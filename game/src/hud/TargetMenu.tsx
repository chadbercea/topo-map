import { WEAPON, WEAPONS, weaponBlocked } from '../sim/ordnance';
import { game, useGame } from '../sim/store';
import { eyesOn, type Eyes } from '../sim/imagery';
import { gameSpan } from '../sim/gameTime';

const age = gameSpan;

// What HQ can see of it, in words: strikes aim at this.
export function eyesLine(e: Eyes | null, now: number) {
  if (!e) return 'No eyes on it: the sniper and heli can\'t aim. Look at it first, or a drone can guess.';
  if (e.level === 'live') return 'Live: every fighter is where you see them.';
  if (e.level === 'fresh') return `Fresh look, ${age(now - e.atMs)} old: they should still be there.`;
  if (e.level === 'ghost') return `Look is ${age(now - e.atMs)} old: they may have moved. Shots can miss.`;
  return `Look is ${age(now - e.atMs)} old: too stale to aim on. Look again.`;
}

// Contextual target menu (GDD): tap a found enemy's ping and get every ordnance option for
// it, with uses and cooldowns, plus sending the team in. It leads with what HQ can see of
// it, since that decides which weapons can aim (ILI-1168).
export function TargetMenu({ contactId }: { contactId: string }) {
  const state = useGame((s) => s);
  const c = state.contacts.find((x) => x.id === contactId);
  if (!c) return null;
  const ahead = state.team.route.slice(state.team.waypoint).includes(c.square);
  const status = (w: (typeof WEAPONS)[number]) => {
    const o = state.ordnance[w];
    return weaponBlocked(state, w, c) ?? (o.uses === null ? 'Ready' : `${o.uses} ${w === 'sniper' ? 'round' : 'use'}${o.uses === 1 ? '' : 's'}`);
  };
  return (
    <div className="target-menu" data-testid="target-menu">
      <p className="note" data-testid="eyes">
        {c.status === 'cleared'
          ? 'Destroyed.'
          : c.status === 'avoided'
            ? 'Avoided.'
            : c.painted
              ? 'PAINTED by ALPHA: every fighter is marked for your strike.'
              : eyesLine(eyesOn(state, c), state.elapsedMs)}
      </p>
      {c.note && c.status === 'revealed' && <p className="note" data-testid="target-note">{c.note}</p>}
      {c.status === 'revealed' && (
        <div className="options" aria-label="Strike">
          {WEAPONS.map((w) => (
            <button key={w} disabled={!!weaponBlocked(state, w, c)} onClick={() => game.fire(c.id, w)} data-testid={`fire-${w}`}>
              <span>{WEAPON[w].name}</span>
              <small>{status(w)}</small>
            </button>
          ))}
          {ahead && (
            <button onClick={() => game.sendTeam(c.id)} data-testid="send-team">
              <span>{state.team.callsign} attacks</span>
              <small>{state.team.decisions[c.square] === 'attack' ? 'ordered' : 'surprise attack'}</small>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
