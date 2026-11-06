import { describe, expect, it } from 'vitest';
import { activePrompt, byUrgency, PRIORITY, promptQueue, type Prompt } from './prompts';
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

  it('Scan grids opens the grid square; its menu moves ORION-3 there, Scan takes the photo, and the prompt is gone (ILI-1395, ILI-1397)', () => {
    const store = createStore(run(blindAhead(), 3_000));
    const p = activePrompt(store.get())!;
    expect(p.responses).toEqual([{ id: 'grids', label: 'Scan grids' }]);
    store.answerPrompt(p.id, 'grids');
    expect(store.get().map.selected).toBe('F4');
    expect(store.get().satellite.aim).not.toBe('F4'); // the move is its own step, in the square's menu
    store.scan('F4');
    expect(store.get().imagery.F4).toBeUndefined(); // not locked on yet
    store.moveSatellite('F4');
    for (let i = 0; i < 400 && store.get().satellite.state === 'slewing'; i++) store.tick(100);
    store.scan('F4');
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
