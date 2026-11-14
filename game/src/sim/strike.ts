import type { GameState } from './state';
import type { Contact } from './contacts';
import { freshness, targets } from './imagery';
import { squareAt } from '../map/grid';
import { airGone } from './air';
import { sniperGone } from './sniper';
import { lockedOn, satName } from './satellite';
import { shownEvents } from './events';
import { weaponBlocked, type Weapon } from './ordnance';

// A contact HQ can hit (ILI-1302): a found group of fighters, not a radio report of one.
export const strikeable = (e: GameState['events'][number]) => e.kind === 'contact' && e.id.startsWith('contact-');

// Is a strike under way on the square: the sniper, the drone or the heli at work there.
export function strikeRunning(s: GameState, square: string): boolean {
  const now = s.elapsedMs;
  return (!!s.sniper && s.sniper.square === square && !sniperGone(s.sniper, now)) || [s.drone, s.heli].some((r) => !!r && r.square === square && !airGone(r, now));
}

// What can be struck on a square, and whether it can be now (ILI-1467): only the square ORION-3 is
// locked on, only once a look (photo or video) shows fighters there and isn't stale (ILI-1417: a
// radio report of a contact is a report, not a target), and not while a strike is already under
// way there (ILI-1425).
export function strikeState(s: GameState, square: string) {
  const marked = targets(s).filter((t) => squareAt(t.x, t.y) === square);
  const look = s.imagery[square];
  const running = strikeRunning(s, square);
  const seenHere = !!look && freshness(look, s.elapsedMs) !== 'stale' && marked.length > 0;
  const strikes = s.events.filter((e) => e.square === square && strikeable(e) && e.status !== 'resolved');
  const locked = lockedOn(s, square);
  return { marked, running, strikes, seen: seenHere && strikes.length > 0, locked, can: locked && seenHere && strikes.length > 0 && !running };
}

// The squares with an ALERT (ILI-1524): every square where HQ has found fighters that threaten
// ALPHA and hasn't dealt with them yet, and every square a strike is still working. The ALERT is a
// button on the square's bottom edge; it never opens on its own.
export function alertSquares(s: GameState): string[] {
  const fight = s.team.fight?.square; // ALPHA in contact raises one on its fight, scanned or not (ILI-1524, ILI-1535)
  const found = shownEvents(s).filter((e) => strikeable(e) && e.status !== 'resolved').map((e) => e.square);
  const hit = [s.sniper, s.drone, s.heli].filter((r) => !!r).map((r) => r!.square).filter((sq) => strikeRunning(s, sq));
  return [...new Set([...(fight ? [fight] : []), ...found, ...hit])];
}

// Why a weapon can't hit this contact now, in a few words for its button, or null if it can
// (ILI-1524): the strike panel never clicks dead, so every reason the store would refuse shows, and
// one more: a second strike doesn't go on a square while the first is still working it (ILI-1425).
// The weapon itself first (bought, used, rearming, busy), then the square (a strike already on it,
// ORION-3 not over it), then whether HQ can see the fighters.
export function strikeBlocked(s: GameState, w: Weapon, c: Contact): string | null {
  const own = weaponBlocked(s, w);
  if (own) return own;
  const square = s.events.find((e) => e.id === `contact-${c.id}`)?.square ?? c.square;
  if (strikeRunning(s, square)) return 'Strike under way';
  if (!lockedOn(s, square) && !painting(s, w, c)) return `${satName(s)} not over ${square}`;
  return weaponBlocked(s, w, c);
}

// ALPHA in contact paints its target (ILI-1524, Chad 11-14): the drone can go in on that alone,
// without ORION-3 over the square or imagery of it. Only the drone, at its normal one use; the
// other weapons still need ORION-3.
export const painting = (s: GameState, w: Weapon, c: Contact) => w === 'drone' && s.team.fight?.contactId === c.id;
