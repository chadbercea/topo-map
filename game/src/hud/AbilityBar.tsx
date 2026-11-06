import { useState } from 'react';
import { game, useGame } from '../sim/store';
import { CALLSIGN, unlockBlocked, WEAPON, weaponBlocked } from '../sim/ordnance';
import { LEVELS, UNLOCK } from '../sim/prices';
import { perCall } from '../sim/upgrades';

const SHORT = { sniper: 'Sniper', drone: 'Drone', heli: 'Heli' } as const;

// Short money: $250k, $1.5M, −$400k.
export const cash = (n: number) => {
  const a = Math.abs(n);
  const v = a >= 1_000_000 ? `${+(a / 1_000_000).toFixed(2)}M` : a >= 1_000 ? `${Math.round(a / 1_000)}k` : String(a);
  return `${n < 0 ? '−' : ''}$${v}`;
};

// The ability bar (ILI-1316): Castle House's balance and its three capabilities in the order
// they're bought: the sniper contract, the drone, the heli. Locked, each shows its price and,
// once the balance covers it, buys it; unlocked, what a call costs and whether it's ready.
// Strikes are called at their target's square (its menu).
// No longer floating over the map (ILI-1397): it lives in the toolbox, tier three, behind one
// small button.
export function AbilityBar() {
  const s = useGame((x) => x);
  const balance = s.resources.budget;
  return (
    <section className="ability-bar" data-testid="ability-bar" aria-label="Capabilities">
      <div className="ab-balance" data-red={balance < 0 || undefined}>
        <small>Balance</small>
        <b data-testid="balance">{cash(balance)}</b>
      </div>
      {LEVELS.map((w, i) => {
        const o = s.ordnance[w];
        const why = o.unlocked ? null : unlockBlocked(s, w);
        const busy = o.unlocked ? weaponBlocked(s, w) : null;
        return (
          <button
            key={w}
            className="ab-slot"
            data-state={o.unlocked ? (busy ? 'busy' : 'ready') : why ? 'locked' : 'buyable'}
            disabled={o.unlocked || !!why}
            onClick={() => game.unlock(w)}
            title={o.unlocked ? `${CALLSIGN[w]}: call it from a target's square` : (why ?? `Buy the ${WEAPON[w].name.toLowerCase()}`)}
            data-testid={`ability-${w}`}
          >
            <i>{i + 1}</i>
            <span>{SHORT[w]}</span>
            <small>{o.unlocked ? (busy && busy.startsWith('Ready in') ? busy : `${cash(perCall(s, w))} / call`) : `Unlock ${cash(UNLOCK[w])}`}</small>
          </button>
        );
      })}
    </section>
  );
}

// The toolbox (ILI-1397): ordnance and support the game hasn't asked for, tier three, behind one
// small button. It never opens by itself. The button carries the balance, so it's always in view.
export function Toolbox() {
  const balance = useGame((s) => s.resources.budget);
  const [open, setOpen] = useState(false);
  return (
    <div className="toolbox" data-open={open || undefined} data-overlay="toolbox">
      {open && <AbilityBar />}
      <button className="toolbox-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="toolbox-toggle">
        <span>Toolbox</span>
        <b data-red={balance < 0 || undefined}>{cash(balance)}</b>
      </button>
    </div>
  );
}
