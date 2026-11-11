import { describe, expect, it } from 'vitest';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { feed, LOW_AT } from './intel';
import { isImageryRequest, openImageryRequest } from './imageryRequest';
import { openCards } from './cards';
import { activePrompt } from './prompts';
import { answerIntel, fed, run } from './testkit';

// The never-stuck rule (ILI-1349): low or out of intel, ALPHA asks HQ for imagery of the next
// square on its route nobody has scanned. One at a time; a look at the square answers it.

const blindAhead = (): GameState => {
  const s = initialState();
  return { ...s, team: { ...s.team, decisions: Object.fromEntries(s.team.route.map((sq) => [sq, 'blind' as const])) } };
};
const requests = (s: GameState) => s.events.filter(isImageryRequest);

describe('the never-stuck rule', () => {
  it('out of intel, ALPHA requests imagery of the next square it needs: one card, and it waits', () => {
    const s = run(blindAhead(), 3_000);
    expect(s.team.activity).toBe('Holding · needs intel');
    expect(openImageryRequest(s)).toMatchObject({ square: 'F4', title: 'ALPHA requests imagery' });
    expect(requests(run(s, 60_000))).toHaveLength(1); // one at a time, and it never expires
    expect(activePrompt(s)).toMatchObject({ kind: 'intel-needed', grid: 'F4' }); // a prompt on the map (ILI-1391)
    expect(openCards(s).some((c) => c.kind === 'request')).toBe(false); // not a card in COMMS any more
  });

  it('running low on the move, the request goes up before ALPHA stops', () => {
    const s = run(feed(blindAhead(), LOW_AT - 1), 500);
    expect(s.team.activity).toMatch(/^Moving/);
    expect(openImageryRequest(s)).toBeTruthy();
  });

  it('a fed team asks for nothing', () => {
    expect(requests(run(fed(blindAhead()), 30_000))).toHaveLength(0);
  });

  it('a scan of the square, sent with Photo, answers it; still short, ALPHA asks for the next one (ILI-1451)', () => {
    const store = createStore(run(blindAhead(), 1_000));
    expect(openImageryRequest(store.get())?.square).toBe('F4');
    store.lookAt('F4');
    store.set(run(store.get(), 30_000));
    store.capture('photo');
    store.set(run(store.get(), 1_000));
    expect(openImageryRequest(store.get())?.square).toBe('F4'); // scanned, the intel held: not answered till it's sent
    store.photo('F4');
    store.set(run(store.get(), 15_000));
    const [first, ...rest] = requests(store.get());
    expect(first.status).toBe('resolved');
    expect(rest.every((r) => r.square !== 'F4')).toBe(true);
  });

  it('ALPHA’s own eyes on the square don’t answer it: HQ has to look', () => {
    const s = run(blindAhead(), 1_000);
    const req = openImageryRequest(s)!;
    const eyes = { ...s, imagery: { ...s.imagery, [req.square]: { square: req.square, atMs: s.elapsedMs, mode: 'eyes' as const, seen: [], live: false } } };
    expect(openImageryRequest(run(eyes, 100))?.id).toBe(req.id);
  });

  it('answering only ALPHA’s imagery requests gets it to the crash site’s leg', () => {
    const store = createStore(blindAhead());
    const crash = store.get().team.route.indexOf('D3');
    for (let t = 0; t < 600_000 && store.get().team.waypoint < crash; t += 100) {
      store.tick(100);
      const s = store.get();
      const p = activePrompt(s); // answer the prompt on the map: move ORION-3 there, then Scan (ILI-1391, ILI-1397)
      answerIntel(store, p); // click the square, wait for the lock, Scan, Photo (ILI-1451)
    }
    expect(store.get().team.waypoint).toBeGreaterThanOrEqual(crash);
  });
});
