import { useLayoutEffect, useRef } from 'react';
import { game, useGame } from '../sim/store';
import { useTier } from './tier';
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

// The ability bar (ILI-1316): along the map's foot, Castle House's balance and its three
// capabilities in the order they're bought: the sniper contract, the drone, the heli. Locked,
// each shows its price and, once the balance covers it, buys it; unlocked, what a call costs and
// whether it's ready. Strikes are still called at their target's square (its anchor).
// Front and center (ILI-1352, option B): on a wide screen it's a hotbar on the screen's center
// line, in its own strip under the map. The strip is the map's column, which isn't centered on
// the screen, so the bar slides over to the center line, as far as the strip lets it.
export function AbilityBar() {
  const s = useGame((x) => x);
  const balance = s.resources.budget;
  const tier = useTier();
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const strip = el?.parentElement;
    if (!el || !strip) return;
    const centre = () => {
      if (tier !== 'wide') return void (el.style.transform = '');
      const r = strip.getBoundingClientRect();
      const room = Math.max(0, (r.width - el.offsetWidth) / 2);
      const shift = innerWidth / 2 - (r.left + r.width / 2);
      el.style.transform = `translateX(${Math.round(Math.max(-room, Math.min(room, shift)))}px)`;
    };
    centre();
    const ro = new ResizeObserver(centre);
    ro.observe(strip);
    ro.observe(el);
    addEventListener('resize', centre);
    return () => {
      ro.disconnect();
      removeEventListener('resize', centre);
    };
  }, [tier]);
  return (
    <section ref={ref} className="ability-bar" data-testid="ability-bar" aria-label="Capabilities">
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
