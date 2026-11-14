import { initialSatellite, type Satellite } from './satellite';
import type { Snapshot } from './imagery';
import { roster, vitalsFor, type Operator } from './team';
import type { SquareId } from '../map/grid';
import { squareCenter } from '../map/grid';
import type { MapEvent, Scheduled } from './events';
import { initialComms, type Comms } from './comms';
import { initialIntel, type Intel } from './intel';
import { openLedger, type Ledger } from './prices';
import { deployCost, medsFactor } from './upgrades';
import type { Capability } from './responses';
import type { Fight, Treatment } from './firefight';
import type { MiniGame } from './minigame';
import type { Listen } from './signal';
import type { AirRun } from './air';
import type { SniperRun } from './sniper';
import type { ExfilRun } from './exfil';
import type { Contact, Decision } from './contacts';
import { BLACK_BOX } from './missions/blackBox';
import type { MissionDef } from './script';
import type { Inbound } from './support';
import { initialOrdnance, type Ordnance, type Weapon } from './ordnance';
import { initialMission, type Mission } from './mission';
import { initialStream, type Stream } from './stream';
import type { Picture } from './picture';

// The whole game in one plain object. Systems never mutate it: each tick returns a new
// state, so React can tell what changed by reference and tests can compare snapshots.

// The game opens running, in the war room with ALPHA already on the ground (ILI-1194).
// paused: pause menu open. ended: timer ran out. exited: player left the mission.
// standby: the HUD is up but the clock hasn't started (the intro and boot, ILI-1280).
export type Phase = 'standby' | 'running' | 'paused' | 'ended' | 'exited';

export type MapView = 'topo' | 'relief';
export type Settings = { mapView: MapView; city: boolean; skipIntro: boolean }; // skipIntro: START goes straight to the boot (ILI-1290)
export const DEFAULT_SETTINGS: Settings = { mapView: 'topo', city: true, skipIntro: false };

// A square ALPHA moved into blind, and what it found there when it arrived (ILI-1309): the
// gamble's outcome, stamped on the map.
export type BlindLook = { square: string; atMs: number; found: boolean };

export type GameState = {
  tick: number;
  elapsedMs: number; // mission time actually played, excludes pauses
  stream: Stream; // the mission's intel stream on the left
  phase: Phase;
  timer: { remainingMs: number; totalMs: number }; // totalMs: this mission's length
  mission: Mission;
  team: {
    callsign: string;
    operators: Operator[];
    position: { x: number; y: number }; // world units
    route: SquareId[]; // squares the team walks through, in order
    waypoint: number; // index into route of the square it's heading for
    path: { x: number; y: number }[]; // the way across the ground to that square (ILI-1191)
    pathTo: SquareId | null; // the square the path leads to
    activity: string;
    holdFor: string | null; // radio call the team is waiting on HQ to answer
    holdUntilMs: number; // mission time a timed hold ends
    waitFor: { square: string; untilMs: number } | null; // holding short of a contact for HQ to soften it (ILI-1315)
    activeUntilMs: number; // the readout stays in Mode B until then (fights, wounds, healing)
    vitals: string; // health/ammo/meds last tick, to notice them changing
    fight: Fight | null;
    treating: Treatment | null; // the medic at work
    decisions: Record<string, Decision>; // what HQ decided about squares on the route
    known: Picture; // ALPHA's own picture of the enemy: what it was sent or saw (ILI-1495)
  };
  map: { cols: number; rows: number; scanned: string[]; selected: string | null; blind: BlindLook[] };
  contacts: Contact[]; // hidden until imagery finds them
  events: MapEvent[];
  schedule: Scheduled[]; // events still to come, by mission time
  openEvent: string | null; // the event card on screen
  comms: Comms;
  minigame: MiniGame | null; // the mini game on the map, or its result until closed
  drone: AirRun | null; // REAPER-1's strike: in flight, over the square, or just done
  heli: AirRun | null; // HAMMER-2's gun run, the same way (ILI-1254)
  sniper: SniperRun | null; // OVERWATCH's last run: shooting, or done
  exfil: ExfilRun | null; // RAVEN-6 coming for ALPHA, from the pilot's call on (ILI-1264)
  resources: { budget: number; ledger: Ledger }; // the balance now, and where the mission's money went (ILI-1316)
  bankrupt: boolean; // the PMC's credit ran out (ILI-1316)
  searching: string[]; // buildings HQ sent ALPHA to search (ILI-1316)
  listen: Listen | null; // an asset on its way into range of enemy traffic (ILI-1394)
  acked: string[]; // prompts HQ has seen to that the state alone can't clear (an operator hurt, ILI-1396)
  upgrades: string[]; // what the PMC has bought in the store (ILI-1317)
  satellite: Satellite; // ORION-3: where it's looking and what it's doing
  imagery: Record<string, Snapshot>; // the newest look at each square
  capabilities: Capability[]; // what the PMC can offer the team; gates responses
  ordnance: Ordnance;
  noise: number; // 0-100, how loud the PMC has been
  script: { mission: string; fired: string[] }; // the mission script and which triggers have run
  flags: Record<string, boolean>; // choices the mission script reacts to (jammed, ...)
  intel: Intel; // ALPHA's intel gauge: what keeps it moving (ILI-1314)
  stats: { searched: number; decoded: number; lost: string[] }; // for the wrap-up; lost: ids of operators who went down
  inbound: Inbound[]; // support on its way
  alerted: boolean; // the enemy knows a PMC is in the area
  seed: number; // the mission's seed: its dice (enemy.ts) and where the fight dice start, so a mission replays exactly (ILI-1454)
  rng: number; // chance in fights, kept in state so a mission replays exactly; starts at the seed
  settings: Settings; // survives restart
};

