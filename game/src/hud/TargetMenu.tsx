import type { ReactNode } from 'react';
import { WEAPON, WEAPONS, type Weapon } from '../sim/ordnance';
import { strikeBlocked } from '../sim/strike';
import { game, useGame } from '../sim/store';
import { eyesOn, type Eyes } from '../sim/imagery';
import { gameSpan } from '../sim/gameTime';
import { perCall } from '../sim/upgrades';
import { cash } from './MissionBar';
import { WireAvatar } from './OrionAvatar';
import { DroneMark, HeliMark } from './AirPanel';
import { RifleMark } from './SniperPanel';

const age = gameSpan;

// What HQ can see of it, in a few words: strikes aim at this. ISR terms (ILI-1488): coverage,
// current, aging, stale. Short since ILI-1513.
export function eyesLine(e: Eyes | null, now: number) {
  if (!e) return 'No coverage. Only the drone can fire blind.';
  if (e.level === 'live') return 'Live feed.';
  if (e.level === 'fresh') return `Current imagery, ${age(now - e.atMs)} old.`;
  if (e.level === 'ghost') return `Aging imagery, ${age(now - e.atMs)} old. Shots can miss.`;
  return `Stale imagery, ${age(now - e.atMs)} old. Analyze again.`;
}

// The strike options (ILI-1513): one line on what HQ can see of the target, since that decides
// which weapons can aim (ILI-1168), then one button a weapon: its aircraft or rifle turning in the
// HUD's wireframe, a one-word name, and the price of a call, or why it can't fire now. The buttons
// slide in one after another (styles.css).
const SHORT: Record<Weapon, string> = { drone: 'Drone', sniper: 'Sniper', heli: 'Heli' };
type Mount = (host: HTMLElement, stateRef: { current: string }, repaint: { current: (() => void) | null }) => (() => void) | null;
const LOAD: Record<Weapon, () => Promise<{ mount: Mount }>> = {
  drone: () => import('./droneScene') as Promise<{ mount: Mount }>,
  sniper: () => import('./rifleScene') as Promise<{ mount: Mount }>,
  heli: () => import('./heliScene') as Promise<{ mount: Mount }>,
};
const MARK: Record<Weapon, ReactNode> = { drone: <DroneMark />, sniper: <RifleMark />, heli: <HeliMark /> };

// The scenes' own states: ready is their working look, blocked their dim one.
function WeaponIcon({ w, ready }: { w: Weapon; ready: boolean }) {
  const state = ready ? (w === 'sniper' ? 'aiming' : 'inbound') : 'done';
  return <WireAvatar state={state} fallback={MARK[w]} load={LOAD[w]} className="w-icon" />;
}

export function TargetMenu({ contactId }: { contactId: string }) {
  const state = useGame((s) => s);
  const c = state.contacts.find((x) => x.id === contactId);
  if (!c) return null;
  return (
    <div className="target-menu" data-testid="target-menu">
      <p className="note" data-testid="eyes">
        {c.status === 'cleared'
          ? 'Destroyed.'
          : c.status === 'avoided'
            ? 'Avoided.'
            : c.painted
              ? 'Painted by ALPHA: every fighter marked.'
              : eyesLine(eyesOn(state, c), state.elapsedMs)}
      </p>
      {c.note && c.status === 'revealed' && <p className="note" data-testid="target-note">{c.note}</p>}
      {c.status === 'revealed' && (
        <div className="options" aria-label="Strike">
          {WEAPONS.map((w) => {
            const blocked = strikeBlocked(state, w, c); // why it can't fire, on the button: never a dead click (ILI-1524)
            return (
              <button key={w} disabled={!!blocked} onClick={() => game.fire(c.id, w)} data-testid={`fire-${w}`} aria-label={WEAPON[w].name} data-cue={(state.team.waitFor?.square === c.square && !blocked) || undefined /* ALPHA asked for this (ILI-1318) */}>
                <WeaponIcon w={w} ready={!blocked} />
                <span>{SHORT[w]}</span>
                <small>{blocked ?? cash(perCall(state, w))}</small>
              </button>
            );
          })}
          {/* No "ALPHA attacks": HQ doesn't order the team, it changes the odds (ILI-1315). */}
        </div>
      )}
    </div>
  );
}
