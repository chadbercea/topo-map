import { describe, expect, it } from 'vitest';
import { activePrompt } from './prompts';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { DOWNLOAD_MS, feed, gauge, grade, GRADE_INTEL, INT_KINDS, LOW_AT, pushPhoto, pushVideo, reports, shelfState, SQUARE_INTEL, VIDEO_INTEL } from './intel';
import { squareAt, squareCenter } from '../map/grid';
import { answerIntel, fed as fedGauge, lockOn, pulled, run } from './testkit';

// ALPHA's intel gauge (ILI-1314): it moves only while HQ keeps it fed.
const blindAhead = (): GameState => {
  const s = initialState();
  // HQ has said "move in blind" everywhere, so only the gauge decides whether ALPHA moves.
  return { ...s, team: { ...s.team, decisions: Object.fromEntries(s.team.route.map((sq) => [sq, 'blind' as const])) } };
};

describe('the intel gauge', () => {
  it('starts empty, and an unfed team holds where it is', () => {
    const s0 = blindAhead();
    expect(gauge(s0)).toBe(0);
    const s = run(s0, 3_000);
    expect(s.team.position).toEqual(s0.team.position);
    expect(s.team.activity).toBe('Holding · needs intel');
  });

  it('intel is fuel: it holds while ALPHA stands still, and burns only as ALPHA walks (ILI-1341)', () => {
    const fed = feed(initialState(), 30);
    expect(gauge(fed)).toBe(30);
    // Holding for another reason (a call, say): nothing burns.
    const held = run({ ...fed, team: { ...fed.team, holdUntilMs: 60_000 } }, 30_000);
    expect(gauge(held)).toBe(30);
    // Walking burns it.
    const s0 = feed(blindAhead(), 30);
    expect(gauge(run(s0, 5_000))).toBeLessThan(30);
  });

  it('every grade of photo moves ALPHA, even all clear', () => {
    const s0 = feed(blindAhead(), GRADE_INTEL.clear);
    const moved = run(s0, 3_000);
    expect(moved.team.position).not.toEqual(s0.team.position);
  });

  it("a square's worth of intel walks ALPHA about a square, then it holds", () => {
    const s0 = feed(blindAhead(), SQUARE_INTEL);
    const s = run(s0, 120_000);
    expect(gauge(s)).toBe(0);
    expect(s.team.activity).toBe('Holding · needs intel');
    const dx = Math.hypot(s.team.position.x - s0.team.position.x, s.team.position.y - s0.team.position.y);
    expect(dx).toBeGreaterThan(150); // a square is 200 units; paths wind
    expect(dx).toBeLessThanOrEqual(200);
  });

  it('running low on the move, ALPHA requests imagery before it stops (ILI-1341, ILI-1349)', () => {
    const s = run(feed(blindAhead(), LOW_AT - 1), 1_000);
    expect(s.team.activity).toMatch(/^Moving/);
    expect(activePrompt(s)).toMatchObject({ kind: 'intel-needed', grid: expect.stringMatching(/^[A-H]\d$/), text: expect.stringMatching(/^ALPHA requested imagery of [A-H]\d$/) });
  });

  it('the stretch after the opening scans: scanning where the prompt points keeps ALPHA going (ILI-1341, ILI-1391)', () => {
    // Play it the way the player is told to: when the prompt says scan, scan where it points.
    const store = createStore(blindAhead());
    const start = store.get().team.waypoint;
    for (let t = 0; t < 300_000; t += 100) {
      store.tick(100);
      const p = activePrompt(store.get());
      answerIntel(store, p); // click the square, wait for the lock, Analyze; ALPHA pulls it (ILI-1451, ILI-1499)
    }
    expect(store.get().team.waypoint).toBeGreaterThan(start + 3);
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
    expect(gauge(next)).toBe(GRADE_INTEL[first]);
    expect(grade(next, 'F2', 0)).toBe('clear');
    expect(grade(s, 'F2', 0)).toBe(first); // the same square grades the same in a replay
  });

  it('scanning ahead pays: a square past the next one banks, and hits the gauge as ALPHA heads into it (ILI-1316)', () => {
    const s0 = blindAhead();
    const next = s0.team.route[s0.team.waypoint]; // F4: the leg it's on
    const later = s0.team.route[s0.team.waypoint + 1]; // E3: further on
    const near = pushPhoto(s0, next, 0);
    expect(near.banked).toBe(false);
    expect(gauge(near.next)).toBeGreaterThan(0); // the square it's heading into feeds now
    const far = pushPhoto(s0, later, 3);
    expect(far.banked).toBe(true);
    expect(gauge(far.next)).toBe(0); // banked: nothing yet
    // ALPHA reaches F4 and starts for E3: the bank pays out, high grade.
    const s = run({ ...far.next, intel: { ...far.next.intel, base: 100 } }, 60_000);
    expect(s.team.route[s.team.waypoint]).not.toBe(next);
    expect(s.intel.banked).toHaveLength(0);
    expect(s.intel.fuel).toBeGreaterThan(GRADE_INTEL.medium); // E3's high grade paid out, less the walk since
  });

  it('banked intel for a square ALPHA no longer goes to (it went around it) pays out at once (ILI-1315)', () => {
    const s0 = blindAhead();
    const later = s0.team.route[s0.team.waypoint + 1];
    const far = pushPhoto(s0, later, 3).next;
    const rerouted = { ...far, team: { ...far.team, route: far.team.route.map((sq) => (sq === later ? 'E4' : sq)) } };
    const s = run(rerouted, 100);
    expect(s.intel.banked).toHaveLength(0);
    expect(gauge(s)).toBeGreaterThan(0);
  });

  it('Analyze posts the package on the shelf; ALPHA, holding at the infil, pulls it down, and only then has it (ILI-1499)', () => {
    const store = createStore(initialState());
    store.lookAt('G5');
    store.scan('G5');
    expect(gauge(store.get())).toBe(0); // on the shelf: HQ can't push it to the team
    expect(shelfState(store.get(), 'G5')).toBe('posted');
    expect(store.get().comms.messages.at(-1)?.text).toMatch(/Analysts: (all clear|[a-z]+-grade intel), posted for ALPHA\./);
    store.tick(100);
    expect(shelfState(store.get(), 'G5')).toBe('pulling'); // holding: it syncs at once
    expect(store.get().intel.download).toBeTruthy();
    for (let t = 100; t < DOWNLOAD_MS - 100; t += 100) store.tick(100);
    expect(gauge(store.get())).toBe(0); // still coming down
    expect(store.get().team.position).toEqual(squareCenter('G5'));
    store.tick(200);
    expect(shelfState(store.get(), 'G5')).toBe('received');
    expect(gauge(store.get())).toBeGreaterThan(0);
    for (let i = 0; i < 20; i++) store.tick(100);
    expect(store.get().team.activity).toMatch(/^Moving/); // the opening (ILI-1485): released by its first pull
  });

  it('on the move, ALPHA pulls at the next square it reaches, not before (ILI-1499)', () => {
    const s0 = fedGauge(initialState());
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

  it('a video feed goes on the shelf too, and fills the gauge once pulled (ILI-1499)', () => {
    const s = pushVideo(lockOn(initialState(), 'G5'));
    expect(gauge(s)).toBe(0);
    expect(shelfState(s, 'G5')).toBe('posted');
    expect(gauge(run(s, DOWNLOAD_MS + 100))).toBe(VIDEO_INTEL);
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

// One scan settles a square (ILI-1399).
describe('settled squares', () => {
  it('ALPHA crosses settled ground on an empty gauge, and burns nothing doing it', () => {
    const s0 = blindAhead();
    const next = s0.team.route[s0.team.waypoint];
    const known = { ...s0, intel: { ...s0.intel, graded: [next] } };
    const s = run(known, 5_000);
    expect(s.team.position).not.toEqual(s0.team.position);
    expect(gauge(s)).toBe(0);
    expect(s.team.activity).toMatch(/^Moving/);
  });

  it('HQ is never asked to scan a square twice', async () => {
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
