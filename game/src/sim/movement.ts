import { squareCenter } from '../map/grid';
import { heightAt, theater } from '../map/terrain';
import type { System } from './systems';
import { LOADOUT, type Operator } from './team';

// The team moves on its own (GDD: the player never controls it), waypoint to waypoint in
// straight legs. Climbing slows it and builds fatigue; fatigue slows it further.

export const BASE_SPEED = 12; // world units per second on flat ground (a square in ~17 s)
const METRES_PER_UNIT = 5; // a 200-unit square is 1 km
const PROBE = 10; // world units ahead used to measure the slope
const CLIMB_PENALTY = 4; // a 25% uphill grade halves speed
const FATIGUE_SLOW = 0.35; // at full fatigue, 35% slower
const FATIGUE_PER_CLIMB_M = 0.2; // fatigue points per metre climbed, at the heaviest load
const RECOVERY_PER_S = 0.5; // fatigue points shed per second on flat or downhill

// Heavier ammo loads tire faster (the heavy gunner carries the most).
const MAX_LOAD = Math.max(...Object.values(LOADOUT).map((l) => l.ammo));
const loadFactor = (o: Operator) => 0.5 + 0.5 * (LOADOUT[o.role].ammo / MAX_LOAD);

// grade: rise over run, both in metres (0.1 = 10% uphill). Downhill is full speed.
export function legSpeed(grade: number, fatigue: number) {
  return (BASE_SPEED / (1 + CLIMB_PENALTY * Math.max(0, grade))) * (1 - (FATIGUE_SLOW * fatigue) / 100);
}

export const teamFatigue = (ops: Operator[]) => Math.max(...ops.map((o) => o.fatigue));

export const movementSystem: System = (s, dt) => {
  const { team } = s;
  const target = team.route[team.waypoint];
  const goal = target && squareCenter(target);
  if (!goal) return s;

  const t = theater();
  const { x, y } = team.position;
  const dx = goal.x - x;
  const dy = goal.y - y;
  const dist = Math.hypot(dx, dy);
  const ux = dist ? dx / dist : 0;
  const uy = dist ? dy / dist : 0;

  const h0 = heightAt(t, x, y);
  const grade = (heightAt(t, x + ux * PROBE, y + uy * PROBE) - h0) / (PROBE * METRES_PER_UNIT);
  const step = Math.min(dist, (legSpeed(grade, teamFatigue(team.operators)) * dt) / 1000);
  const nx = x + ux * step;
  const ny = y + uy * step;
  const climbed = Math.max(0, heightAt(t, nx, ny) - h0);

  const arrived = step >= dist;
  const waypoint = arrived ? team.waypoint + 1 : team.waypoint;
  const next = team.route[waypoint];
  const operators = team.operators.map((o) => {
    const fatigue = climbed > 0
      ? o.fatigue + climbed * FATIGUE_PER_CLIMB_M * loadFactor(o)
      : o.fatigue - (RECOVERY_PER_S * dt) / 1000;
    return { ...o, fatigue: Math.min(100, Math.max(0, fatigue)) };
  });

  return {
    ...s,
    team: {
      ...team,
      position: arrived ? goal : { x: nx, y: ny },
      waypoint,
      operators,
      activity: next ? `Moving to ${next}` : `Holding at ${target}`,
    },
  };
};
