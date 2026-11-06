import { describe, expect, it } from 'vitest';
import { promptQueue } from './prompts';
import { initialState } from './state';
import { createStore } from './store';
import { run } from './testkit';
import { ANTENNA_MS } from './signal';

// Mini games start from map tradeoffs, not buttons (ILI-1394): enemy traffic comes up near C2;
// to listen, HQ gets an asset in range, each way with its cost on the button.
const atTraffic = () => createStore(run(initialState(), 83_000));
const traffic = (s: ReturnType<ReturnType<typeof atTraffic>['get']>) => promptQueue(s).find((p) => p.kind === 'enemy-traffic')!;

describe('getting in range of enemy traffic (ILI-1394)', () => {
  it('is a prompt at the traffic with two ways in, each saying what it costs', () => {
    const p = traffic(atTraffic().get());
    expect(p.square).toBe('C2');
    expect(p.responses.map((r) => r.id)).toEqual(['satellite', 'antenna']);
    expect(p.responses[0].label).toMatch(/^ORION-3 · \d:\d\d there, off ALPHA’s route$/);
    expect(p.responses[1].label).toBe('ALPHA sets up antenna · holds 0:30');
  });

  it('there is no button that starts the intercept', () => {
    expect('intercept' in atTraffic()).toBe(false);
  });

  it('ORION-3: it moves there, the intercept starts on arrival, and it is tied up while it listens', () => {
    const store = atTraffic();
    store.answerPrompt('traffic-c2', 'satellite');
    expect(store.get().satellite).toMatchObject({ state: 'slewing', aim: 'C2' });
    expect(store.get().minigame).toBeNull();
    expect(traffic(store.get()).responses).toEqual([expect.objectContaining({ disabled: true, label: expect.stringMatching(/ORION-3 on its way/) })]);
    for (let i = 0; i < 300 && !store.get().minigame; i++) store.tick(100);
    expect(store.get().minigame).toMatchObject({ kind: 'signal', square: 'C2', via: 'satellite', status: 'active' });
    store.moveSatellite('F4');
    expect(store.get().satellite.aim).toBe('C2'); // busy listening: off scanning for ALPHA
  });

  it('the antenna: ALPHA holds for the setup, burning clock, then the intercept starts', () => {
    const store = atTraffic();
    const at = store.get().elapsedMs;
    store.answerPrompt('traffic-c2', 'antenna');
    expect(store.get().team.activity).toBe('Setting up the antenna for C2');
    expect(store.get().team.holdUntilMs).toBeGreaterThanOrEqual(at + ANTENNA_MS);
    store.tick(ANTENNA_MS - 1_000);
    expect(store.get().minigame).toBeNull();
    store.tick(1_100);
    expect(store.get().minigame).toMatchObject({ kind: 'signal', via: 'antenna' });
    expect(store.get().satellite.aim).not.toBe('C2'); // ORION-3 stayed on ALPHA's route
  });

  it('sending ORION-3 elsewhere before it gets there drops the listen', () => {
    const store = atTraffic();
    store.answerPrompt('traffic-c2', 'satellite');
    store.cancelLook();
    store.moveSatellite('F4');
    store.tick(100);
    expect(store.get().listen).toBeNull();
  });
});
