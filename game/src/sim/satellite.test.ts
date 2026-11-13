import { describe, expect, it } from 'vitest';
import { moveContact } from './contacts';
import { FRESH_MS, GHOST_MS, freshness } from './imagery';
import { planDepartMs } from './enemy';
import { lockedOn, SETTLE_MS, SLEW_MS_PER_SQUARE, slewMs } from './satellite';
import { blockers } from './progress';
import { initialState, type GameState } from './state';
import { createStore, type Store } from './store';
import { run, trafficId, untilTraffic, walking } from './testkit';

// ORION-3 over G5 at the start; ALPHA doesn't ask for looks any more (ILI-1315): HQ tasks it.
const atStart = () => createStore(initialState());

// Wait for ORION-3 to get on station (run, not store.tick, so nothing else needs answering).
const onStation = (store: Store) => {
  for (let i = 0; i < 200 && store.get().satellite.state === 'slewing'; i++) store.tick(100);
  expect(store.get().satellite.state).toBe('onStation');
};

// Video comes after a scan (ILI-1432).
const look = (store: Store, square: string, mode: 'photo' | 'video' = 'photo') => {
  store.lookAt(square);
  onStation(store);
  if (mode === 'video') store.scan(square);
  store.capture(mode);
};

describe('ORION-3 tasking', () => {
  it('on station, ORION-3 says it\u2019s ready and taking the shot is what needs HQ (ILI-1257)', () => {
    const store = atStart();
    store.lookAt('F4');
    onStation(store);
    expect(store.get().comms.messages.at(-1)).toMatchObject({ from: 'ORION-3', text: 'On station over F4. Ready for collection.' });
    store.capture('photo');
    expect(blockers(store.get()).map((b) => b.text)).not.toContain('ORION-3 on station over F4: take the shot');
  });

  it('a slew takes its time: G5 to F4 is one square diagonally', () => {
    const store = atStart();
    store.lookAt('F4');
    const s = store.get();
    expect(s.satellite).toMatchObject({ state: 'slewing', aim: 'F4', callId: null });
    expect(s.satellite.arriveMs - s.elapsedMs).toBe(Math.round((SETTLE_MS + Math.SQRT2 * SLEW_MS_PER_SQUARE) / 100) * 100);
  });

  it('Analyze images the square and posts its package for ALPHA (ILI-1432, ILI-1499)', () => {
    const store = atStart();
    look(store, 'F4');
    const s = store.get();
    expect(s.map.scanned).toContain('F4');
    expect(s.satellite).toMatchObject({ state: 'idle', aim: 'F4', result: { square: 'F4', mode: 'photo', fighters: 0 } });
    expect(s.imagery.F4).toMatchObject({ mode: 'photo', live: false, seen: [] });
    expect(s.comms.messages.some((m) => m.from === 'ORION-3' && /F4 collection complete \(analysis\): nothing there\. Analysts: [a-z -]+, posted for ALPHA\./.test(m.text))).toBe(true); // on the shelf (ILI-1499)
  });

  it('a look at E3 finds the checkpoint: every fighter, and that they have not noticed ALPHA', () => {
    const store = createStore(walking());
    store.set({ ...store.get(), contacts: initialState().contacts });
    look(store, 'E3');
    const s = store.get();
    expect(s.contacts.find((c) => c.id === 'checkpoint')!.status).toBe('revealed');
    expect(s.imagery.E3.seen).toEqual([expect.objectContaining({ contactId: 'checkpoint', units: [1, 5, 6, 9, 10], awareness: 'unaware' })]);
    expect(s.satellite.result).toMatchObject({ fighters: 5, moving: 0, awareness: 'unaware' });
    expect(s.events.find((e) => e.id === 'contact-checkpoint')!.square).toBe('E3');
  });

  it('travel time grows with distance, and looking where it already is costs nothing', () => {
    const s = initialState();
    expect(slewMs(s, 'G5')).toBe(0);
    expect(slewMs(s, 'A1')).toBeGreaterThan(slewMs(s, 'E3'));
    expect(slewMs(s, 'E5')).toBe(SETTLE_MS + 2 * SLEW_MS_PER_SQUARE);
  });

  it('while it captures it is busy: no new task', () => {
    const store = atStart();
    look(store, 'G4', 'video');
    expect(store.get().satellite.state).toBe('capturing');
    store.lookAt('A1');
    expect(store.get().satellite.aim).toBe('G4');
  });

  it('cancel stops it where it is', () => {
    const store = atStart();
    store.lookAt('F4');
    store.tick(1_000);
    store.cancelLook();
    expect(store.get().satellite.state).toBe('idle');
  });
});

