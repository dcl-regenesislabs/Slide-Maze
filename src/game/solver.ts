// Breadth-first solver. Answers: is this level winnable, and what is the fewest pushes?
// State = block positions (+ filled pits) + which region of floor the player can reach (the player only matters
// through what they can reach).
//
// This is the hot loop of the level generator and of the in-game Check / Hint buttons, so the flood fill that finds
// the player's reachable region runs on preallocated typed arrays with no per-step allocation.

import { DIRS, DIR_DELTA, Dir, FAN_DIR, Level, Pt } from './grid'
import { GameState, canReachExit, createState, isSolved, push } from './logic'

export interface Solution {
  solvable: boolean
  pushes: number // minimum pushes (valid when solvable)
  steps: { block: Pt; dir: Dir }[] // block position BEFORE the push + direction
  statesSearched: number
  truncated: boolean // true = gave up at the search limit, so "unsolvable" is not proven
}

const ids = (pts: Pt[], w: number) =>
  pts
    .map((b) => b.y * w + b.x)
    .sort((a, b) => a - b)
    .join(',')

/** Solve a level from its start. */
export const solve = (level: Level, limit = 2_000_000): Solution => solveFrom(createState(level), level.start, limit)

/** Solve from any position: `state` has the blocks (and filled pits) as they are now, `player` is where the avatar stands. */
export function solveFrom(state0: GameState, player0: Pt, limit = 2_000_000): Solution {
  const level = state0.level
  const w = level.width
  const h = level.height
  const N = w * h

  // Tiles a player can never stand on, whatever the blocks do: walls, cubes, holes and fans. (Open pits are handled per state.)
  const staticSolid = new Uint8Array(N)
  const pits: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = level.tiles[y][x]
      if (t === 'W' || t === 'S' || t === 'O' || FAN_DIR[t] !== undefined) staticSolid[y * w + x] = 1
      if (t === 'F') pits.push(y * w + x)
    }
  }

  const blockedAt = new Int32Array(N) // stamp: this tile is occupied by a block or is an open pit
  const stampA = new Int32Array(N) // visited stamps for the parent's flood (kept while its children are expanded)
  const stampB = new Int32Array(N) // visited stamps for each child's flood
  const stack = new Int32Array(N)
  let blockGen = 0
  let genA = 0
  let genB = 0

  /** Flood fill the walkable tiles from `from`; marks them in `visited` with `mark`. Returns the top-left-most tile id. */
  function flood(state: GameState, from: Pt, visited: Int32Array, mark: number): number {
    blockGen++
    for (const b of state.blocks) blockedAt[b.y * w + b.x] = blockGen
    for (const p of pits) {
      let filled = false
      for (const f of state.filled) if (f.y * w + f.x === p) filled = true
      if (!filled) blockedAt[p] = blockGen
    }
    let sp = 0
    const start = from.y * w + from.x
    visited[start] = mark
    stack[sp++] = start
    let canon = start
    while (sp > 0) {
      const id = stack[--sp]
      if (id < canon) canon = id
      const x = id % w
      if (x + 1 < w) {
        const n = id + 1
        if (!staticSolid[n] && blockedAt[n] !== blockGen && visited[n] !== mark) {
          visited[n] = mark
          stack[sp++] = n
        }
      }
      if (x > 0) {
        const n = id - 1
        if (!staticSolid[n] && blockedAt[n] !== blockGen && visited[n] !== mark) {
          visited[n] = mark
          stack[sp++] = n
        }
      }
      if (id + w < N) {
        const n = id + w
        if (!staticSolid[n] && blockedAt[n] !== blockGen && visited[n] !== mark) {
          visited[n] = mark
          stack[sp++] = n
        }
      }
      if (id >= w) {
        const n = id - w
        if (!staticSolid[n] && blockedAt[n] !== blockGen && visited[n] !== mark) {
          visited[n] = mark
          stack[sp++] = n
        }
      }
    }
    return canon
  }

  interface Node {
    state: GameState
    player: Pt
    prev: Node | null
    step: { block: Pt; dir: Dir } | null
    depth: number
  }
  const keyOf = (state: GameState, canon: number) => ids(state.blocks, w) + '/' + ids(state.filled, w) + '|' + canon

  const start: Node = { state: state0, player: player0, prev: null, step: null, depth: 0 }
  const seen = new Set<string>()
  let frontier: Node[] = [start]
  seen.add(keyOf(state0, flood(state0, player0, stampB, ++genB)))
  let searched = 0

  while (frontier.length) {
    const next: Node[] = []
    for (const node of frontier) {
      if (isSolved(node.state) && canReachExit(node.state, node.player)) {
        const steps: Solution['steps'] = []
        for (let n: Node | null = node; n && n.step; n = n.prev) steps.unshift(n.step)
        return { solvable: true, pushes: node.depth, steps, statesSearched: searched, truncated: false }
      }
      const markA = ++genA
      flood(node.state, node.player, stampA, markA)
      const blocks = node.state.blocks
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i]
        for (const dir of DIRS) {
          const d = DIR_DELTA[dir]
          const sx = b.x - d.x // the player pushes from the opposite side
          const sy = b.y - d.y
          if (sx < 0 || sy < 0 || sx >= w || sy >= h || stampA[sy * w + sx] !== markA) continue
          const res = push(node.state, i, dir)
          if (!res.moved || res.fell) continue
          // After the push the player stands where the block used to be.
          const k = keyOf(res.state, flood(res.state, b, stampB, ++genB))
          if (seen.has(k)) continue
          seen.add(k)
          searched++
          next.push({ state: res.state, player: b, prev: node, step: { block: b, dir }, depth: node.depth + 1 })
        }
      }
      if (searched > limit) return { solvable: false, pushes: -1, steps: [], statesSearched: searched, truncated: true }
    }
    frontier = next
  }
  return { solvable: false, pushes: -1, steps: [], statesSearched: searched, truncated: false }
}
