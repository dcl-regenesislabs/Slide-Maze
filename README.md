# Slide Maze

A 3D ice-sliding block puzzle for [Decentraland](https://decentraland.org), built with SDK7.

The whole floor is ice. Walk into a block and it **slides** across the level until it hits something. Slide blocks onto the glowing pressure plates to solve each level. Think Sokoban on ice, inspired by the block-pushing ice dungeons in Zelda: Ocarina of Time.

> **Status: work in progress (pre-production).** The game rules, level tools and solver are tested in Node. The in-world behaviour (push feel, HUD on phones, the server-backed level saving) has been built but not yet playtested. Placeholder boxes stand in for all art; concept art is in progress.

## How it plays

- **Push a block** by walking into it and holding against it for a moment. It slides until something stops it.
- **Cover every plate at once** to unlock the exit door, then walk through it. Blocks do not stop on a plate by themselves, so the puzzle is working out what will stop them there. The covering blocks are frozen once the door opens, and the solver also checks that you can reach the door.
- **Levels float 12 m above the ground.** Falling into a hole, or off the edge, resets the level.
- **Step ledges** (`#`) around the room are low enough to jump onto. You can walk along them and push blocks from that side. Blocks still stop against them.
- You start in a **lobby** inside a greybox **cave**. A terminal opens the level-select menu.
- Every level has an **entrance** and an **exit door**, both small annexes built *outside* the playfield square, so they are not part of the puzzle grid. You arrive through the entrance, and walking out through the open exit takes you on to the next level. (The solver treats the exit step as a normal walkable ledge, so a level is only solvable if you can reach it.)
- **Progress is saved per wallet** on the server: completed levels and your best moves and time. The server checks reported results (a real level, at least the optimal number of pushes, not faster than a push physically takes).
- The **Hint** button solves the level from where it stands and marks the next push.

## Tiles

Levels are small ASCII grids. The same characters appear in the code, the editor and the level files.

| Char | Tile | Behaviour |
|---|---|---|
| `.` | Ice floor | Blocks slide over it |
| `#` | Step | Low ledge. Stops blocks. The player can stand on it and push from it |
| `W` | Wall | Full height. Stops blocks and the player |
| `O` | Hole | A block or the player that goes in is lost, and the level resets |
| `F` | Fillable pit | The first block that slides in is **used up** and the pit becomes floor. After that, blocks slide across it |
| `P` | Pressure plate | Cover all of them at the same time to open the exit door |
| `E` | Exit | A walkable step **on the border** (not a corner), one per level. The exit door itself is an annex built **outside** the square, attached to this step. It stays sealed until every plate is covered, then you finish the level by walking out through it. A level with no `E` finishes when the plates are covered |
| `S` | Static cube | Immovable. Stops blocks |
| `N` | Snow patch | A sliding block that enters it **stops** there |
| `^ > v <` | Arrow | A sliding block that enters it **turns** to face the arrow and keeps going |
| `u r d l` | Fan (up, right, down, left) | Solid. Blows along the line it faces, up to the first obstacle (its **wind lane**). A sliding block that **enters any lane tile is pushed along the wind**, like an arrow along the whole lane, and keeps sliding that way until something stops it |
| `B` | Movable block | Start position of a block |
| `@` | Player start | Where the player arrives |

Row 0 is the **north** edge, so a level reads like a map seen from above.

```
#######
#....P#
#.....#
#..B..#
#.....#
#@....#
#######
```

## Level codes

Any level can be exported as one copy-pasteable string, run-length encoded with a checksum:

```
SM1-7x7-#7/#.4P#/#.5#/#.2B.2#/#.5#/#@.4#/#7-KAGH
```

Format: `SM1` (version) - `WxH` (size) - rows separated by `/` (`.4` means four ice tiles) - 4-character checksum. A mistyped or cut-off paste is rejected. The code is how levels are shared and reviewed: designers send a code, and it can be decoded, solved and checked with the tools below.

## Level editor (in game)

Press the **Editor** button (desktop only). You build in the 3D world itself, a bit like a build mode:

- **Hotbar along the bottom** with every item (ice, step, wall, hole, pit, exit, plate, cube, block, start, snow, arrow, fan). Click a slot, or press **E** (next item) and **1** (previous item).
- **Aim at a tile and click to place.** A highlight and a see-through preview of the selected item show exactly where it will go. The tile grid is drawn on the floor.
- **F erases** the tile you are aiming at. **2** turns an arrow or fan. **3 / 4** undo and redo.
- **Level size:** the toolbar has `+N -N +S -S +W -W +E -E` buttons to grow or shrink any edge by a row or column (the new line goes just inside the border). Levels can be 5 to 31 tiles per side, the most that fits the 128 m arena. A bigger level needs a bigger scene.
- **Toolbar (top left):** Undo, Redo, a Mode button (Paint, Fill, or Rect for two-corner rectangles), **Hint**, **Check**, **Play**, Reset blocks, Tools and Exit.
- **Check** runs the real solver and reports whether the level is solvable and the fewest pushes. **Play** test-plays from the start. You can also just walk around and push blocks in the level while you edit.
- **Tools panel:** the grid as a map you can click, resize (5 to 31 tiles per side), Flip H / Flip V / Rotate (arrows and fans turn with it, and `tools/check.ts` verifies a flipped or rotated level keeps its push count), New, **Save to my levels** (stored on the server for your wallet, up to 20), My levels, level code import and **Copy level code**.

## Getting started

Requires **Node 22 or newer** (the SDK build tools need it). Using nvm:

```bash
nvm use 22
npm install
npm run start     # preview in the Explorer
npm run build     # type-check and bundle
```

The project uses the `@dcl/sdk@auth-server` branch of the SDK because it has a headless multiplayer server that stores each player's saved levels. The preview starts a local server for you. `scene.json` has `"authoritativeMultiplayer": true`, which the build adds automatically. Do not remove it.

The Decentraland SDK skills for AI assistants are not committed. Install them with:

```bash
npx skills add decentraland/sdk-skills --all
```

## Level tools

These run in Node and need no Explorer.

```bash
# rules, level-code round trips, solvability of every level, special tiles actually used
node tools/run.mjs tools/check.ts

# review a level from a code or a grid: prints it, whether it is solvable, and an optimal solution
node tools/run.mjs tools/review.ts "SM1-7x7-...-KAGH"
node tools/run.mjs tools/review.ts "#####/#@B.#/#..P#/#####"

# step through the optimal solution board by board
node tools/run.mjs tools/replay.ts "SM1-7x7-...-KAGH"

# generate candidate levels for a difficulty profile
# args: plates statics holes minPushes maxPushes [size] [count] [seed] [snow] [arrows] [fans] [pits] [mode] [seconds]
node tools/run.mjs tools/gen.ts 2 3 1 10 14 9 3 601 0 2 1 0 2 285

# put an exit door on every level that has none (same push count, no awkward standing spots)
node tools/run.mjs tools/doors.ts
```

**Every level must pass `tools/check.ts` before it is committed.** The generator finds levels by hill-climbing: it takes a solvable layout and repeatedly moves one object, keeping changes that approach the target difficulty. A candidate must also pass these rules:

- every special tile type in the profile must **matter on its own** (snow, arrows and fan wind must change the answer when removed, a fan is compared with a plain cube; a pit must be *needed*, meaning that as a deadly hole the level is unsolvable or longer);
- `mode 1` also requires the level to be solvable without ever standing on a border step; `mode 2` allows border steps but rejects **pockets** (a required standing spot with fewer than two open floor neighbours) and caps how much of the solution may be pushed from border steps.

The solver (`src/game/solver.ts`) runs on typed arrays and is about 10 times faster than the first version. It was verified against the original on 615 layouts (all shipped levels plus 600 random ones) with identical answers.

### Adding a level

1. Design it in the in-game editor (or write the grid), and press **Check**.
2. Add it to `src/game/levels.ts` as ASCII rows (a level needs one exit door `E` on the border, not in a corner).
3. Run `node tools/run.mjs tools/check.ts`.

## Project structure

```
src/
  index.ts            Entry point. Branches on isServer(): the server stores levels, the client runs the game
  game/
    grid.ts           Tile types and the ASCII level format (the legend lives here)
    logic.ts          The rules: pushing, sliding, holes, pits, snow, arrows, fans. Pure, no SDK imports
    solver.ts         Breadth-first solver. Pure, shared by the editor and the tools
    levelCode.ts      Level code encode / decode
    levels.ts         The shipped levels
    world.ts          The 3D side: builds a level, detects pushes, animates slides, falls
    lobby.ts          The greybox lobby
    editor.ts         Editor actions (painting, resizing, check, import / export)
    levelStore.ts     Client side of "My levels" (talks to the server)
    fx.ts             Effects built from cubes and spheres (no particles)
    session.ts        Shared state the HUD reads
  hud/                Coded React-ECS HUD (mobile-aware scaling, editor panel, menus)
  server/server.ts    Headless server: validates and stores each player's saved levels
  shared/messages.ts  Client / server messages
tools/                Node tools (check, review, replay, gen)
design/               3D asset list and concept-art prompts
```

The rules in `src/game` are pure TypeScript with no SDK imports, so the same code runs in the scene, in the editor and in Node. The 3D scene only animates what the rules decide.

## Design docs

- [`design/3d-assets.md`](design/3d-assets.md): every 3D asset the game needs, with sizes and a triangle budget.
- [`design/concept-art-prompt.md`](design/concept-art-prompt.md): prompts for exploring the art direction.

## Roadmap

Rough order, from the current recap:

1. Playtest pass in the Explorer, and fix what breaks.
2. Leaderboards (weekly and all-time). Needs a decision on what is ranked.
3. Editor: hover highlight, faster rebuilds on big grids, level thumbnails.
4. Sound, camera work, onboarding.
5. Swap the placeholder boxes for the real 3D models.
6. Later: community level submissions and voting.

## Switches to flip before launch

- `DEV_UNLOCK_ALL` in `src/game/session.ts` is `true` so every level can be tested. Set it to `false` for the locked flow.
- `EDITOR_ENABLED` in the same file shows the editor to everyone. It should become a wallet allowlist.

## License

Not yet chosen.