describe('fog of war', () => {
  // The patrol is on its way from C2 to D3 for the last half minute before it gets there.
  const walkingPatrol = (): GameState => {
    const s0: GameState = { ...walking(), contacts: initialState().contacts };
    let s: GameState = { ...s0, elapsedMs: planDepartMs(s0, s0.contacts.find((c) => c.id === 'patrol')!) - 100 };
    s = run(s, 1_000);
    expect(s.contacts.find((c) => c.id === 'patrol')!.move?.to).toBe('D3');
    return s;
  };

  it('video shows who is moving and where to; a photo cannot tell (no burst, ILI-1314)', () => {
    const video = createStore(walkingPatrol());
    look(video, 'C2', 'video');
    video.set(run(video.get(), 300));
    expect(video.get().imagery.C2.seen[0]).toMatchObject({ contactId: 'patrol', to: 'D3' });

    const photo = createStore(walkingPatrol());
    look(photo, 'C2', 'photo');
    expect(photo.get().imagery.C2.seen[0].to).toBeNull();
  });

  it('video is live while it runs, and stays live for good even once ORION-3 is tasked away (ILI-1423, ILI-1432)', () => {
    const store = createStore(walkingPatrol());
    look(store, 'C2', 'video');
    store.set(run(store.get(), 2_000));
    expect(store.get().imagery.C2).toMatchObject({ mode: 'video', live: true });
    store.set(run(store.get(), 14_000));
    expect(store.get().imagery.C2.live).toBe(true); // still over it: real time
    store.lookAt('E3');
    expect(store.get().imagery.C2.live).toBe(true); // video is live for good (ILI-1432)
  });

  it('a look ages: fresh, then a ghost, then stale', () => {
    const store = createStore(walking());
    look(store, 'E3');
    const snap = store.get().imagery.E3;
    expect(freshness(snap, snap.atMs + 1_000)).toBe('fresh');
    expect(freshness(snap, snap.atMs + FRESH_MS + 1)).toBe('ghost');
    expect(freshness(snap, snap.atMs + GHOST_MS + 1)).toBe('stale');
  });

  it('a contact that moves unseen keeps its marker where it was last seen, until someone looks', () => {
    const store = createStore({ ...walking(), contacts: initialState().contacts });
    look(store, 'C2');
    store.set(moveContact(store.get(), 'patrol', 'B2'));
    expect(store.get().events.find((e) => e.id === 'contact-patrol')!.square).toBe('C2');
    look(store, 'B2');
    expect(store.get().events.find((e) => e.id === 'contact-patrol')!.square).toBe('B2');
  });

  it('ALPHA sees the square it stands in, live', () => {
    const s = run(walking(), 200);
    expect(s.imagery.G5).toMatchObject({ mode: 'eyes', live: true });
  });
});

