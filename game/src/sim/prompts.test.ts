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
    expect(p).toMatchObject({ kind: 'intel-needed', priority: PRIORITY.teamRequest, square: 'F4' });
    expect(p.text).toBe('ALPHA is holding: it needs intel on F4 to move');
    expect(p.responses.length).toBeGreaterThanOrEqual(1);
    expect(p.responses.length).toBeLessThanOrEqual(3);
  });

  it('answering it moves ORION-3 there, then scans the square, and once handled it is gone (ILI-1397)', () => {
    const store = createStore(run(blindAhead(), 3_000));
    const p = activePrompt(store.get())!;
    expect(p.responses).toEqual([{ id: 'move', label: expect.stringMatching(/^Move ORION-3 here · \d+:\d\d$/) }]);
    store.answerPrompt(p.id, 'move');
    expect(store.get().satellite).toMatchObject({ state: 'slewing', aim: 'F4' });
    expect(activePrompt(store.get())!.responses[0]).toMatchObject({ disabled: true, label: expect.stringMatching(/on its way/) });
    for (let i = 0; i < 400 && store.get().satellite.state === 'slewing'; i++) store.tick(100);
    expect(activePrompt(store.get())!.responses).toEqual([{ id: 'scan', label: 'Scan F4' }]);
    store.answerPrompt(p.id, 'scan');
    store.tick(100);
    expect(promptQueue(store.get()).some((x) => x.id === p.id)).toBe(false);
  });

  it('Scan does nothing until ORION-3 is locked on (ILI-1397)', () => {
    const store = createStore(run(blindAhead(), 3_000));
    const p = activePrompt(store.get())!;
    store.answerPrompt(p.id, 'scan');
    expect(store.get().satellite.state).toBe('idle');
    expect(store.get().satellite.aim).not.toBe('F4');
  });

  it('orders by priority, then the one that has waited longest', () => {
    const p = (id: string, priority: number, atMs: number): Prompt => ({ id, kind: 'intel-needed', priority, atMs, square: 'F4', text: id, responses: [] });
    const q = [p('intel', PRIORITY.intelReady, 0), p('ask-new', PRIORITY.teamRequest, 900), p('hurt', PRIORITY.operatorHurt, 1000), p('ask-old', PRIORITY.teamRequest, 100)].sort(byUrgency);
    expect(q.map((x) => x.id)).toEqual(['hurt', 'ask-old', 'ask-new', 'intel']);
  });
});
