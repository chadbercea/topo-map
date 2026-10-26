import { roster, vitalsFor, type Operator } from './team';
import type { SquareId } from '../map/grid';
import { squareCenter } from '../map/grid';
import type { MapEvent, Scheduled } from './events';
import { initialComms, type Comms } from './comms';
import type { Capability } from './responses';
import type { Fight, Treatment } from './firefight';
import { initialIntel, type Buff, type Intel } from './intel';
import type { MiniGame } from './minigame';
import type { Contact, Decision } from './contacts';
import { BLACK_BOX } from './missions/blackBox';
import type { MissionDef } from './script';
import type { SideJob } from './sidejob';
import type { Deniability } from './noise';
import type { Inbound } from './support';
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
  timer: { remainingMs: number; totalMs: number }; // totalMs: this mission's length
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
  script: { mission: string; fired: string[] }; // the mission script and which triggers have run
  flags: Record<string, boolean>; // choices the mission script reacts to (jammed, ...)
  stats: { searched: number; decoded: number; bonus: number; lost: string[] }; // for the wrap-up; lost: ids of operators who went down
  sideJob: SideJob | null; // the client's side offer
  inbound: Inbound[]; // support on its way
  alerted: boolean; // the enemy knows a PMC is in the area
  deniability: Deniability; // how the client feels about the noise
  rng: number; // seed for chance in fights, kept in state so a mission replays exactly
  settings: Settings; // survives restart
};

// The mission being played; see missions/. Its route runs A (infil), B (the crash site), C (exfil).
export const MISSION: MissionDef = BLACK_BOX;
export const ROUTE: SquareId[] = MISSION.route;
export const MISSION_MS = MISSION.durationMs; // GDD: start with six minutes and tune by feel

// missionMs: the mission's length, the script's six minutes unless tuned (?minutes=).
export function initialState(settings: Settings = DEFAULT_SETTINGS, missionMs: number = MISSION_MS): GameState {
  const operators = roster();
  return {
    tick: 0,
    elapsedMs: 0,
    phase: 'running',
    timer: { remainingMs: missionMs, totalMs: missionMs },
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
    contacts: MISSION.contacts(),
    events: [],
    schedule: MISSION.schedule,
    openEvent: null,
    comms: initialComms(),
    intel: initialIntel(MISSION.feed),
    minigame: null,
    resources: { budget: 0, scans: 3, rechargeAtMs: null },
    capabilities: ['imagery'],
    ordnance: initialOrdnance(),
    noise: 0,
    script: { mission: MISSION.id, fired: [] },
    flags: {},
    stats: { searched: 0, decoded: 0, bonus: 0, lost: [] },
    sideJob: null,
    inbound: [],
    alerted: false,
    deniability: 'clean',
    rng: 1234,
    settings,
  };
}
