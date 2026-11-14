import { describe, expect, it } from 'vitest';
import { activePrompt, byUrgency, PRIORITY, promptQueue, trafficPrompts, type Prompt } from './prompts';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { run, trafficId, untilTraffic } from './testkit';

// Tier two (ILI-1391): every call to action through one queue, one on screen at a time.
const blindAhead = (): GameState => {
  const s = initialState();
  return { ...s, team: { ...s.team, decisions: Object.fromEntries(s.team.route.map((sq) => [sq, 'blind' as const])) } };
};

describe('the prompt queue', () => {
  it('nothing to answer, nothing on screen', () => {
    expect(activePrompt(initialState())).toBeNull();
  });

  it('ALPHA needing intel is a prompt pinned on the grid square it needs, with no button (ILI-1450)', () => {
    const p = activePrompt(run(blindAhead(), 3_000))!;
    expect(p).toMatchObject({ kind: 'intel-needed', priority: PRIORITY.teamRequest, square: 'F4', grid: 'F4', step: 'click', hint: 'ALPHA requested imagery of F4 · click it' });
    expect(p.text).toBe('ALPHA requested imagery of F4');
    expect(p.responses).toEqual([]);
  });

  it('the player does every step; the prompt says the next one, and nothing happens on its own (ILI-1451)', () => {
    const store = createStore(run(blindAhead(), 3_000));
    const p = () => activePrompt(store.get())!;
    const aim = store.get().satellite.aim;
    for (let i = 0; i < 300; i++) store.tick(100);
    expect(store.get().satellite.aim).toBe(aim); // left alone, ORION-3 stays put
    expect(p()).toMatchObject({ step: 'click', hint: 'ALPHA requested imagery of F4 · click it' });
    // Click F4 on the map: picked, and ORION-3 goes.
    store.selectSquare('F4');
    store.lookAt('F4');
    expect(p()).toMatchObject({ step: 'moving', hint: 'ORION-3 moving to F4…' });
    for (let i = 0; i < 400 && store.get().satellite.state === 'slewing'; i++) store.tick(100);
    expect(p()).toMatchObject({ step: 'analyze', hint: 'Analyze F4 in ORION-3' });
    for (let i = 0; i < 100; i++) store.tick(100);
    expect(store.get().imagery.F4).toBeUndefined(); // locked on, nothing analyzed for the player
    const id = p().id;
    store.scan('F4');
    store.tick(100);
    // Posted on the shelf (ILI-1499): HQ's part is done, there's no send step; ALPHA pulls it.
    expect(promptQueue(store.get()).some((x) => x.id === id)).toBe(false);
  });

  it('orders by priority, then the one that has waited longest', () => {
    const p = (id: string, priority: number, atMs: number): Prompt => ({ id, kind: 'intel-needed', priority, atMs, square: 'F4', text: id, responses: [] });
    const q = [p('intel', PRIORITY.intelReady, 0), p('ask-new', PRIORITY.teamRequest, 900), p('hurt', PRIORITY.operatorHurt, 1000), p('ask-old', PRIORITY.teamRequest, 100)].sort(byUrgency);
    expect(q.map((x) => x.id)).toEqual(['hurt', 'ask-old', 'ask-new', 'intel']);
  });
});

// An operator in trouble (ILI-1396): first in the queue, seen to once.
describe('no operator prompts (ILI-1535)', () => {
  it('an operator hit or low on ammo puts up no prompt and no Open team button', () => {
    const s0 = initialState();
    const hurt = { ...s0, team: { ...s0.team, operators: s0.team.operators.map((o, i) => (i === 1 ? { ...o, health: 10 } : i === 2 ? { ...o, ammo: 0 } : o)) } };
    expect(promptQueue(hurt).some((p) => (p.kind as string) === 'operator')).toBe(false);
  });
});

// Enemy traffic has its own lane (ILI-1452): nothing knocks it off mid-read. It's a line of its
// square's intel list since ILI-1491, with no card to dismiss: it stays until HQ acts on it.
describe('enemy traffic', () => {
  const atTraffic = () => untilTraffic(initialState());

  it('is not in the one-prompt slot, so a more urgent prompt does not replace it', () => {
    const s = atTraffic();
    const hurt = { ...s, team: { ...s.team, operators: s.team.operators.map((o, i) => (i === 1 ? { ...o, health: 10 } : o)) } };
    expect((activePrompt(hurt)?.kind as string) === 'operator').toBe(false);
    expect(promptQueue(hurt).some((p) => p.kind === 'enemy-traffic')).toBe(false);
    expect(trafficPrompts(hurt)).toEqual([expect.objectContaining({ kind: 'enemy-traffic', square: 'C2' })]);
  });

  it('acted on, it shows the progress and stays until the intercept starts', () => {
    const store = createStore(atTraffic());
    store.answerPrompt(trafficId(store.get()), 'satellite');
    expect(trafficPrompts(store.get())[0].responses[0]).toMatchObject({ label: expect.stringMatching(/ORION-3 on its way/), disabled: true });
    for (let i = 0; i < 300 && !store.get().minigame; i++) store.tick(100);
    expect(trafficPrompts(store.get())).toEqual([]);
  });

});
