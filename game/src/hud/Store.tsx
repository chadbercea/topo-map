import { useState } from 'react';
import { UPGRADES } from '../sim/upgrades';
import { cash } from './AbilityBar';
import { buyUpgrade, cantBuy, loadBalance, loadUpgrades } from './ledger';

// The after-mission store (ILI-1317): what Castle House buys with the balance it carries
// forward, to do the job better from the start of the next mission. Grouped as a PMC would think
// about it: intel collection, the teams, support contracts, logistics, the business.
export function Store({ close }: { close: () => void }) {
  const [, redraw] = useState(0);
  const balance = loadBalance();
  const owned = loadUpgrades();
  const groups = [...new Set(UPGRADES.map((u) => u.group))];
  return (
    <section className="panel menu store" role="dialog" aria-label="Castle House store" data-testid="store">
      <h2>CASTLE HOUSE · UPGRADES</h2>
      <p className="store-balance">
        Balance <b data-testid="store-balance" data-red={balance < 0 || undefined}>{cash(balance)}</b>
      </p>
      {groups.map((g) => (
        <div key={g} className="store-group">
          <h3>{g}</h3>
          {UPGRADES.filter((u) => u.group === g).map((u) => {
            const why = cantBuy(u.id);
            const has = owned.includes(u.id);
            return (
              <div key={u.id} className="store-item" data-owned={has || undefined}>
                <div>
                  <b>{u.name}</b>
                  <small>{u.what}</small>
                </div>
                <button disabled={!!why} onClick={() => buyUpgrade(u.id) && redraw((n) => n + 1)} data-testid={`buy-${u.id}`} title={why ?? undefined}>
                  {has ? 'Owned' : cash(u.price)}
                </button>
              </div>
            );
          })}
        </div>
      ))}
      <button onClick={close}>Back to the report</button>
    </section>
  );
}
