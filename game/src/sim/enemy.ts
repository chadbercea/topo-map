import { nextRandom } from './firefight';
import type { Contact } from './contacts';
import type { IntelItem } from './intel';
import type { GameState } from './state';

// The enemy runs on rules and the mission's dice, not a script (ILI-1454): the same situation
// always plays out by the same rules, and the dice are seeded by the mission, so a mission
// replays exactly. A different seed is a different run.

// The mission's dice for one named thing: 0 to 1, the same every time for the same seed and key.
// Keyed draws don't use up the fight dice (s.rng), so a fight never changes when the patrol moves.
export function dice(seed: number, key: string): number {
  let h = (seed ^ 0x811c9dc5) >>> 0;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return nextRandom(h)[0];
}

const live = (c: Contact) => c.status === 'hidden' || c.status === 'revealed';

// Enemy radio traffic is a reward of scanning (ILI-1359): nothing comes up on a timer and nothing
// pops up by itself. A scan's reports are random (ILI-1362); when one of them is SIGINT that heard
// something, their traffic comes up on the scanned square as a tag, and HQ can listen in (ORION-3
// is already over it) or jam it. One net: while traffic is up, a scan hears nothing new. A jammed
// net carries nothing, and with no live group left there's nobody talking.
export const trafficOpen = (s: GameState) => s.events.some((e) => e.kind === 'signal' && e.status !== 'resolved');

export const heardTraffic = (items: readonly IntelItem[] = []) => items.some((i) => i.kind === 'SIGINT' && i.heat !== 'quiet');

export function hearTraffic(s: GameState, square: string): GameState {
  if (s.flags.jammed || trafficOpen(s) || !s.contacts.some(live)) return s;
  const id = `traffic-${square.toLowerCase()}-${s.elapsedMs}`;
  return { ...s, events: [...s.events, { id, kind: 'signal', square, title: 'Enemy radio traffic', atMs: s.elapsedMs, status: 'new' }] };
}
