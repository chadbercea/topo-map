import { CELL, parseSquare, type SquareId } from '../map/grid';
import type { Message } from './comms';
import type { GameState } from './state';
import type { System } from './systems';
import { confirmKills, eyesOn, groupOrigin, unitSpot } from './imagery';
import { makeNoise, NOISE } from './noise';
import { spendWeapon, weaponBlocked } from './ordnance';
import { CASH_PER_STRIKE_KILL, earn, markSite } from './sites';

// The drone strike (ILI-1252): REAPER-1 flies to the square, a countdown to target, then
// crosses it west to east and takes out every fighter in it, nearest first as it passes. No
// mini game and no aiming: HQ picks the square and watches. Kills HQ has eyes on are
// confirmed and pay; the rest are found later. One use a mission, and loud.

export const DRONE_CALLSIGN = 'REAPER-1'; // in its panel, and under it on the map
export const FLIGHT_MS = 10_000; // launch to target
export const CROSS_MS = 2_000; // over the square, west to east
export const LINGER_MS = 3_000; // "All targets neutralized" stays up, then the panel goes

export type Kill = { contactId: string; unit: number; x: number; y: number; atMs: number; seen: boolean };

export type DroneRun = {
  square: SquareId;
  launchedMs: number;
  arriveMs: number;
  kills: Kill[] | null; // planned when it arrives, each at the moment the drone passes it
  doneMs: number | null; // when the last kill landed
};

export const droneArrived = (d: DroneRun, now: number) => now >= d.arriveMs;
export const droneGone = (d: DroneRun, now: number) => d.doneMs !== null && now >= d.doneMs + LINGER_MS;

// Where the drone is over the square, 0 (west edge) to 1 (east), while it crosses.
export const droneAt = (d: DroneRun, now: number) => Math.min(1, Math.max(0, (now - d.arriveMs) / CROSS_MS));

export function launchDrone(s: GameState, contactId: string): GameState {
  const c = s.contacts.find((x) => x.id === contactId);
  if (!c || c.status !== 'revealed' || weaponBlocked(s, 'drone', c) || (s.drone && !droneGone(s.drone, s.elapsedMs))) return s;
  return {
    ...spendWeapon(s, 'drone'),
    openEvent: null,
    drone: { square: c.square, launchedMs: s.elapsedMs, arriveMs: s.elapsedMs + FLIGHT_MS, kills: null, doneMs: null },
  };
}

// Every fighter in the square, in the order the drone passes over them.
function plan(s: GameState, d: DroneRun): Kill[] {
  const west = parseSquare(d.square)!.col * CELL;
  const kills: Kill[] = [];
  for (const c of s.contacts) {
    if (c.square !== d.square || (c.status !== 'hidden' && c.status !== 'revealed')) continue;
    const eyes = eyesOn(s, c);
    const seen = c.status === 'revealed' && !!eyes && eyes.level !== 'stale';
    const o = groupOrigin(c, s.elapsedMs);
    for (const unit of c.units) {
      const p = unitSpot(o, unit);
      kills.push({ contactId: c.id, unit, ...p, atMs: d.arriveMs + Math.round(((p.x - west) / CELL) * CROSS_MS), seen });
    }
  }
  return kills.sort((a, b) => a.atMs - b.atMs);
}

const report = (s: GameState, d: DroneRun, text: string): Message => ({
  id: `drone-${d.launchedMs}`,
  from: DRONE_CALLSIGN,
  text,
  atMs: s.elapsedMs,
  status: 'new',
  holds: false,
});

// Each tick: on arrival the run is planned and heard; each fighter goes down as the drone
// passes; once the last one has, the contacts are cleared and REAPER-1 reports.
export const droneSystem: System = (s) => {
  const d = s.drone;
  if (!d || d.doneMs !== null || !droneArrived(d, s.elapsedMs)) return s;
  let next = s;
  let run = d;
  if (!run.kills) {
    run = { ...run, kills: plan(s, run) };
    next = makeNoise(next, NOISE.drone);
  }
  const kills = run.kills!;
  const landed = kills.filter((k) => k.atMs <= s.elapsedMs);
  // Fighters come off the board, and HQ's picture, as the drone passes them.
  next = {
    ...next,
    contacts: next.contacts.map((c) => {
      const down = landed.filter((k) => k.contactId === c.id).map((k) => k.unit);
      return down.length ? { ...c, units: c.units.filter((u) => !down.includes(u)) } : c;
    }),
  };
  for (const id of new Set(landed.map((k) => k.contactId))) next = confirmKills(next, id, landed.filter((k) => k.contactId === id).map((k) => k.unit));
  if (landed.length < kills.length) return { ...next, drone: run };

  // The pass is over: every contact it hit is gone, with a kill site to search.
  const hit = new Set(kills.map((k) => k.contactId));
  for (const c of next.contacts.filter((x) => hit.has(x.id))) next = markSite(next, c);
  next = {
    ...next,
    contacts: next.contacts.map((c) => (hit.has(c.id) ? { ...c, status: 'cleared' as const } : c)),
    events: next.events.map((e) => (e.kind === 'contact' && hit.has(e.id.replace('contact-', '')) ? { ...e, status: 'resolved' as const } : e)),
  };
  const confirmed = kills.filter((k) => k.seen).length;
  next = earn(next, confirmed * CASH_PER_STRIKE_KILL);
  const pay = confirmed ? ` +$${(confirmed * CASH_PER_STRIKE_KILL).toLocaleString('en-US')}.` : kills.length ? ' Unconfirmed: no eyes on it.' : '';
  const text = kills.length ? `${d.square}: all targets neutralized. ${kills.length} down.${pay}` : `${d.square}: nothing there. No targets.`;
  return {
    ...next,
    drone: { ...run, doneMs: s.elapsedMs },
    comms: { ...next.comms, messages: [...next.comms.messages, report(next, d, text)] },
  };
};
