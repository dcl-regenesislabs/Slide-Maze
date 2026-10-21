// The rules of Slide Maze as pure functions. The 3D scene only animates what these decide.
//
// A push slides a block one tile at a time until the next tile is blocked (step, wall, static cube, fan, another
// block, the map edge). Tiles change that slide: a hole drops the block (level lost), a snow patch stops it, an arrow
// turns it. Plates do not stop a block: a plate is only covered if something else stops the block on it.
// When a block comes to rest in a fan's wind lane, the fan pushes it on (and so on, a few times at most).
// A fillable pit (F) swallows the first block that slides into it and becomes floor; a hole (O) just loses the block.

import { ARROW_DIR, DIRS, DIR_DELTA, Dir, FAN_DIR, Level, Pt, Tile } from './grid'

export interface GameState {
  level: Level
  blocks: Pt[]
  filled: Pt[] // fillable pits (F) that have been filled
  moves: number // successful pushes
}

export interface PushResult {
  moved: boolean // false = the block could not move at all (blocked on the first step)
  path: Pt[] // tiles the block passes through in order, excluding where it started (may turn at arrows / fans)
  fell: boolean // the last tile of path is a hole
  consumed: boolean // the last tile of path is a fillable pit: the block is used up and the pit is now filled
  state: GameState // state after the push (unchanged when moved is false or the block fell)
}

const MAX_STEPS = 400 // stops an arrow loop from sliding a block forever
const MAX_LAUNCHES = 12 // stops fans from passing a block back and forth forever

export function createState(level: Level): GameState {
  return { level, blocks: level.blocks.map((b) => ({ ...b })), filled: [], moves: 0 }
}

export const samePt = (a: Pt, b: Pt) => a.x === b.x && a.y === b.y

function inBounds(level: Level, p: Pt) {
  return p.x >= 0 && p.y >= 0 && p.x < level.width && p.y < level.height
}

export function blockAt(state: GameState, p: Pt): number {
  return state.blocks.findIndex((b) => samePt(b, p))
}

/** A fillable pit that has not been filled yet. */
export const isOpenPit = (state: GameState, p: Pt) =>
  state.level.tiles[p.y][p.x] === 'F' && !state.filled.some((f) => samePt(f, p))

/** Tiles that stop a sliding block (and the wind). */
const solidForBlocks = (t: Tile) => t === '#' || t === 'W' || t === 'S' || t === 'E' || FAN_DIR[t] !== undefined

/** Can the player stand on this tile? Steps (#) are fine; full walls, static cubes, fans, blocks and holes are not. */
export function playerCanStand(state: GameState, p: Pt): boolean {
  if (!inBounds(state.level, p)) return false
  const t = state.level.tiles[p.y][p.x]
  if (t === 'W' || t === 'S' || t === 'O' || t === 'E' || FAN_DIR[t] !== undefined) return false
  if (isOpenPit(state, p)) return false
  return blockAt(state, p) === -1
}

/** Which way the wind pushes a block resting at `at`, or null. The nearest block in a fan's lane is the one it hits. */
function windAt(level: Level, others: Pt[], at: Pt): Dir | null {
  for (const fan of level.fans) {
    const d = DIR_DELTA[fan.dir]
    let q = { x: fan.x + d.x, y: fan.y + d.y }
    while (inBounds(level, q) && !solidForBlocks(level.tiles[q.y][q.x])) {
      if (samePt(q, at)) return fan.dir
      if (others.some((b) => samePt(b, q))) break // another block shields the rest of the lane
      q = { x: q.x + d.x, y: q.y + d.y }
    }
  }
  return null
}

export function push(state: GameState, index: number, dir: Dir): PushResult {
  const level = state.level
  const others = state.blocks.filter((_, i) => i !== index)
  const path: Pt[] = []
  let cur = state.blocks[index]
  let fell = false
  let consumed = false
  let steps = 0

  const free = (p: Pt) => inBounds(level, p) && !solidForBlocks(level.tiles[p.y][p.x]) && !others.some((b) => samePt(b, p))

  /** Slide from `cur` in direction `d0` until something stops the block. Returns true if it moved at all. */
  const slide = (d0: Dir): boolean => {
    let d = d0
    let moved = false
    for (;;) {
      if (steps++ > MAX_STEPS) return moved
      const next = { x: cur.x + DIR_DELTA[d].x, y: cur.y + DIR_DELTA[d].y }
      if (!free(next)) return moved
      path.push(next)
      cur = next
      moved = true
      const t = level.tiles[next.y][next.x]
      if (t === 'O') {
        fell = true
        return true
      }
      if (t === 'F' && isOpenPit(state, next)) {
        consumed = true
        return true
      }
      if (t === 'N') return true
      if (ARROW_DIR[t]) d = ARROW_DIR[t]
    }
  }

  if (!slide(dir)) return { moved: false, path, fell: false, consumed: false, state }
  for (let n = 0; n < MAX_LAUNCHES && !fell && !consumed; n++) {
    const wind = windAt(level, others, cur)
    if (!wind || !slide(wind)) break
  }
  if (fell) return { moved: true, path, fell, consumed: false, state }
  if (consumed) {
    // the block is used up and the pit becomes floor
    const blocks = state.blocks.filter((_, i) => i !== index)
    return { moved: true, path, fell: false, consumed, state: { level, blocks, filled: [...state.filled, cur], moves: state.moves + 1 } }
  }
  const blocks = state.blocks.map((b, i) => (i === index ? cur : b))
  return { moved: true, path, fell, consumed: false, state: { level, blocks, filled: state.filled, moves: state.moves + 1 } }
}

/** Every tile the player can walk to from `from`, as `y * width + x` ids, plus the top-left-most one (a stable label). */
export function reachable(state: GameState, from: Pt): { set: Set<number>; canon: Pt } {
  const w = state.level.width
  const set = new Set<number>([from.y * w + from.x])
  const queue: Pt[] = [from]
  let canon = from
  while (queue.length) {
    const p = queue.pop() as Pt
    if (p.y < canon.y || (p.y === canon.y && p.x < canon.x)) canon = p
    for (const d of DIRS) {
      const n = { x: p.x + DIR_DELTA[d].x, y: p.y + DIR_DELTA[d].y }
      if (!set.has(n.y * w + n.x) && playerCanStand(state, n)) {
        set.add(n.y * w + n.x)
        queue.push(n)
      }
    }
  }
  return { set, canon }
}

/** Can the player walk up to the exit door from where they stand? True when the level has no door. */
export function canReachExit(state: GameState, from: Pt): boolean {
  const exit = state.level.exit
  if (!exit) return true
  const { set } = reachable(state, from)
  return DIRS.some((d) => set.has((exit.y + DIR_DELTA[d].y) * state.level.width + exit.x + DIR_DELTA[d].x))
}

export function isPlateCovered(state: GameState, plate: Pt): boolean {
  return blockAt(state, plate) !== -1
}

/** Solved = every plate has a block on it at the same time. */
export function isSolved(state: GameState): boolean {
  return state.level.plates.every((p) => isPlateCovered(state, p))
}
