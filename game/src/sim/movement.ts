import { squareCenter } from '../map/grid';
import { heightAt, theater } from '../map/terrain';
import type { System } from './systems';

// The team moves on its own (GDD: the player never controls it), waypoint to waypoint in
// straight legs. Climbing slows it.

export const BASE_SPEED = 12; // world units per second on flat ground (a square in ~17 s)
const METRES_PER_UNIT = 5; // a 200-unit square is 1 km
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

  const t = theater();
  const { x, y } = team.position;
  const dx = goal.x - x;
  const dy = goal.y - y;
  const dist = Math.hypot(dx, dy);
  const ux = dist ? dx / dist : 0;
  const uy = dist ? dy / dist : 0;

  const h0 = heightAt(t, x, y);
  const grade = (heightAt(t, x + ux * PROBE, y + uy * PROBE) - h0) / (PROBE * METRES_PER_UNIT);
  const step = Math.min(dist, (legSpeed(grade) * dt) / 1000);
  const nx = x + ux * step;
  const ny = y + uy * step;

  const arrived = step >= dist;
  const waypoint = arrived ? team.waypoint + 1 : team.waypoint;
  const next = team.route[waypoint];

  return {
    ...s,
    team: {
      ...team,
      position: arrived ? goal : { x: nx, y: ny },
      waypoint,
      activity: next ? `Moving to ${next}` : `Holding at ${target}`,
    },
  };
};
