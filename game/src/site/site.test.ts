import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BANNED } from './banned';
import { Site } from './Site';
import { ABOUT, CAPABILITIES, DIVISIONS, OPEN } from './content';
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

  // A brochure (ILI-1526): mostly pictures. Every section is carried by a framed model, and the
  // words stay short: a headline and a line or two each.
  it('is mostly pictures, with a headline and a line per section', () => {
    expect(markup.match(/data-testid="stage"/g)!.length).toBeGreaterThanOrEqual(12);
    for (const id of ['about', 'capabilities', 'divisions', 'selection', 'compensation', 'apply']) {
      const section = markup.slice(markup.indexOf(`id="${id}"`));
      expect(section.slice(0, section.indexOf('</section>')), id).toContain('data-testid="stage"');
    }
    const words = text.split(/\s+/).filter(Boolean).length;
    expect(words).toBeLessThan(450);
    for (const c of CAPABILITIES.items) expect(c.text.length, c.code).toBeLessThanOrEqual(90);
    expect(ABOUT.lede.length).toBeLessThanOrEqual(110);
  });

  // It opens on the house's own pieces, not its terminal (ILI-1531): the rook and the globe with
  // its satellites, framed in the page, the recruiting line as the heading, and a pointer down to
  // Apply. No menu, nothing fixed behind the page.
  it('opens on the rook and the globe under the recruiting line, pointing down to Apply', () => {
    expect(markup).not.toContain('intro-hero');
    const open = markup.slice(markup.indexOf('data-testid="opener"'));
    const opener = open.slice(0, open.indexOf('</section>'));
    expect(opener.match(/data-testid="stage"/g)).toHaveLength(2);
    expect(opener).toMatch(/<h1[^>]*>Hold the line/);
    expect(opener).toContain('href="#apply"');
    expect(opener).not.toContain('data-testid="apply"');
    expect(OPEN.rook.scene).toBe('rook');
    expect(OPEN.globe.scene).toBe('constellation');
  });

  it('every apply link begins selection at the terminal', () => {
    const applies = [...markup.matchAll(/<a[^>]*data-testid="apply"[^>]*>/g)].map((m) => m[0]);
    expect(applies.length).toBeGreaterThanOrEqual(2); // the bar's Apply and Apply's Begin selection
    for (const a of applies) expect(a).toContain('href="../"');
    expect(markup).toMatch(/data-testid="apply"[^>]*>Begin selection</);
  });
});
