# Case study assets (ILI-1576)

Stills for the War Room portfolio case study (epic ILI-1572, design doc on ILI-1575).
All JPEG, 2880×1800 (1440×900 at 2×), captured from the production build by
`game/scripts/case-study-capture.mjs` (how to run it is at the top of that file).

- `pivot/`: the four prototypes the idea went through: survey map, Headgate, Ground Truth, War Room prototype
- `game/`: the way in (title → ORION-3 → tasking → login → power-on), then play: Analyze, a contact and its strike options, a strike, radio traffic, the intercept mini game, a blind contact, the wrap-up
- `design/`: the design system at /game/design/, one still per section
- `pages/`: project overview, Castle House, review hub, wireframe page (each also full-page)
- `icons/`: every Three.js model from the design system's 3D wireframes section, in each of its states (PNG), plus the title's rook and globe
- `video/hero.webm`: about a minute and a half at 1440×900: title, ORION-3, tasking, login, power-on, then Analyze F4 and E3, the square card and a heli strike
- `diagram/system.svg` (and `.png`): how it was built: Chad, Claude Code, subagents in worktrees, the MCP tools, and the issue → PR → CI → auto-merge → deploy → playtest loop. Numbers from ILI-1578. Figma, Context7 and Sentry are left off: no evidence they were used.
