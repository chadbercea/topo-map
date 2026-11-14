import { describe, expect, it } from 'vitest';
import { exfilLocked } from './mission';
import { postBuilding } from './buildings';
import { sendResupply } from './support';
import { walking } from './testkit';
import type { GameState } from './state';

// Exfil locks out what no longer applies (ILI-1545): building intel and resupply. ORION-3 and
// strikes stay open.
const exfil = (s: GameState): GameState => ({ ...s, mission: { ...s.mission, phase: 'exfil', blackBox: true } });
const building = (s: GameState): GameState => ({ ...s, events: [...s.events, { id: 'building-E4', kind: 'building', square: 'E4', title: 'Building', atMs: 0, status: 'new' }] });

describe('exfil locks', () => {
  it('locks from exfil on, not before', () => {
    const s = walking();
    expect(exfilLocked(s)).toBe(false);
    expect(exfilLocked(exfil(s))).toBe(true);
  });

  it('no building intel once exfil is under way', () => {
    const s = building(walking());
    expect(postBuilding(s, 'E4').intel.pushes.length).toBe(s.intel.pushes.length + 1);
    const ex = exfil(s);
    expect(postBuilding(ex, 'E4')).toBe(ex);
  });

  it('no resupply bird once exfil is under way, and ALPHA does not ask for one', () => {
    const s = walking();
    expect(sendResupply(s).inbound).toHaveLength(1);
    expect(sendResupply(exfil(s)).inbound).toHaveLength(0);
  });
});
