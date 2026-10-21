# Slide Maze: 3D asset list

Everything is a placeholder box right now (see `src/game/world.ts` and `src/game/lobby.ts`). This is what the real art needs to replace. Priority: **P0** = needed to ship, **P1** = makes it feel good, **P2** = nice to have.

## Specs that apply to everything

| | |
|---|---|
| Format | `.glb`, Y-up, 1 unit = 1 metre, +Z forward |
| Grid | 1 tile = **3 m x 3 m**. Levels are built from repeated tiles, up to 31 x 31 |
| Pivot | Bottom-centre of the piece for tiles; the **top of the ice slab is the reference height** |
| Ice slab | 0.5 m thick. Everything sits on top of it |
| Materials | 1 material per asset where possible. Share one texture atlas across the whole tile kit |
| Textures | 512 px or less per atlas page. Emissive maps are welcome (plates, arrows, crystals, terminal glow) |
| Colliders | Not needed in the model. The scene adds simple box colliders in code |
| Naming | `sm_<group>_<name>_<variant>.glb`, e.g. `sm_tile_ice_a.glb` |
| Scene limits | 8x8 parcels allows about 640k triangles and 12,800 entities. A 31x31 level is about 960 tiles, so **keep floor tiles under ~150 triangles** |

Readability rule from the GDD (the main risk): **a movable block must never be mistaken for a static cube**, even in a thumbnail. Different colour *and* different silhouette.

---

## A. Level pieces (P0)

| # | Asset | Variants | Size | Tris target | Notes |
|---|---|---|---|---|---|
| A1 | **Ice floor tile** | 2-3 (two checker shades, one with light cracks) | 3 x 0.5 x 3 | 100 | Glossy, slightly bevelled edges so tile seams stay readable. Must tile with no visible repeat on a 31x31 |
| A2 | **Step / ledge tile** (`#`) | straight, outer corner, inner corner | 3 x 0.7 x 3 (top is **0.2 m above the ice**) | 120 | The player jumps onto it and walks along it. Rocky edge, lighter than the wall so it reads as climbable |
| A3 | **Full wall tile** (`W`) | 2-3 + corner | 3 x 3.6 x 3 | 200 | Used to build enclosed rooms. Dark rock / ice. Must look un-climbable |
| A4 | **Movable block** | 1 (+ optional damaged / frosty states) | 2.7 cube | 250 | **Warm orange family**, friendly, "push me" shape. Clear faces on all 4 sides so the push direction reads |
| A5 | **Static cube** | 1-2 | 2.7 cube | 250 | **Cold dark slate**, heavy, carved or runed. Different silhouette from A4 (chamfered / stepped top) |
| A6 | **Pressure plate** | off and on states | 2.2 x 0.1 x 2.2 | 80 | Set into the ice. "On" glows green. Easiest as one mesh with an emissive channel the scene can switch |
| A7 | **Start pad** (`@`) | 1 | 2.4 x 0.05 x 2.4 | 40 | Faint rune circle where the player arrives |
| A8 | **Hole edge pieces** (`O`) | 4 sides + corner | 3 x 0.5 x 3 | 100 | A tile with no floor. Needs a broken-ice rim so the missing tile looks like a drop, plus the cut side of the slab |
| A9 | **Fillable pit** (`F`) | open + filled | 3 x 0.5 x 3 | 150 | **Amber / brass lip around a square shaft** (this is what separates it from a deadly hole). Filled version: packed rubble or ice patch, flush with the floor |
| A10 | **Snow patch** (`N`) | 2 | 3 x 0.2 x 3 | 100 | Matte, grippy-looking drift on top of ice. Contrast with the glossy tiles is the whole point |
| A11 | **Arrow tile** | 1 (the scene rotates it 4 ways) | 3 x 0.55 x 3 | 100 | Ice tile with a glowing arrow inlay. Strong emissive, readable from far |
| A12 | **Fan** | 1 (rotated 4 ways) | 2.4 x 1.6 x 2.4 | 400 | Solid machine on a tile. **Blades must be a separate node** (or an animation clip named `spin`) so they rotate. Front face clearly shows which way it blows |
| A13 | **Floating-island underside** | 3-4 chunks | modular, about 3 m wide | 200 each | The level floats 12 m up. The slab needs a rocky, stalactite underside so it does not look like a thin sheet. Hangs under the level edge |

