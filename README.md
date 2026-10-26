# topo-map

A topographic survey of Twin Falls, Idaho, drawn live from real elevation data, and the games built on it.

**Live:** https://chadbercea.github.io/topo-map/

## Pages

| Page | What it is |
|---|---|
| [**Survey map**](https://chadbercea.github.io/topo-map/) (`index.html`) | The portfolio piece. Contour lines of the Snake River canyon traced from elevation tiles. Drag across the map for an elevation profile; the panel also has a height slice and an imagery blend. The earlier animated HUD version is kept at the git tag `v1-hud`. |
| [**War Room**](https://chadbercea.github.io/topo-map/war-room.html) (`war-room.html`) | **The current game.** You're mission control for a team on the ground. See below. |
| [**Ground Truth**](https://chadbercea.github.io/topo-map/ground-truth.html) (`ground-truth.html`) | The earlier game: you're the intel officer, sorting a live feed of true and false reports and sending ALPHA what's real. Finished and still playable. |
| [**Headgate**](https://chadbercea.github.io/topo-map/headgate.html) (`headgate.html`) | A prototype of the dark map where the contour lines light up teal where you touch. The sweep light in both games comes from here. |

## War Room

Operation Dry Creek: team ALPHA crosses the south rim of the canyon to an enemy outpost in C2, and you're the voice in their ear with the eyes in the sky. One team and one fixed mission for now. It's a fictional exercise.

- **The grid.** A 1 km grid (A1–H5) is fixed to the real ground, and everything outside it is dimmed. After BEGIN, the map zooms in until the grid fills the screen.
- **ALPHA's route.** ALPHA calls its route, square by square: H3 → G3 → F3 → E3 → D2 → C2.
- **Scanning.** Tap up to three squares, then **SCAN** (or press Enter). Each square comes back clear or with a contact. The satellite needs 12 s to recharge, and you can line up the next scan while you wait.
- **Unscanned ground.** ALPHA stops before any square nobody has imaged and asks for imagery. Scan it, or tell them to **push through** blind. Leave them waiting and they push on their own after 20 s.
- **Contacts.** Tap a contact, or wait for ALPHA to hold short of one, and choose:
  - **Observe:** ALPHA watches it for detail, and gets a free look at the square next to it.
  - **Attack:** artillery. You get two fire missions for the whole approach.
  - **Avoid:** ALPHA sneaks around the square. The detour goes through the next square over, which may not be scanned.
- **Ambushes.** Walking into a contact nobody found is an ambush, and every hit wounds an operator. Three wounded and ALPHA pulls out. Reach C2 to complete the approach. The debrief says what happened with each contact.

**HUD:**
- **Radio** (top left): the latest transmission, shown big.
- **Tools** (below the radio): the tool for the task at hand. That's the satellite, an imagery request, a contact's options, or a task in progress.
- **Team** (top right): a tab per team, ALPHA's route, and a row per operator with a Resident Evil style heartbeat (FINE, CAUTION, DANGER, KIA).
- **Mission bar** (top center): the clock and the phases.

On a phone, the team panel goes on top and the tools and radio go at the bottom.

**Next:** mini games in the tools panel, one for each call:
- **Ordnance** for attack: hit the painted targets in order before they fade.
- **Glassing** for observe: tag figures in a scope view.
- **A sneak line** for avoid: draw a path through ground the enemy can't see, worked out from the real elevation.

After that come the mission phases past the approach (outpost, objective, exfil with a medevac LZ), and more teams as tabs.

## How it's built

- **No build step and no dependencies to install.** Each page is a single HTML file with its own CSS and JavaScript. d3 7.9.0 comes from cdnjs, and the font is JetBrains Mono from Google Fonts.
- **The terrain.** Elevation comes from the public [Terrarium tiles](https://registry.opendata.aws/terrain-tiles/) on AWS. Each page fetches the tiles around Twin Falls, decodes the heights, and traces contours with `d3.contours`. The river is a least-cost path through the elevation grid.
- **Movement.** The games route their teams with A* over the slope of the terrain, so routes keep off the canyon walls.
- **Shared code.** The games copy the terrain loading, camera and route planning from each other, and from `index.html`, rather than share a module. Comments at the top of each script say where the code came from.

**Run it locally.** The tiles are fetched cross-origin, so serve the folder rather than opening the file directly:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/war-room.html
```

**Testing.** Changes are checked by playing the pages in headless Chromium at desktop and phone sizes. For War Room, that means scripted runs (careful, idle and reckless) that must end CLEAN, FAILED and FAILED, and a check that no panel covers a square the mission uses.

## Deploys

GitHub Actions publishes the repo to GitHub Pages on every push to `main` (`.github/workflows/`).

## Work tracking

Every change starts from a Linear issue in the **Topo Map** project, gets a branch and PR named after the issue key, and merges to `main`. The games are tracked under the epic [ILI-1087](https://linear.app/iliketobuild/issue/ILI-1087). Ground Truth was ILI-1088 to ILI-1096, and War Room is ILI-1097 onward.
