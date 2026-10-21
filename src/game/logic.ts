// The rules of Slide Maze as pure functions. The 3D scene only animates what these decide.
//
// A push slides a block one tile at a time until the next tile is blocked (step, wall, static cube, fan, another
// block, the map edge). Tiles change that slide: a hole drops the block (level lost), a snow patch stops it, an arrow
// turns it. Plates do not stop a block: a plate is only covered if something else stops the block on it.
// A fan's wind lane acts like an arrow on every tile of the lane: a block that enters it is pushed along the wind.
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

/** Can the player stand on this tile? Steps (# and the exit step E) are fine; full walls, static cubes, fans, blocks and holes are not. */
export function playerCanStand(state: GameState, p: Pt): boolean {
  if (!inBounds(state.level, p)) return false
  const t = state.level.tiles[p.y][p.x]
  if (t === 'W' || t === 'S' || t === 'O' || FAN_DIR[t] !== undefined) return false
  if (isOpenPit(state, p)) return false
  return blockAt(state, p) === -1
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
      const w = level.wind[next.y][next.x]
      if (w) d = w // in a fan's wind lane: pushed along the wind
    }
  }

  if (!slide(dir)) return { moved: false, path, fell: false, consumed: false, state }
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

/** Can the player get onto the exit step (the door is just outside it)? True when the level has no door. */
export function canReachExit(state: GameState, from: Pt): boolean {
  const exit = state.level.exit
  if (!exit) return true
  return reachable(state, from).set.has(exit.y * state.level.width + exit.x)
}

export function isPlateCovered(state: GameState, plate: Pt): boolean {
  return blockAt(state, plate) !== -1
}

/** Solved = every plate has a block on it at the same time. */
export function isSolved(state: GameState): boolean {
  return state.level.plates.every((p) => isPlateCovered(state, p))
}