## B. Level dressing (P1)

| # | Asset | Notes |
|---|---|---|
| B1 | Outer rim / skirt around the level | Hides the raw slab edge of the outer step ring |
| B2 | Icicles (3 sizes) | Hang off the underside and the walls |
| B3 | Frost / snow drifts on steps (3) | Breaks up the hard edges |
| B4 | Floating crystals and shards | Ambient, slow drift, off to the sides of the level |
| B5 | Corner torches or glowing lanterns | Light sources at the corners so the level is evenly lit |
| B6 | Level number marker | Small plaque at the start pad |

## C. Lobby (P0 for the set, P1 for dressing)

| # | Asset | Notes |
|---|---|---|
| C1 | Cave floor | About 30 x 24 m. Glossy ice with rock edges |
| C2 | Cave walls and ceiling | 3 rock variants + a ceiling with stalactites. The lobby is currently open to the sky |
| C3 | **Level-select terminal** (P0) | Pillar with a large glowing screen, clickable. About 2.4 m wide screen. The player arrives facing it |
| C4 | **Leaderboard board** (P0) | Frame about 11 x 4.4 m for weekly and all-time rankings. The scene overlays the text |
| C5 | Title sign "SLIDE MAZE" | Big, readable on arrival |
| C6 | **Reward pedestal** | Shows the wearable you win for finishing all 15 levels |
| C7 | Crystal clusters (3, glowing) | Cyan and pink accents |
| C8 | Rocks, snow piles, stalagmites | Dressing |
| C9 | Level-editor workbench (P1) | A table or drafting desk that marks the editor entrance, if the editor gets a physical door |
| C10 | Ambient props | Banners, lanterns, a Christmas event layer (lights, garlands) for the December launch |

## D. Environment (P1)

| # | Asset | Notes |
|---|---|---|
| D1 | Cave void backdrop / skybox | Dark gradient dome with a few floating crystals. Seen below and around the floating levels |
| D2 | Ground under the levels | A dark void plane or fog layer so a fall reads as falling into the abyss, not onto grass |
| D3 | Ambient floating motes | Small glow shapes (or built in code) |

## E. Reward (P0, but a separate pipeline)

| # | Asset | Notes |
|---|---|---|
| E1 | **Completion wearable** | Decentraland wearables have their own category rules, triangle limits and texture sizes. **Decision needed:** which slot (hat, back item, tool, skin)? The ice-block-on-your-back or a frosted crown fit the game |
| E2 | Reward pedestal version (C6) | A display model of the same item |

## F. 2D and UI art (not 3D, listed so nothing is missed)

Logo, level-select tile frames (locked, new, completed), lock / star / medal icons, nine-slice panel frame matching the HUD, button states, leaderboard row design, level-complete banner, wearable thumbnail.

## G. Effects

The slide trail, stop burst, confetti, wind streaks, hole chips and plate pulse are **built in code from cubes and spheres** and need no assets. If we want hand-made VFX meshes (shard shapes, a ring with a gradient), they would be a small P2 set: 3 shard meshes, 1 ring, 1 star.

## H. Audio (for later)

Slide loop, block stop thud, plate click (on and off), pit fill, hole fall, fan hum, level-complete jingle, lobby ambience, push effort grunt.

---

## Suggested order for the artist

1. **A1-A7 first** (floor, step, wall, both cubes, plate, start pad). With only these, levels 1-5 are fully playable and the look is locked.
2. **A8-A12** (holes, pits, snow, arrow, fan) for levels 6-15.
3. **A13, B1, D1, D2**: the floating-level look.
4. **C1-C5**: the lobby.
5. Everything else.