describe('Scan from the square menu (ILI-1367)', () => {
  it('never moves the satellite by itself: on a square it is not over, Scan does nothing (ILI-1397)', () => {
    const store = atStart();
    store.scan('F4');
    expect(store.get().satellite.state).toBe('idle');
    expect(store.get().imagery.F4).toBeUndefined();
  });

  it('the move step, then Scan: on arrival it is locked on and the photo is one press (ILI-1397)', () => {
    const store = atStart();
    store.moveSatellite('F4');
    expect(lockedOn(store.get(), 'F4')).toBe(false);
    for (let i = 0; i < 400 && store.get().satellite.state === 'slewing'; i++) store.tick(100);
    expect(lockedOn(store.get(), 'F4')).toBe(true);
    store.scan('F4');
    expect(store.get().satellite.result?.square).toBe('F4');
    expect(store.get().imagery.F4).toBeDefined();
  });

  it('nothing runs on a square ORION-3 is not locked on: strikes, search, Listen, Jam (ILI-1397)', () => {
    const s0 = untilTraffic(initialState()); // enemy traffic up at C2
    const store = createStore({ ...s0, satellite: { ...s0.satellite, aim: 'H8', from: { col: 7, row: 7 }, state: 'idle' } });
    const id = trafficId(s0);
    store.jam(id);
    expect(store.get().minigame).toBeNull();
    expect(store.get().events.find((e) => e.id === id)?.status).not.toBe('resolved');
    store.search('C2');
    expect(store.get().searching).toEqual([]);
  });

  it('called off mid-swing, it stops over the square it is crossing, not where it was going', () => {
    const store = atStart();
    store.moveSatellite('A1');
    store.tick(3_000);
    store.cancelLook();
    expect(store.get().satellite.aim).not.toBe('A1');
    expect(lockedOn(store.get(), store.get().satellite.aim)).toBe(true);
  });

  it('already over the square, the photo is now', () => {
    const store = atStart();
    const over = store.get().satellite.aim;
    store.scan(over);
    expect(store.get().satellite.state).toBe('idle');
    expect(store.get().satellite.result?.square).toBe(over);
  });

  it('Reposition stays the satellite’s own control: it moves and waits for the shot', () => {
    const store = atStart();
    store.lookAt('F4');
    onStation(store);
    expect(store.get().satellite.state).toBe('onStation');
    expect(store.get().imagery.F4).toBeUndefined();
  });
});

// The satellite's name comes from the mission's config (ILI-1401).
describe("the satellite's name", () => {
  it('is the mission config field, and everything the sim says uses it', async () => {
    const { MISSION } = await import('./state');
    const { satelliteStatus, satName } = await import('./satellite');
    const { trafficPrompts } = await import('./prompts');
    expect(initialState().mission.satellite).toBe(MISSION.satellite);
    const s0 = initialState();
    const atlas = { ...s0, mission: { ...s0.mission, satellite: 'ATLAS-1' } };
    expect(satName(atlas)).toBe('ATLAS-1');
    expect(satelliteStatus(atlas)).toMatch(/^ATLAS-1 over /);
    const store = createStore(atlas);
    store.lookAt('E3');
    expect(store.get().comms.messages.at(-1)).toMatchObject({ from: 'ATLAS-1', text: expect.stringMatching(/^Slewing to E3/) });
    const traffic = trafficPrompts(untilTraffic(atlas)).find((p) => p.kind === 'enemy-traffic');
    expect(traffic?.responses[0].label).toMatch(/^Send ATLAS-1 to /);
    expect(JSON.stringify(store.get()).includes('ORION-3')).toBe(false);
  });
});

// Video is real time (ILI-1423): its square stays live while ORION-3 stays over it.
describe('video stays live', () => {
  it('keeps refreshing for good, wherever ORION-3 goes (ILI-1432)', () => {
    const store = atStart();
    look(store, 'G4', 'video');
    for (let i = 0; i < 200 && store.get().satellite.state === 'capturing'; i++) store.tick(100);
    store.lookAt('F4');
    for (let i = 0; i < (GHOST_MS + 5_000) / 100; i++) store.tick(100); // long past any look's life
    const s = store.get();
    expect(s.imagery.G4?.live).toBe(true);
    expect(freshness(s.imagery.G4!, s.elapsedMs)).toBe('live');
  });
});
