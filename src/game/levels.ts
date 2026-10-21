import { Level, parseLevel } from './grid'
import { decodeLevelCode, encodeLevelCode } from './levelCode'

// Every level has one exit door (E) on the border: it opens when all plates are covered.
// Accepted levels live here as readable ASCII (see grid.ts for the legend). The level code is only a transport format.
// Every level must pass `node tools/run.mjs tools/check.ts` (solvable + code round-trip) before it is committed.
export const LEVELS: Level[] = [
  // Teaches the two ideas: a push slides until something stops it, and a plate counts when a block rests on it.
  // Solution (2 pushes): block east -> it stops at the east wall; block north -> it stops on the plate.
  parseLevel('First Slide', [
    '####E##',
    '#....P#',
    '#.....#',
    '#..B..#',
    '#.....#',
    '#@....#',
    '#######'
  ]),
  // Static cubes are stoppers: the plate sits next to one, so a block sliding along that row halts on it.
  parseLevel('Stoppers', [
    '#####E#',
    '#.....#',
    '#.....#',
    '#..PS.#',
    '#S....#',
    '#S@B..#',
    '#######'
  ]),
  // Holes are traps: a block that slides into one is lost and the level resets. Plan the stop before the push.
  parseLevel('Mind the Gap', [
    '#E#####',
    '#.OOP.#',
    '#.....#',
    '#O.B..#',
    '#....@#',
    '#..S..#',
    '#######'
  ]),
  // First two-plate level: both plates must be covered at the same time.
  parseLevel('Two Plates', [
    '#######',
    '#P...B#',
    '#O....#',
    '#P..@.#',
    '#S..S.#',
    'E.B...#',
    '#######'
  ]),
  // Three blocks, three plates, one hole: blocks get in each other's way.
  parseLevel('Crowd', [
    '#######',
    '#B.P..#',
    '#.@..P#',
    '#O.S.B#',
    '#..S.B#',
    '#....P#',
    '####E##'
  ]),
  // Levels 6-10 are solver-verified drafts from tools/gen.ts: difficulty is a guess until they are playtested.
  parseLevel('Corner Pocket', [
    '#######',
    '#P...S#',
    '#S..@.#',
    '#....P#',
    'E..BO.#',
    '#S...B#',
    '#######'
  ]),
  parseLevel('Cliffside', [
    '#######',
    '#.SO@B#',
    '#....B#',
    '#OS..P#',
    '#....P#',
    'E...O.#',
    '#######'
  ]),
  parseLevel('Plate Cluster', [
    '#######',
    '#P.PP.#',
    '#..SB.#',
    '#..B@B#',
    '#S.S..#',
    'E..O..#',
    '#######'
  ]),
  parseLevel('Hole Maze', [
    '#######',
    '#..B.B#',
    '#@S.P.#',
    '#.O...#',
    '#BOPO.E',
    '#..S.P#',
    '#######'
  ]),
  parseLevel('The Big Room', [
    '#########',
    '#.O.O...E',
    '#B......#',
    '#....S..#',
    '#S.SP...#',
    '#..@..BP#',
    '#.P..B.S#',
    '#.......#',
    '#########'
  ]),
  // Levels 11-13 introduce the new tiles (see the legend in grid.ts): snow stops a block, arrows turn it, a fan blows it.
  parseLevel('Soft Landing', [
    '#E#####',
    '#....O#',
    '#N.N.P#',
    '#.PB.N#',
    '#..S..#',
    '#..B.@#',
    '#######'
  ]),
  parseLevel('Redirect', [
    '#######',
    '#@..P.#',
    '#vS>.S#',
    '#B...P#',
    '#.^.O.#',
    '#B....E',
    '#######'
  ]),
  parseLevel('Tailwind', [
    '##E####',
    '#B....#',
    '#.S.d.#',
    '#...@B#',
    '#...P.#',
    '#OP.S.#',
    '#######'
  ]),
  // Levels 14-15 introduce the fillable pit (F): the first block that slides in is used up and the pit becomes floor.
  parseLevel('Fill the Gap', [
    '#E#####',
    '#.S..P#',
    '#.....#',
    '#...@S#',
    '#.....#',
    '#FB..B#',
    '#######'
  ]),
  parseLevel('Sacrifice', [
    '#######',
    '#BB..F#',
    '#....P#',
    '#..SP@#',
    '#.BS..#',
    'E..O..#',
    '#######'
  ])
]

export const levelCode = (level: Level) => encodeLevelCode(level.rows)

/** Used by the editor / "paste a level code" flow later. Throws with a readable message on a bad code. */
export const levelFromCode = (code: string, name = 'Custom') => parseLevel(name, decodeLevelCode(code))
