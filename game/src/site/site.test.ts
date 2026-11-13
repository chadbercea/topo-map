import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BANNED } from './banned';
import { Site } from './Site';
import { DIVISIONS } from './content';
import head from '../../castle-house/index.html?raw';

// Castle House's site stays in its own world (ILI-1336, ILI-1480): the page as rendered, its
// title and its meta description never say game, test, fiction, play, or anything from one
// operation, and every way to apply begins selection at the secure terminal.
describe("Castle House's site", () => {
  const markup = renderToStaticMarkup(createElement(Site));
  const text = markup.replace(/<[^>]+>/g, ' ');
  const labels = [...markup.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]).join(' ');
  const title = head.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  const meta = head.match(/name="description" content="([^"]*)"/)?.[1] ?? '';

  it('never breaks the fourth wall', () => {
    expect(title).toMatch(/Castle House/);
    expect(meta).toMatch(/recruiting/);
    for (const banned of BANNED) for (const [where, s] of [['page', text], ['labels', labels], ['title', title], ['meta', meta]]) expect(s, `${where}: ${banned}`).not.toMatch(banned);
  });

  it('covers who, what, divisions, selection, pay and apply', () => {
    for (const id of ['about', 'capabilities', 'divisions', 'selection', 'compensation', 'apply']) expect(markup).toContain(`id="${id}"`);
    const roles = DIVISIONS.items.reduce((n, d) => n + d.roles.length, 0);
    expect(markup.match(/data-testid="posting"/g)).toHaveLength(roles);
  });

  it('every apply link begins selection at the terminal', () => {
    const applies = [...markup.matchAll(/<a[^>]*data-testid="apply"[^>]*>/g)].map((m) => m[0]);
    expect(applies.length).toBeGreaterThanOrEqual(3);
    for (const a of applies) expect(a).toContain('href="../"');
    expect(markup).toMatch(/data-testid="apply"[^>]*>Begin selection</);
  });
});
