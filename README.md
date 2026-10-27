# PMC War Room: a game in progress

This repo is **PMC War Room**, a game I'm developing with Claude, Anthropic's AI, in Claude Code. It's the reverse of a squad shooter. You don't control the soldiers. You're the war room of a private military company, supporting five contractors on the ground with imagery, intel, ordnance and support, while they carry out the mission themselves.

It's a work in progress: one team, one mission (Operation Black Box), all three mini games and the PMC mechanics. It's built to find out whether the game is fun before it grows.

**Play it:** https://topo-map-nu.vercel.app/game/ (desktop or phone, mouse or touch)

## How we're making it

I design and direct the game, and I play every build. Claude writes the code, tests it, and keeps the paper trail. A round goes like this:

1. **I play the live build** and say what's working and what isn't, usually in a sentence or two.
2. **Claude turns it into a Linear issue,** quoting what I said and adding acceptance criteria.
3. **Claude builds it on its own branch,** with unit tests for the game logic and browser tests that play it at desktop and phone sizes, and checks screenshots.
4. **Claude opens a PR** saying what changed and how it was checked. CI runs the typecheck, unit tests and browser tests, Vercel builds a preview, and the PR auto-merges once both pass. Production updates and I play it again.

The direction has changed a lot, and the repo keeps the history. I started with a survey map. That became a farming game, then an intel-officer game (Ground Truth), then a mission-control prototype (War Room). PMC War Room is that prototype grown into a full game, designed in a game design document and built ticket by ticket.

## Playing Operation Black Box

A drone went down in fictional hill country. Team ALPHA infiltrates at **A** (G5), recovers its black box at the crash site **B** (D3), and exfils at **C** (B1). The AO is 4 × 2.5 km in 500 m squares, and you have four hours of game time (six real minutes; the clock runs at 40×).

- **Sitting down.** There's no briefing. You're HQ's intel cell, and the game opens live in the war room with ALPHA already on the ground: the mission's intel stream down the left, the map, the comms log under the stream, and the team and ORION-3 panels in the bottom-right corner. The clock is running.
- **The header.** Your anchor: the mission and its phases, the win conditions (black box, everyone alive, exfil), the objective and the next thing to do, what's blocking you, the weather and the ground of the square you're looking at, and the contract window counting down with its closing time. ORION-3, the budget and noise sit by the map's tools.
- **The map.** Topographic contours over an 8×5 grid (A1–H5), with streams and rivers worked out from the elevation, a town you can switch on or off, and a Topo or Relief view. ALPHA walks its route on its own, the way a patrol would: along roads and stream banks, around the worst climbs, fording water only when it has to. Climbs slow it down.
- **Imagery.** ALPHA stops short of any square nobody has imaged and asks: scan it, or push through blind? *Send imagery* starts the **grid scan**: tap the ORION-3 satellite's squares in order before the pass ends. Scans are a shared pool that recharges. You can also select any square and scan it yourself.
- **Contacts.** Scans find contacts. One on the route makes ALPHA ask what to do:
  - **Observe** gives you intel, a look next door, and paints the target.
  - **Attack** goes in with surprise.
  - **Go around** detours, maybe over ground that needs imagery of its own.

  Walking into a contact nobody found is an ambush.
- **Seek and destroy.** Tap a found contact for its target menu: drone strike (one 2×2 blast), sniper (one round at a time, then a cooldown), and a helicopter that's locked until upgrades. The square becomes a Battleship board. Painted targets show every fighter. Kills pay cash and leave kill sites ALPHA can search.
- **Signal intercept.** Enemy radio traffic comes up mid-mission. **Intercept** it: tune the dial until the signal peaks, hold to lock on, then shift the cipher until it reads. The decode tells you the patrol is heading for the crash site. Or **Jam** it: the patrol slows down, but you never learn its plan.
- **The team.** The team panel shows every operator all the time: heartbeats in green, yellow and red, ammo and meds. When ALPHA needs a decision, a small window pops up beside its marker on the map with tiny text replies; the comms log under the intel stream keeps every exchange. Fights resolve on their own, and the medic patches people up afterwards. Send intel from the analysts' panel as buffs (faster, more accurate, harder to hit).
- **The PMC side.** The client offers a bonus for a side job against the clock. Noise from strikes alerts the enemy, and too much makes the client disown you (no contract, no air support). A local fixer can guide ALPHA in or stage a distraction. Running low? Send a resupply bird. Combat ineffective? Send reinforcements.
- **The exfil.** Once the black box is out, an enemy salvage convoy pulls onto the exfil at B1 with loot off the wreck, and ALPHA asks: **hit the convoy** for the haul ($8,000 if ALPHA takes it), or **move exfil** west to A2, the long way round (about 3.5 km all told).
- **The wrap-up.** A win needs the black box at exfil with nobody down. It shows what your intel achieved, what new intel you found, and the payout.

