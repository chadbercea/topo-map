import { roster, vitalsFor, type Operator } from './team';
import type { SquareId } from '../map/grid';
import { squareCenter } from '../map/grid';
import { DEMO_SCHEDULE, type MapEvent, type Scheduled } from './events';
import { initialComms, type Comms } from './comms';
import type { Capability } from './responses';
import type { Fight, Treatment } from './firefight';
import { initialIntel, type Buff, type Intel } from './intel';
import type { MiniGame } from './minigame';
import { DEMO_CONTACTS, type Contact, type Decision } from './contacts';
import { initialOrdnance, type Ordnance } from './ordnance';
import { initialMission, type Mission } from './mission';

// The whole game in one plain object. Systems never mutate it: each tick returns a new
// state, so React can tell what changed by reference and tests can compare snapshots.

// paused: pause menu open. ended: timer ran out. exited: player left the mission.
export type Phase = 'running' | 'paused' | 'ended' | 'exited';

export type MapView = 'topo' | 'relief';
export type Settings = { sound: boolean; mapView: MapView; city: boolean };
export const DEFAULT_SETTINGS: Settings = { sound: true, mapView: 'topo', city: true };

export type GameState = {
  tick: number;
  elapsedMs: number; // mission time actually played, excludes pauses
  phase: Phase;
  timer: { remainingMs: number };
  mission: Mission;
  team: {
    callsign: string;
    operators: Operator[];
    position: { x: number; y: number }; // world units
    route: SquareId[]; // squares the team walks through, in order
    waypoint: number; // index into route of the square it's heading for
    activity: string;
    holdFor: string | null; // radio call the team is waiting on HQ to answer
    holdUntilMs: number; // mission time a timed hold ends
    activeUntilMs: number; // the readout stays in Mode B until then (fights, wounds, healing)
    vitals: string; // health/ammo/meds last tick, to notice them changing
    fight: Fight | null;
    treating: Treatment | null; // the medic at work
    buffs: Buff[]; // intel HQ has sent the team
    decisions: Record<string, Decision>; // what HQ decided about squares on the route
  };
  map: { cols: number; rows: number; scanned: string[]; selected: string | null };
  contacts: Contact[]; // hidden until imagery finds them
  events: MapEvent[];
  schedule: Scheduled[]; // events still to come, by mission time
  openEvent: string | null; // the event card on screen
  comms: Comms;
  intel: Intel;
  minigame: MiniGame | null; // the mini game on the map, or its result until closed
  resources: { budget: number; scans: number; rechargeAtMs: number | null }; // next scan back from the satellite
  capabilities: Capability[]; // what the PMC can offer the team; gates responses
  ordnance: Ordnance;
  noise: number; // 0-100, how loud the PMC has been
  alerted: boolean; // the enemy knows a PMC is in the area
  rng: number; // seed for chance in fights, kept in state so a mission replays exactly
  settings: Settings; // survives restart
};

// The mission route: A (infil, G5), B (the crash site, D3), C (exfil, B1). See mission.ts.
export const ROUTE: SquareId[] = ['G5', 'F4', 'E3', 'D3', 'C2', 'B1'];

export const MISSION_MS = 6 * 60 * 1000; // GDD: start with six minutes and tune by feel

export function initialState(settings: Settings = DEFAULT_SETTINGS): GameState {
  const operators = roster();
  return {
    tick: 0,
    elapsedMs: 0,
    phase: 'running',
    timer: { remainingMs: MISSION_MS },
    mission: initialMission(ROUTE),
    team: {
      callsign: 'ALPHA',
      operators,
      position: squareCenter(ROUTE[0])!,
      route: ROUTE,
      waypoint: 1,
      activity: `Moving to ${ROUTE[1]}`,
      holdFor: null,
      holdUntilMs: 0,
      activeUntilMs: 0,
      vitals: vitalsFor(operators),
      fight: null,
      treating: null,
      buffs: [],
      decisions: {},
    },
    map: { cols: 8, rows: 5, scanned: [ROUTE[0]], selected: null }, // the insertion point is known ground
    contacts: DEMO_CONTACTS,
    events: [],
    schedule: DEMO_SCHEDULE,
    openEvent: null,
    comms: initialComms(),
    intel: initialIntel(),
    minigame: null,
    resources: { budget: 0, scans: 3, rechargeAtMs: null },
    capabilities: ['imagery'],
    ordnance: initialOrdnance(),
    noise: 0,
    alerted: false,
    rng: 1234,
    settings,
  };
}
