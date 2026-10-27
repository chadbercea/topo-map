import { describe, expect, it } from 'vitest';
import { initialState, standby } from './state';
import { streamSystem, streamView } from './stream';

describe('intel stream (ILI-1186)', () => {
  it('is already flowing when the player sits down, and keeps coming on theater time', () => {
    const s = standby();
    expect(s.stream.items.length).toBeGreaterThan(5);
    const later = streamSystem({ ...s, theaterMs: 60_000 });
    expect(later.stream.items.length).toBeGreaterThan(s.stream.items.length + 5);
  });

  it('carries other operations, and some BLACK BOX before the team is found', () => {
    const tags = new Set(streamSystem({ ...standby(), theaterMs: 120_000 }).stream.items.flatMap((i) => i.tags));
    expect(tags.has('BLACK BOX')).toBe(true);
    expect(tags.size).toBeGreaterThan(3);
  });

  it('filters by code name, and the linked mission reports under it', () => {
    let s = initialState(); // linked
    s = { ...s, events: [{ id: 'traffic-c2', kind: 'signal', square: 'C2', title: 'Enemy radio traffic', atMs: 1_000, status: 'new' }] };
    s = { ...s, stream: { ...s.stream, filter: 'black box' } };
    const view = streamView(s);
    expect(view.length).toBeGreaterThan(0);
    expect(view.every((i) => i.tags.includes('BLACK BOX'))).toBe(true);
    expect(view.some((i) => i.square === 'C2' && i.source === 'SIGINT')).toBe(true);
  });

  it('shows nothing of the mission until the team is linked', () => {
    const s = { ...standby(), events: [{ id: 'x', kind: 'contact' as const, square: 'E3', title: 'Contact', atMs: 0, status: 'new' as const }] };
    expect(streamView(s).some((i) => i.square === 'E3')).toBe(false);
  });
});
