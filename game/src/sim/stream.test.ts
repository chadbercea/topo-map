import { describe, expect, it } from 'vitest';
import { initialState } from './state';
import { streamView } from './stream';
import type { Message } from './comms';

const msg = (id: string, from: string, text: string, extra: Partial<Message> = {}): Message => ({ id, from, text, atMs: 2_000, status: 'read', holds: false, ...extra });

describe('intel stream (ILI-1194, ILI-1197)', () => {
  it('opens on the analysts’ notes on the crash, all quiet, and nothing from other operations', () => {
    const view = streamView(initialState());
    expect(view.length).toBe(3);
    expect(view.every((i) => i.kind === 'note' && i.quiet)).toBe(true);
    expect(view.map((i) => i.text).join(' ')).toContain('downed recon drone');
  });

  it('stays quiet until the first event, then only routine items do', () => {
    const s0 = initialState();
    const chatter = { ...s0, comms: { ...s0.comms, messages: [msg('slew-1', 'ORION-3', 'Slewing to E3.'), msg('look-1', 'ORION-3', 'E3 collection complete.')] } };
    expect(streamView(chatter).every((i) => i.quiet)).toBe(true);
    const started = { ...chatter, events: [{ id: 'traffic-c2', kind: 'signal' as const, square: 'C2', title: 'Enemy radio traffic', atMs: 3_000, status: 'new' as const }] };
    const view = streamView(started);
    expect(view.find((i) => i.id === 'msg-slew-1')).toMatchObject({ kind: 'imagery', quiet: true });
    expect(view.find((i) => i.id === 'msg-look-1')).toMatchObject({ kind: 'imagery', quiet: false });
    expect(view[0]).toMatchObject({ kind: 'event', source: 'SIGNAL', square: 'C2', quiet: false, event: { id: 'traffic-c2', status: 'new' } });
  });

  it('sorts mini game output by kind: SIGINT decodes, strike reports, HQ alerts', () => {
    const s0 = initialState();
    const s = {
      ...s0,
      events: [{ id: 'x', kind: 'contact' as const, square: 'E3', title: 'Checkpoint', atMs: 0, status: 'resolved' as const }],
      comms: { ...s0.comms, messages: [msg('signal-1', 'SIGINT', 'Decoded.'), msg('seek-1', 'REAPER-1', '2 down.'), msg('a', 'HQ', 'They know.', { alert: true })] },
    };
    const kinds = Object.fromEntries(streamView(s).map((i) => [i.id, i.kind]));
    expect(kinds).toMatchObject({ 'msg-signal-1': 'sigint', 'msg-seek-1': 'strike', 'msg-a': 'alert', 'ev-x': 'event' });
    expect(streamView(s).find((i) => i.id === 'ev-x')?.quiet).toBe(true); // done
  });
});
