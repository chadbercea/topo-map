import { describe, expect, it } from 'vitest';
import { activePrompt } from './prompts';
import { initialState as rolledState, type GameState } from './state';
import { fixed } from './testkit';
// A fixed enemy layout, not the rolled map (testkit FIXTURE, ILI-1544).
const initialState = (...a: Parameters<typeof rolledState>) => fixed(rolledState(...a));
import { createStore } from './store';
import { analyzable, DECAY_MS, DOWNLOAD_MS, grade, INT_KINDS, pushPhoto, pushVideo, reports, settled, shelfState, VIDEO_INTEL } from './intel';
import { squareAt, squareCenter } from '../map/grid';
import { answerIntel, fed as walkFree, lockOn, pulled, run } from './testkit';
import { initialSatellite } from './satellite';

// Fresh intel (ILI-1532): ALPHA moves only into squares HQ has analyzed in the last DECAY_MS.
const blindAhead = (): GameState => {
  const s = initialState();
  return { ...s, team: { ...s.team, decisions: Object.fromEntries(s.team.route.map((sq) => [sq, 'blind' as const])) } };
};
// ORION-3 parked far off, so no square's clock is held.
const away = (s: GameState): GameState => ({ ...s, satellite: initialSatellite('A1') });

describe('fresh intel', () => {
  it('starts with nothing fresh: ALPHA holds short of the next square, says so once, and the clock runs', () => {
    const s0 = blindAhead();
    const s = run(s0, 3_000);
    expect(s.team.position).toEqual(s0.team.position);
    expect(s.team.activity).toBe('Holding · needs intel');
    expect(s.comms.messages.filter((m) => m.id === 'needs-intel').map((m) => m.text)).toEqual(["Holding. No intel on what's ahead. Get us eyes on F4."]);
    expect(s.timer.remainingMs).toBeLessThan(s0.timer.remainingMs);
  });

  it('a fresh Analyze of the next square releases it', () => {
    const s0 = run(blindAhead(), 1_000);
    const s = run(pushPhoto(s0, 'F4', 0).next, 3_000);
    expect(s.team.activity).toBe('Moving to F4');
    expect(s.team.position).not.toEqual(s0.team.position);
  });

  it('an analyzed square decays back to unknown in DECAY_MS once ORION-3 is off it', () => {
    const s0 = away(pushPhoto(blindAhead(), 'C4', 0).next);
    expect(settled(s0, 'C4')).toBe(true);
    expect(analyzable(s0, 'C4')).toBe(false);
    const mid = run(s0, DECAY_MS - 1_000);
    expect(settled(mid, 'C4')).toBe(true);
    const gone = run(mid, 1_100);
    expect(settled(gone, 'C4')).toBe(false);
    expect(gone.intel.fresh.C4).toBeUndefined();
    expect(analyzable(gone, 'C4')).toBe(true); // as if never visited: Analyze is open again
  });

  it('its clock holds while ORION-3 is over the square, and runs again once it leaves', () => {
    const s0 = lockOn(pushPhoto(blindAhead(), 'C4', 0).next, 'C4');
    const held = run(s0, DECAY_MS * 2);
    expect(held.intel.fresh.C4).toBe(DECAY_MS);
    const s = run(away(held), DECAY_MS + 100);
    expect(settled(s, 'C4')).toBe(false);
  });

  it('decayed, the square loses its picture, its stamp, and what ALPHA learned from it', () => {
    const base = pushPhoto(blindAhead(), 'C4', 0).next;
    const s0 = away({ ...base, map: { ...base.map, scanned: ['C4'] }, imagery: { C4: { square: 'C4', atMs: 0, mode: 'photo', seen: [], live: false } }, team: { ...base.team, known: { x: { square: 'C4', units: 2, atMs: 0 } } } });
    const s = run(s0, DECAY_MS + 100);
    expect(s.imagery.C4).toBeUndefined();
    expect(s.map.scanned).not.toContain('C4');
    expect(s.team.known.x).toBeUndefined();
  });

  it('the stretch after the opening: answering where the prompt points keeps ALPHA going (ILI-1391)', () => {
    const store = createStore(blindAhead());
    const start = store.get().team.waypoint;
    for (let t = 0; t < 300_000; t += 100) {
      store.tick(100);
      answerIntel(store, activePrompt(store.get())); // click the square, wait for the lock, Analyze; ALPHA pulls it
    }
    // Slower than the gauge was: every square waits on its own Analyze, and E3's dug-in group holds it up.
    expect(store.get().team.waypoint).toBeGreaterThan(start + 1);
  });

  it('decayed under ALPHA mid-crossing: it finishes the crossing, then holds before the next square', () => {
    const s0 = run(pushPhoto(blindAhead(), 'F4', 0).next, 3_000);
    expect(s0.team.activity).toBe('Moving to F4');
    const lost = { ...s0, intel: { ...s0.intel, graded: [], fresh: {} } }; // F4's intel gone while ALPHA is on its way
    const s = run(lost, 60_000);
    expect(s.team.waypoint).toBe(s0.team.waypoint + 1); // it got to F4
    expect(s.team.activity).toBe('Holding · needs intel'); // and holds short of E3
  });

  it('video comes after a scan, is one big fill, and has no limit (ILI-1432)', () => {
    const store = createStore(blindAhead());
    store.lookAt('G5');
    store.capture('video');
    expect(store.get().satellite.state).not.toBe('capturing'); // scan first
    store.scan('G5');
    store.capture('video');
    store.set(run(store.get(), 16_000));
    expect(store.get().intel.live).toContain('G5');
    expect(store.get().intel.pushes.find((p) => p.grade === 'video')).toMatchObject({ amount: VIDEO_INTEL }); // its feed, on the shelf till ALPHA pulls it (ILI-1499)
    store.set(pulled(store.get()));
    expect(store.get().intel.pushes.find((p) => p.grade === 'video')?.state).toBe('fed');
    store.lookAt('F4');
    store.set(run(store.get(), 20_000));
    store.scan('F4');
    store.capture('video');
    expect(store.get().satellite.state).toBe('capturing'); // a second video: no limit any more
  });

  it('a photo is graded by what it found: fighters are high grade, a square already gone through is all clear', () => {
    const s = initialState();
    expect(grade(s, 'E3', 5)).toBe('high');
    const { next, grade: first } = pushPhoto(s, 'F2', 0);
    expect(grade(next, 'F2', 0)).toBe('clear');
    expect(grade(s, 'F2', 0)).toBe(first); // the same square grades the same in a replay
  });

  it('Analyze posts the package on the shelf; ALPHA, holding at the infil, pulls it down, and only then moves (ILI-1499, ILI-1532)', () => {
    const store = createStore(lockOn(initialState(), 'F4'));
    store.scan('F4');
    expect(shelfState(store.get(), 'F4')).toBe('posted'); // on the shelf: HQ can't push it to the team
    expect(store.get().comms.messages.at(-1)?.text).toMatch(/analysis complete: .*\. Intel posted for ALPHA\./);
    store.tick(100);
    expect(shelfState(store.get(), 'F4')).toBe('pulling'); // holding: it syncs at once
    expect(store.get().intel.download).toBeTruthy();
    for (let t = 100; t < DOWNLOAD_MS - 100; t += 100) store.tick(100);
    expect(store.get().team.position).toEqual(squareCenter('G5')); // still coming down
    store.tick(200);
    expect(shelfState(store.get(), 'F4')).toBe('received');
    for (let i = 0; i < 20; i++) store.tick(100);
    expect(store.get().team.activity).toMatch(/^Moving/); // the opening (ILI-1485): released by its first pull
  });

  it('on the move, ALPHA pulls at the next square it reaches, not before (ILI-1499)', () => {
    const s0 = walkFree(initialState());
    const mid = run(s0, 3_000); // on its way out of the infil
    expect(mid.team.activity).toMatch(/^Moving/);
    const far = mid.team.route[mid.team.waypoint + 2];
    const posted = lockOn(mid, far);
    const store = createStore(posted);
    store.scan(far);
    let s = store.get();
    expect(shelfState(s, far)).toBe('posted');
    const from = squareAt(s.team.position.x, s.team.position.y);
    for (let t = 0; t < 120_000 && squareAt(s.team.position.x, s.team.position.y) === from; t += 100) {
      expect(shelfState(s, far)).toBe('posted'); // waits on the shelf while ALPHA is mid-square
      s = run(s, 100);
    }
    expect(shelfState(s, far)).toBe('pulling'); // the square it reached: it syncs
    s = run(s, DOWNLOAD_MS);
    expect(shelfState(s, far)).toBe('received');
  });

  it('a video feed goes on the shelf too, and lands once pulled (ILI-1499)', () => {
    const s = pushVideo(lockOn(initialState(), 'G5'));
    expect(shelfState(s, 'G5')).toBe('posted');
    expect(run(s, DOWNLOAD_MS + 100).intel.pushes.find((p) => p.grade === 'video')).toMatchObject({ state: 'fed', amount: VIDEO_INTEL });
  });
});

