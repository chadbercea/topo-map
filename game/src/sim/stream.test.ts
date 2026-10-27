import { describe, expect, it } from 'vitest';
import { initialState } from './state';
import { streamView } from './stream';

describe('intel stream (ILI-1194: the mission only)', () => {
  it('opens on the analysts\u2019 notes on the crash, and nothing from other operations', () => {
    const view = streamView(initialState());
    expect(view.length).toBe(3);
    expect(view.every((i) => i.atMs < 0)).toBe(true);
    expect(view.map((i) => i.text).join(' ')).toContain('downed recon drone');
  });

  it('takes in HQ and ORION-3 reports and map events as they come, newest first', () => {
    let s = initialState();
    s = { ...s, events: [{ id: 'traffic-c2', kind: 'signal', square: 'C2', title: 'Enemy radio traffic', atMs: 1_000, status: 'new' }] };
    const view = streamView(s);
    expect(view[0]).toMatchObject({ square: 'C2', source: 'SIGINT' });
  });
});
