import { METRES_PER_UNIT, squareCenter } from '../map/grid';
import { heightAt, theater } from '../map/terrain';
import { findPath, legSquares } from '../map/paths';
import type { System } from './systems';
import type { Message } from './comms';
import { moving } from './intel';
import { speedFactor } from './upgrades';
import { footfall } from './noise';

// The team moves on its own (GDD: the player never controls it), waypoint to waypoint. Each
// leg follows the ground (paths.ts, ILI-1191): roads, stream banks, the easy way up. Climbing
// slows it.

const STARVED = 'Holding · needs intel';

export const BASE_SPEED = 7.2; // world units per second on flat ground (a square in ~28 s, ~2.6 km/h in game time)
const PROBE = 10; // world units ahead used to measure the slope
const CLIMB_PENALTY = 4; // a 25% uphill grade halves speed

// grade: rise over run, both in metres (0.1 = 10% uphill). Downhill is full speed.
export function legSpeed(grade: number) {
  return BASE_SPEED / (1 + CLIMB_PENALTY * Math.max(0, grade));
}

export const movementSystem: System = (s, dt) => {
  const { team } = s;
  const target = team.route[team.waypoint];
  const goal = target && squareCenter(target);
  if (!goal || team.holdFor || team.fight || team.treating || s.elapsedMs < team.holdUntilMs) return s; // holding, fighting or treating
  // Holding short of a contact for HQ to soften it (ILI-1315), until it's done or time's up.
  if (team.waitFor?.square === target && s.elapsedMs < team.waitFor.untilMs) {
    const activity = `Holding short of ${target} · soften them up`;
    return team.activity === activity ? s : { ...s, team: { ...team, activity } };
  }
  // Out of intel (ILI-1314): it holds where it is until HQ feeds the gauge again.
  if (!moving(s)) {
    if (team.activity === STARVED) return s;
    const held = { ...s, team: { ...team, activity: STARVED } };
    // The first time it stalls, it says what it needs (ILI-1318): eyes on the ground ahead. Once
    // a mission: after that the gauge and the need line say it.
    if (s.comms.messages.some((m) => m.id === 'needs-intel')) return held;
    const ahead = team.route.slice(team.waypoint).find((sq) => !s.map.scanned.includes(sq)) ?? target;
    const line: Message = { id: 'needs-intel', from: team.callsign, text: `Holding. No intel on what's ahead. Get us eyes on ${ahead}.`, atMs: s.elapsedMs, status: 'new', holds: false };
    return { ...held, comms: { ...held.comms, messages: [...held.comms.messages, line] } };
  }

  // A new leg: work out the way there from where ALPHA stands.
  const path = team.pathTo === target && team.path.length ? team.path : findPath(team.position, target, legSquares(team.position));
  const t = theater();
  const { x, y } = team.position;
  const point = path[0];
  const dx = point.x - x;
  const dy = point.y - y;
  const dist = Math.hypot(dx, dy);
  const ux = dist ? dx / dist : 0;
  const uy = dist ? dy / dist : 0;

  const h0 = heightAt(t, x, y);
  const grade = (heightAt(t, x + ux * PROBE, y + uy * PROBE) - h0) / (PROBE * METRES_PER_UNIT);
  const step = Math.min(dist, (legSpeed(grade) * speedFactor(s) * dt) / 1000); // training (ILI-1317)
  const nx = x + ux * step;
  const ny = y + uy * step;

  const reached = step >= dist; // this point of the path
  const rest = reached ? path.slice(1) : path;
  const arrived = reached && !rest.length; // the square itself
  const waypoint = arrived ? team.waypoint + 1 : team.waypoint;
  const next = team.route[waypoint];

  return {
    ...s,
    team: {
      ...team,
      position: arrived ? goal : reached ? point : { x: nx, y: ny },
      path: arrived ? [] : rest,
      pathTo: arrived ? null : target,
      waypoint,
      activity: next ? `Moving to ${next}` : `Holding at ${target}`,
      operators: team.operators.map((o, i) => (o.health > 0 ? { ...o, steps: footfall(i, s.elapsedMs, grade) } : o)), // heard on the move (ILI-1266)
    },
  };
};