// The five types of intel (ILI-1362): every look brings in at least one report, of a random
// type; a quiet square says so, and a hot one can bring in three.
describe('intel reports', () => {
  it('a quiet square brings in one "nothing here" report', () => {
    const s = initialState();
    const r = reports(s, 'C4', 'clear');
    expect(r).toHaveLength(1);
    expect(r[0].heat).toBe('quiet');
    expect(INT_KINDS).toContain(r[0].kind);
  });
  it('a hot square brings in three reports, all different types', () => {
    const r = reports(initialState(), 'E3', 'high', 3);
    expect(r).toHaveLength(3);
    expect(new Set(r.map((x) => x.kind)).size).toBe(3);
    expect(r.every((x) => x.heat === 'hot')).toBe(true);
  });
  it('the types vary from square to square', () => {
    const s = initialState();
    const kinds = new Set(['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8'].map((q) => reports(s, q, 'clear')[0].kind));
    expect(kinds.size).toBeGreaterThan(2);
  });
  it('a photo push carries its reports', () => {
    const { next } = pushPhoto(initialState(), 'F4', 0);
    expect(next.intel.pushes.at(-1)!.items!.length).toBeGreaterThan(0);
  });
});

// An Analyze settles a square while it's fresh (ILI-1399, ILI-1532).
describe('settled squares', () => {
  it('ALPHA moves into a square with fresh intel it has pulled, without asking', () => {
    const s0 = blindAhead();
    const next = s0.team.route[s0.team.waypoint];
    const known = { ...s0, intel: { ...s0.intel, graded: [next], fresh: { [next]: DECAY_MS } } };
    const s = run(known, 5_000);
    expect(s.team.position).not.toEqual(s0.team.position);
    expect(s.team.activity).toMatch(/^Moving/);
  });

  it('HQ is never asked for a square that is still fresh', async () => {
    const { requestSquare } = await import('./imageryRequest');
    const s0 = blindAhead();
    const all = { ...s0, intel: { ...s0.intel, graded: [...s0.team.route] } };
    expect(requestSquare(all)).toBeUndefined();
  });

  it('a square reads clear when its scan found nothing, found when it did', async () => {
    const { squareFindings, settled } = await import('./intel');
    const s = initialState();
    const quiet = { ...s, intel: { ...s.intel, graded: ['C4'], pushes: [{ id: 'p', atMs: 0, source: 'IMINT' as const, square: 'C4', amount: 1, state: 'fed' as const, items: [{ kind: 'OSINT' as const, heat: 'quiet' as const, text: 'nothing posted from here' }] }] } };
    expect(settled(quiet, 'C4')).toBe(true);
    expect(squareFindings(quiet, 'C4')).toBe('clear');
    const hot = { ...quiet, intel: { ...quiet.intel, pushes: [{ ...quiet.intel.pushes[0], items: [{ kind: 'SIGINT' as const, heat: 'hot' as const, text: 'radio traffic' }] }] } };
    expect(squareFindings(hot, 'C4')).toBe('found');
  });
});