Pause with Esc, P or the ❚❚ button. `?minutes=8` changes the mission length in real minutes, for tuning.

## How it's built

`game/` is a Vite + TypeScript project: **Phaser 4** draws the map and the mini games, **React 19** draws the HUD panels, and the game itself is plain TypeScript.

- **`src/sim/`, the game.** One `GameState` object and a list of systems (timer, script, intel, scans, comms, contacts, fights, support, mission, movement…) that each turn a state into the next, at a fixed 10 ticks a second. It doesn't know about Phaser or React, so it's unit-tested directly and replays exactly (chance comes from a seed in the state).
- **`src/sim/missions/`, missions as data.** The route, clock, contacts, schedule, intel feed and triggers (one-time decision points such as the patrol moving on the crash site) for Operation Black Box.
- **`src/game/`, the map.** The Phaser scene: terrain and town baked into textures, the grid, markers, the team, and each mini game's map mode.
- **`src/hud/`, the panels.** The React war room: intel, mission timer, team readout with comms, alerts, target menu, mini game panel, pause menu and wrap-up.
- **`src/audio/`, the sound effects,** synthesized with WebAudio, so there are no sound files.

```sh
cd game
npm install
npm run dev      # http://localhost:5173/game/
npm test         # unit tests (Vitest)
npm run e2e      # browser tests, desktop and phone (Playwright)
npm run build    # typecheck and production build
```

**Checks and deploys.** `.github/workflows/game-ci.yml` runs the typecheck, unit tests and browser tests on every PR. `main` requires that check and Vercel's, and PRs auto-merge once both are green. Vercel's GitHub app deploys previews for PRs and production from `main`. The root `vercel.json` builds `game/` alongside the HTML prototypes.

## The prototypes

Each of these is a single HTML file with no build step, drawn from real elevation data for the Snake River canyon at Twin Falls, Idaho. They're kept as the history of how the game got here. GitHub Pages serves them, and so does Vercel at the same paths.

| Page | What it is |
|---|---|
| [**War Room**](https://chadbercea.github.io/topo-map/war-room.html) (`war-room.html`) | The prototype PMC War Room grew from: scan squares for ALPHA, then observe, attack or avoid each contact. |
| [**Survey map**](https://chadbercea.github.io/topo-map/) (`index.html`) | Where it started, and a portfolio piece in its own right: contour lines traced from elevation tiles, with an elevation profile, a height slice and an imagery blend. |
| [**Ground Truth**](https://chadbercea.github.io/topo-map/ground-truth.html) (`ground-truth.html`) | The intel-officer game: sort a live feed of true and false reports and send the team what's real. |
| [**Headgate**](https://chadbercea.github.io/topo-map/headgate.html) (`headgate.html`) | What's left of the farming game: contour lines that light up teal where you touch. |

To run them locally, serve the folder (the elevation tiles are fetched cross-origin): `python3 -m http.server 8000`, then open http://localhost:8000/war-room.html.

## Work tracking

Every change starts from a Linear issue, gets a branch and PR named after the issue key, and merges to `main`. PMC War Room is the **PMC War Room** project, built in five milestones: playable shell, war room systems, mini games, mission complete, support options. The prototypes are in the **Topo Map** project ([ILI-1162](https://linear.app/iliketobuild/issue/ILI-1162) War Room, [ILI-1087](https://linear.app/iliketobuild/issue/ILI-1087) Ground Truth).
