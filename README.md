# Crownfall: Warbound

A 3D fantasy strategy RPG. You are a commander: you build a deck of soldiers,
monsters and siege engines, forge your own armour and weapons, and fight
real-time tactical battles in which you are a unit on the field rather than a
cursor above it.

Runs in the browser. No build step, no dependencies, no asset files — every
model, sound and texture in the game is generated in code at runtime.

---

## Playing

Open `index.html` through a web server (ES modules will not load from `file://`).

    # any static server works
    python -m http.server 8080

### Camera

**Click the world once** to take camera control, then just move the mouse —
left/right turns, up/down looks up and down, with no button held. `Esc` hands
the mouse back for menus; clicking the world takes it again. If a browser
refuses pointer lock, hold the **right mouse button** to look instead; it is the
same camera, only the source of the movement differs.

Sensitivity and invert-Y are in Options.

**World**
| | |
|---|---|
| mouse | look |
| `WASD` | walk, relative to the camera |
| `Shift` | run |
| `E` | interact |
| wheel | zoom |

**Battle**
| | |
|---|---|
| `1`–`4` | arm a card; a marker shows where it lands, then click to drop it |
| `WASD` | move your commander, relative to the camera |
| left mouse | attack (hold to draw a bow) |
| `Space` | dodge |
| `Q` `E` `R` | commander abilities |
| `Z` `X` `C` | potions |
| `Tab` | switch overhead ⇄ over-the-shoulder |
| `Esc` | pause |

---

## How the game fits together

    BATTLE → rewards → shards & materials
       ↑                      ↓
    harder battles ← stronger army ← upgrades, crafting, equipment
       ↑                      ↓
    new regions  ←  research & new cards

The loop is deliberately tight: every battle pays out something you were
already saving for, because reward rolls are weighted toward cards in your deck
and materials a recipe you can already see is short of.

### The parts

- **44 collectible cards** across six rarities, plus 38 enemy and summoned
  units. Higher rarities introduce mechanics, not bigger numbers.
- **84 abilities**, each a real behaviour rather than a stat line.
- **The counter table** (`src/core/Config.js`) — nine damage types against
  seven armour types. It decides more battles than anything else in the game.
- **Deck, field and combo synergies** (`src/data/Synergies.js`): what you bring,
  where you put it, and what you do with it are three separate layers.
- **Five regions, 46 nodes**, five bosses with stated mechanics — the briefing
  screen always tells you the mechanic, so a loss is a decision, not a surprise.
- **60 equipment pieces** in three armour families (heavy / light / magic) and
  eight weapon classes that genuinely play differently.
- **A walkable hub**: courtyard, Library, forge, camp, market, training ground,
  with NPCs and dialogue.

---

## Code layout

    src/
      core/     config, RNG, input, save, audio, event bus
      data/     ALL content: units, abilities, items, recipes, research,
                campaign, factions, statuses, synergies, quests, dialogue
      art/      procedural geometry, models, effects, sky, post-processing
      game/     player state, progression, rewards, crafting
      battle/   the simulation: field, entities, AI, commander, spatial grid
      world/    walkable zones, NPCs, the hub controller
      ui/       screens, widgets, HUD

### The camera

`src/core/CameraRig.js` is the only thing in the game that writes
`camera.position` or `camera.rotation`, and the only thing that decides which
way "forward" is. `test_camera` fails the build if anything else tries.

It matters that movement and the view come from the same `yaw` in the same
object: the previous code derived them separately and they disagreed by 90° at
every angle, so W walked sideways. Orientation is set as explicit YXZ Euler
angles rather than `lookAt()`, because `lookAt` has to choose an up vector and
that choice is unstable near vertical — which is where camera flips come from.
`rotation.z` is never written, so roll is structurally impossible.

Three rules the codebase holds to:

1. **Content is data.** Adding a card, a recipe, a region or an ability means
   adding one entry to a table in `src/data/`. Nothing else has to know.
2. **There is one damage path.** Everything that hurts anything goes through
   `Battle.dealDamage`, so counters, armour, statuses, shields, reflection and
   the floating numbers can never disagree.

### The ability contract

Abilities never touch the scene graph, the UI or the save. They speak only to
the battle facade (`b.dealDamage`, `b.spawn`, `b.applyStatus`, …), which is why
the same data drives the simulation, the tooltips and the enemy AI. The full
vocabulary is documented at the top of `src/data/Abilities.js`.

---

## Tests

There is no npm here; the suites run under any Node 18+ and are pure ES
modules. They cover:

| suite | what it proves |
|---|---|
| `static` | every import resolves to a real, exported binding |
| `camera` | mouse direction, pitch clamping, no roll/flip/drift, responsiveness, and that W/A/S/D agree with the basis three.js itself derives from the camera matrix |
| `playloop` | the camera driven through real gameplay: spawn, move all four ways, rotate, look up/down, move while turning, open/close menus, enter combat, 40s soak |
| `data` | every id cross-reference in the content tables is valid, the campaign is reachable and connected, and no armour type is uncounterable |
| `facade` | every `b.*` an ability calls exists and is not shadowed by a property |
| `art` | every model at every tier builds with finite geometry; every battlefield is walkable end to end; every zone is reachable |
| `abilities` | all 84 abilities, 9 commander abilities, 8 potions and 27 statuses fire against a live battle |
| `ui` | every screen builds and every control is clicked, at several save states |
| `sim` | every campaign node, every unit, every modifier and every boss played to a verdict, with leak and NaN probes |

There is also a software rasteriser (`render.mjs`) that renders models and
scenes to PNG, because reading model-building code tells you nothing about
whether a knight looks like a knight. It found more real bugs than any of the
assertions did.
