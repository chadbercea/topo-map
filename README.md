# War Room: a game demo

This repo is a playable demo of **War Room**, a game I'm developing with Claude, Anthropic's AI, in Claude Code. You're mission control in an operations center, guiding a special operations team across real terrain: the Snake River canyon at Twin Falls, Idaho, drawn live from public elevation data.

It's a work in progress. What's here is one team, one fixed mission and the core loop, built to find out whether the game is fun before it grows.

**Play it:** https://chadbercea.github.io/topo-map/war-room.html

## How we're making it

I design and direct the game, and I play every build. Claude writes the code, tests it, and keeps the paper trail. A round goes like this:

1. **I play the live build** and say what's working and what isn't, usually in a sentence or two. For example: *"the list is killing me"*, *"the team almost barrelled through space I had not scanned yet"*, or *"a health status like Resident Evil with a heart beat line"*.
2. **Claude turns it into a Linear issue,** quoting what I said, adding concrete acceptance criteria, and making the judgment calls I've delegated.
3. **Claude builds it on its own branch.** It plays the result with scripted bots in a headless browser, at desktop and phone sizes, and checks screenshots of the layout.
4. **Claude opens a PR** saying what changed and how it was checked. I say merge, it deploys to GitHub Pages, and I play it again.

The direction has changed a lot along the way, and the repo keeps the history. I started with a survey map. That became a farming game, then an intel-officer game (Ground Truth). Playing that one, I found I was staring at a list of cards and missing the story on the map. So I went back to the drawing board and asked Claude to help design a game about being mission control, which became War Room.

## War Room

Operation Dry Creek: team ALPHA crosses the south rim of the canyon to an enemy outpost in C2, and you're the voice in their ear, with the eyes in the sky. It's a fictional exercise.

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

**Where it goes next:** mini games in the tools panel, one for each call:
- **Ordnance** for attack: hit the painted targets in order before they fade.
- **Glassing** for observe: tag figures in a scope view.
- **A sneak line** for avoid: draw a path through ground the enemy can't see, worked out from the real elevation.

After that come the mission phases past the approach (outpost, objective, exfil with a medevac LZ), and more teams as tabs.

## Everything in the repo

| Page | What it is |
|---|---|
| [**War Room**](https://chadbercea.github.io/topo-map/war-room.html) (`war-room.html`) | **The demo.** The current game. |
| [**Survey map**](https://chadbercea.github.io/topo-map/) (`index.html`) | Where it started, and a portfolio piece in its own right. Contour lines of the canyon traced from elevation tiles. Drag across the map for an elevation profile; the panel also has a height slice and an imagery blend. The earlier animated HUD version is kept at the git tag `v1-hud`. |
| [**Ground Truth**](https://chadbercea.github.io/topo-map/ground-truth.html) (`ground-truth.html`) | The game before War Room. You're the intel officer, sorting a live feed of true and false reports and sending the team what's real. Finished and still playable. |
| [**Headgate**](https://chadbercea.github.io/topo-map/headgate.html) (`headgate.html`) | What's left of the farming game: the dark map, with contour lines that light up teal where you touch. Both games' sweep light comes from here. |

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

**Testing.** Every change is played in headless Chromium at desktop and phone sizes. For War Room, that means three scripted runs that must end the right way: careful CLEAN, idle FAILED and reckless FAILED. It also means a check that no panel covers a square the mission uses.

**Deploys.** GitHub Actions publishes the repo to GitHub Pages on every push to `main` (`.github/workflows/deploy.yml`).

## Work tracking

Every change starts from a Linear issue in the **Topo Map** project, gets a branch and PR named after the issue key, and merges to `main`.

| Epic | What it covers |
|---|---|
| [ILI-1162](https://linear.app/iliketobuild/issue/ILI-1162) | War Room, from ILI-1097 onward. |
| [ILI-1087](https://linear.app/iliketobuild/issue/ILI-1087) | Ground Truth: ILI-1088 to ILI-1096. |
