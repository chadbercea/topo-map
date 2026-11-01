import { describe, expect, it } from 'vitest';
import { blockers } from './progress';
import { initialState } from './state';
import { run, walking } from './testkit';

// Teaching through play (ILI-1318): someone in the fiction says what they need, and the line
// under the mission points at where to do it.
describe('teaching through play', () => {
  it('the first time ALPHA stalls for intel it says what it needs, once a mission', () => {
    const s = run(initialState(), 3_000);
    const lines = s.comms.messages.filter((m) => m.id === 'needs-intel');
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("Holding. No intel on what's ahead. Get us eyes on F4.");
    expect(run(s, 10_000).comms.messages.filter((m) => m.id === 'needs-intel')).toHaveLength(1);
  });

  it('stalled, the need line says to scan ahead, and points at the square', () => {
    const s = run(initialState(), 1_000);
    expect(blockers(s)[0]).toEqual({ tone: 'decision', text: 'ALPHA needs intel: scan ahead at F4', go: { square: 'F4' } });
  });

  it('holding short for HQ to soften a contact, the need line points at it', () => {
    const s0 = walking();
    const s = { ...s0, team: { ...s0.team, waitFor: { square: 'E3', untilMs: 20_000 } } };
    expect(blockers(s)[0]).toEqual({ tone: 'decision', text: 'ALPHA holding short of E3: soften them up', go: { square: 'E3' } });
  });
});
