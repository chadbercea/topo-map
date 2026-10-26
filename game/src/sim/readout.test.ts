import { describe, expect, it } from 'vitest';
import { initialState, type GameState } from './state';
import { ACTIVE_MS, step, teamMode } from './systems';
import { condition, roster } from './team';

const run = (s: GameState, ms: number) => {
  for (let t = 0; t < ms; t += 100) s = step(s, 100);
  return s;
};
const wound = (s: GameState, id: string, health: number): GameState => ({
  ...s,
  team: { ...s.team, operators: s.team.operators.map((o) => (o.id === id ? { ...o, health } : o)) },
});

describe('team readout mode', () => {
  it('stays in Mode A while the team just walks', () => {
    expect(teamMode(run(initialState(), 10_000))).toBe('A');
  });

  it('switches to Mode B when health, ammo or meds change, and back after it settles', () => {
    let s = run(initialState(), 1_000);
    s = step(wound(s, 'gunner', 60), 100);
    expect(teamMode(s)).toBe('B');
    s = run(s, ACTIVE_MS - 200);
    expect(teamMode(s)).toBe('B');
    s = run(s, 300);
    expect(teamMode(s)).toBe('A');
  });

  it('healing counts as activity too', () => {
    let s = step(wound(run(initialState(), 1_000), 'gunner', 60), 100);
    s = run(s, ACTIVE_MS + 100);
    s = step(wound(s, 'gunner', 80), 100);
    expect(teamMode(s)).toBe('B');
  });
});

describe('condition', () => {
  it('bands health into fine, caution, danger and down', () => {
    const o = roster()[0];
    expect(condition({ ...o, health: 100 })).toBe('fine');
    expect(condition({ ...o, health: 50 })).toBe('caution');
    expect(condition({ ...o, health: 20 })).toBe('danger');
    expect(condition({ ...o, health: 0 })).toBe('down');
  });
});