// The mission being played; see missions/. Its route runs A (infil), B (the crash site), C (exfil).
export const MISSION: MissionDef = BLACK_BOX;
export const ROUTE: SquareId[] = MISSION.route;
export const MISSION_SEED = 1234; // ?seed= plays another (ILI-1454)
export const MISSION_MS = MISSION.durationMs; // GDD started at six minutes; ten since ILI-1251

// missionMs: the mission's length, the script's ten minutes unless tuned (?minutes=). This is
// how the game opens: live, ALPHA on the ground, the clock running.
// The opening (ILI-1485): ALPHA holds at the infil with ORION-3 locked on over it. The gauge
// starts empty, so the hold is the intel gauge's own (movement.ts): ALPHA moves off once HQ's
// first intel lands. Tests and automation pin the gauge full (testkit fed, main.tsx), so there
// the team walks from the first tick as before.
// opening: Castle House's balance coming into the mission, carried from the last; unlocked:
// the capabilities it carries in (ILI-1316).
export function initialState(settings: Settings = DEFAULT_SETTINGS, missionMs: number = MISSION_MS, opening = 0, unlocked: readonly Weapon[] = [], upgrades: readonly string[] = [], seed = MISSION_SEED): GameState {
  const operators = roster().map((o) => ({ ...o, meds: Math.round(o.meds * medsFactor(upgrades)) })); // a field hospital (ILI-1317)
  return {
    tick: 0,
    elapsedMs: 0,
    stream: initialStream(),
    phase: 'running',
    timer: { remainingMs: missionMs, totalMs: missionMs },
    mission: initialMission(ROUTE, MISSION.satellite),
    team: {
      callsign: 'ALPHA',
      operators,
      position: squareCenter(ROUTE[0])!,
      route: ROUTE,
      waypoint: 1,
      path: [],
      pathTo: null,
      activity: `Holding at ${ROUTE[0]}`, // at the infil until HQ's first intel fills the gauge (ILI-1485)
      holdFor: null,
      holdUntilMs: 0,
      waitFor: null,
      activeUntilMs: 0,
      vitals: vitalsFor(operators),
      fight: null,
      treating: null,
      decisions: {},
      known: {},
    },
    map: { cols: 8, rows: 5, scanned: [ROUTE[0]], selected: null, blind: [] }, // the insertion point is known ground
    contacts: MISSION.contacts(seed),
    events: [],
    schedule: MISSION.schedule,
    openEvent: null,
    comms: initialComms(),
    minigame: null,
    drone: null,
    heli: null,
    sniper: null,
    exfil: null,
    resources: { budget: opening - deployCost(upgrades), ledger: { ...openLedger(opening), deploy: -deployCost(upgrades) } },
    bankrupt: false,
    searching: [],
    listen: null,
    acked: [],
    upgrades: [...upgrades],
    satellite: initialSatellite(ROUTE[0]), // over the team at the infil, locked on (ILI-1485)
    imagery: {},
    capabilities: ['imagery'],
    ordnance: initialOrdnance(unlocked),
    noise: 0,
    script: { mission: MISSION.id, fired: [] },
    flags: {},
    intel: initialIntel(),
    stats: { searched: 0, decoded: 0, lost: [] },
    inbound: [],
    alerted: false,
    seed,
    rng: seed,
    settings,
  };
}
