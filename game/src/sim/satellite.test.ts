import { describe, expect, it } from 'vitest';
import { moveContact } from './contacts';
import { FRESH_MS, GHOST_MS, freshness } from './imagery';
import { PATROL_MOVES_MS, PATROL_WALK_MS } from './missions/blackBox';
import { SETTLE_MS, SLEW_MS_PER_SQUARE, slewMs } from './satellite';
import { blockers } from './progress';
import { initialState, type GameState } from './state';
import { createStore, type Store } from './store';
import { answer, run, walking } from './testkit';

// At the start ALPHA holds short of F4, which nobody has imaged. ORION-3 is over G5.
const atRequest = () => createStore(run(initialState(), 500));
const REQUEST = 'unimaged-F4-1';

// Wait for ORION-3 to get on station (run, not store.tick, so nothing else needs answering).
const onStation = (store: Store) => {
  for (let i = 0; i < 200 && store.get().satellite.state === 'slewing'; i++) store.tick(100);
  expect(store.get().satellite.state).toBe('onStation');
};

const look = (store: Store, square: string, mode: 'photo' | 'video' = 'photo') => {
  store.lookAt(square);
  onStation(store);
  store.capture(mode);
};

describe('ORION-3 tasking', () => {
  it('on station for ALPHA\u2019s look, ORION-3 says it\u2019s ready and taking the shot is what needs HQ (ILI-1257)', () => {
    const store = atRequest();
    answer(store, REQUEST, 'send');
    onStation(store);
    expect(store.get().comms.messages.at(-1)).toMatchObject({ from: 'ORION-3', text: 'On station over F4. Ready for collection.' });
    expect(blockers(store.get())[0]).toEqual({ tone: 'decision', text: 'ORION-3 on station over F4: take the shot', go: { square: 'F4' } });
    store.capture('photo');
    expect(blockers(store.get()).map((b) => b.text)).not.toContain('ORION-3 on station over F4: take the shot');
  });

  it('looking at F4 from the map answers ALPHA\'s call about F4; another square leaves it waiting', () => {
    const elsewhere = atRequest();
    elsewhere.lookAt('E3');
    expect(elsewhere.get().satellite.callId).toBeNull();
    expect(elsewhere.get().comms.messages.find((m) => m.id === REQUEST)?.status).toBe('new');
    const store = atRequest();
    store.lookAt('F4');
    expect(store.get().satellite).toMatchObject({ aim: 'F4', callId: REQUEST });
    expect(store.get().comms.messages.find((m) => m.id === REQUEST)).toMatchObject({ status: 'read', answer: 'send' });
  });

  it('Look at it tasks ORION-3 to F4; ALPHA waits on it and does not time out', () => {
    const store = atRequest();
    answer(store, REQUEST, 'send');
    const s = store.get();
    expect(s.satellite).toMatchObject({ state: 'slewing', aim: 'F4', callId: REQUEST });
    // G5 to F4 is one square diagonally.
    expect(s.satellite.arriveMs - s.elapsedMs).toBe(Math.round((SETTLE_MS + Math.SQRT2 * SLEW_MS_PER_SQUARE) / 100) * 100);
    expect(s.team).toMatchObject({ holdFor: REQUEST, activity: 'Waiting on the look' });
    onStation(store);
    store.set(run(store.get(), 30_000)); // HQ takes its time choosing: the call doesn't lapse
    expect(store.get().team.holdFor).toBe(REQUEST);
  });

  it('a photo images the square and releases ALPHA', () => {
    const store = atRequest();
    answer(store, REQUEST, 'send');
    onStation(store);
    store.capture('photo');
    const s = store.get();
    expect(s.map.scanned).toContain('F4');
    expect(s.team.holdFor).toBeNull();
    expect(s.satellite).toMatchObject({ state: 'idle', aim: 'F4', result: { square: 'F4', mode: 'photo', fighters: 0 } });
    expect(s.imagery.F4).toMatchObject({ mode: 'photo', live: false, seen: [] });
    expect(s.comms.messages.some((m) => m.from === 'ORION-3' && /F4 collection complete \(photo\): nothing there\. Analysts: [a-z -]+ pushed to ALPHA\./.test(m.text))).toBe(true);
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

  it('while it captures it is busy: no new task, and Look at it is greyed out', () => {
    const store = atRequest();
    look(store, 'G4', 'video');
    expect(store.get().satellite.state).toBe('capturing');
    store.lookAt('A1');
    expect(store.get().satellite.aim).toBe('G4');
    const send = store.get().comms.messages.find((m) => m.id === REQUEST)!.responses!.find((r) => r.id === 'send')!;
    answer(store, REQUEST, 'send');
    expect(store.get().comms.messages.find((m) => m.id === REQUEST)!.status).toBe('new');
    expect(send.label).toBe('Look at it');
  });

  it('cancel stops it where it is, and ALPHA moves on without imagery', () => {
    const store = atRequest();
    answer(store, REQUEST, 'send');
    store.tick(1_000);
    store.cancelLook();
    expect(store.get().satellite.state).toBe('idle');
    expect(store.get().team.holdFor).toBeNull();
    expect(store.get().comms.messages.at(-1)?.text).toBe('No imagery. Moving anyway.');
  });
});

describe('fog of war', () => {
  // The patrol is on its way from C2 to D3 for the last half minute before it gets there.
  const walkingPatrol = (): GameState => {
    let s: GameState = { ...walking(), contacts: initialState().contacts, elapsedMs: PATROL_MOVES_MS - PATROL_WALK_MS - 100 };
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

  it('video is live while it runs, then becomes an ordinary look', () => {
    const store = createStore(walkingPatrol());
    look(store, 'C2', 'video');
    store.set(run(store.get(), 2_000));
    expect(store.get().imagery.C2).toMatchObject({ mode: 'video', live: true });
    store.set(run(store.get(), 14_000));
    expect(store.get().imagery.C2.live).toBe(false);
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
