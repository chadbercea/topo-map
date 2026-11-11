import { describe, expect, it } from 'vitest';
import { activePrompt, byUrgency, PRIORITY, promptQueue, trafficPrompts, type Prompt } from './prompts';
import { initialState, type GameState } from './state';
import { createStore } from './store';
import { run } from './testkit';

// Tier two (ILI-1391): every call to action through one queue, one on screen at a time.
const blindAhead = (): GameState => {
  const s = initialState();
  return { ...s, team: { ...s.team, decisions: Object.fromEntries(s.team.route.map((sq) => [sq, 'blind' as const])) } };
};

describe('the prompt queue', () => {
  it('nothing to answer, nothing on screen', () => {
    expect(activePrompt(initialState())).toBeNull();
  });

  it('ALPHA needing intel is a prompt: a square, one line, one to three responses', () => {
    const p = activePrompt(run(blindAhead(), 3_000))!;
    expect(p).toMatchObject({ kind: 'intel-needed', priority: PRIORITY.teamRequest, square: 'G5', grid: 'F4' }); // on ALPHA's marker (ILI-1395)
    expect(p.text).toBe('ALPHA holding, needs route intel to D3');
    expect(p.responses.length).toBeGreaterThanOrEqual(1);
    expect(p.responses.length).toBeLessThanOrEqual(3);
  });

  it('Scan grids does it: ORION-3 goes to the grid square and scans it on arrival; the prompt shows progress, then goes (ILI-1414)', () => {
    const store = createStore(run(blindAhead(), 3_000));
    const p = activePrompt(store.get())!;
    expect(p.responses).toEqual([{ id: 'grids', label: 'Scan grids' }]);
    store.answerPrompt(p.id, 'grids');
    expect(store.get().map.selected).toBe('F4');
    expect(store.get().satellite.aim).toBe('F4'); // on its way, no more clicks
    expect(activePrompt(store.get())?.responses[0]).toMatchObject({ label: 'ORION-3 moving to F4…', disabled: true });
    for (let i = 0; i < 400 && !store.get().imagery.F4; i++) store.tick(100);
    expect(store.get().imagery.F4).toBeDefined(); // scanned the moment it locked on
    store.tick(100);
    expect(promptQueue(store.get()).some((x) => x.id === p.id)).toBe(false);
  });

  it('orders by priority, then the one that has waited longest', () => {
    const p = (id: string, priority: number, atMs: number): Prompt => ({ id, kind: 'intel-needed', priority, atMs, square: 'F4', text: id, responses: [] });
    const q = [p('intel', PRIORITY.intelReady, 0), p('ask-new', PRIORITY.teamRequest, 900), p('hurt', PRIORITY.operatorHurt, 1000), p('ask-old', PRIORITY.teamRequest, 100)].sort(byUrgency);
    expect(q.map((x) => x.id)).toEqual(['hurt', 'ask-old', 'ask-new', 'intel']);
  });
});

// An operator in trouble (ILI-1396): first in the queue, seen to once.
describe('operator prompts', () => {
  it('red health is the most urgent prompt; low ammo too; once seen to, it stays down', async () => {
    const { createStore } = await import('./store');
    const { initialState } = await import('./state');
    const s0 = initialState();
    const hurt = { ...s0, team: { ...s0.team, operators: s0.team.operators.map((o, i) => (i === 1 ? { ...o, health: 10 } : i === 2 ? { ...o, ammo: 0 } : o)) } };
    const q = promptQueue(hurt);
    expect(q[0]).toMatchObject({ kind: 'operator', text: `${hurt.team.operators[1].role} hit, medic needs time`, operator: hurt.team.operators[1].id, responses: [{ id: 'team', label: 'Open team' }] });
    expect(q.some((p) => p.kind === 'operator' && p.text === `${hurt.team.operators[2].role} low on ammo`)).toBe(true);
    const store = createStore(hurt);
    store.answerPrompt(q[0].id, 'team');
    expect(promptQueue(store.get()).some((p) => p.id === q[0].id)).toBe(false);
  });
});

// Enemy traffic has its own lane (ILI-1452): nothing knocks it off mid-read; it stays until HQ
// acts on it or dismisses it, and dismissing it leaves the traffic on the map.
describe('the enemy-traffic card', () => {
  const atTraffic = () => run(initialState(), 83_000);

  it('is not in the one-prompt slot, so a more urgent prompt does not replace it', () => {
    const s = atTraffic();
    const hurt = { ...s, team: { ...s.team, operators: s.team.operators.map((o, i) => (i === 1 ? { ...o, health: 10 } : o)) } };
    expect(activePrompt(hurt)?.kind).toBe('operator');
    expect(promptQueue(hurt).some((p) => p.kind === 'enemy-traffic')).toBe(false);
    expect(trafficPrompts(hurt)).toEqual([expect.objectContaining({ kind: 'enemy-traffic', square: 'C2' })]);
  });

  it('acted on, it shows the progress and stays until the intercept starts', () => {
    const store = createStore(atTraffic());
    store.answerPrompt('traffic-c2', 'satellite');
    expect(trafficPrompts(store.get())[0].responses[0]).toMatchObject({ label: expect.stringMatching(/ORION-3 on its way/), disabled: true });
    for (let i = 0; i < 300 && !store.get().minigame; i++) store.tick(100);
    expect(trafficPrompts(store.get())).toEqual([]);
  });

  it('dismissed, the card goes but the traffic stays on the map, unresolved', () => {
    const store = createStore(atTraffic());
    store.dismissTraffic('traffic-c2');
    expect(trafficPrompts(store.get())).toEqual([]);
    expect(store.get().events.find((e) => e.id === 'traffic-c2')).toMatchObject({ kind: 'signal', square: 'C2', status: expect.not.stringMatching('resolved') });
  });
});
