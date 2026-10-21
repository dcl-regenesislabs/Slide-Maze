// Breadth-first solver. Answers: is this level winnable, and what is the fewest pushes?
// State = block positions + which region of floor the player can reach (the player only matters through what they can reach).

import { DIRS, DIR_DELTA, Dir, Level, Pt } from './grid'
import { GameState, canReachExit, createState, isSolved, push, reachable } from './logic'

export interface Solution {
  solvable: boolean
  pushes: number // minimum pushes (valid when solvable)
  steps: { block: Pt; dir: Dir }[] // block position BEFORE the push + direction
  statesSearched: number
  truncated: boolean // true = gave up at the search limit, so "unsolvable" is not proven
}

const ids = (pts: Pt[]) =>
  pts
    .map((b) => b.y * 100 + b.x)
    .sort((a, b) => a - b)
    .join(',')
const key = (blocks: Pt[], filled: Pt[], reach: Pt) => ids(blocks) + '/' + ids(filled) + '|' + (reach.y * 100 + reach.x)

export function solve(level: Level, limit = 2_000_000): Solution {
  interface Node {
    state: GameState
    player: Pt
    prev: Node | null
    step: { block: Pt; dir: Dir } | null
    depth: number
  }
  const start: Node = { state: createState(level), player: level.start, prev: null, step: null, depth: 0 }
  const seen = new Set<string>()
  let frontier: Node[] = [start]
  seen.add(key(start.state.blocks, start.state.filled, reachable(start.state, start.player).canon))
  let searched = 0

  while (frontier.length) {
    const next: Node[] = []
    for (const node of frontier) {
      if (isSolved(node.state) && canReachExit(node.state, node.player)) {
        const steps: Solution['steps'] = []
        for (let n: Node | null = node; n && n.step; n = n.prev) steps.unshift(n.step)
        return { solvable: true, pushes: node.depth, steps, statesSearched: searched, truncated: false }
      }
      const { set } = reachable(node.state, node.player)
      node.state.blocks.forEach((b, i) => {
        for (const dir of DIRS) {
          const d = DIR_DELTA[dir]
          const stand = { x: b.x - d.x, y: b.y - d.y } // the player pushes from the opposite side
          if (!set.has(stand.y * level.width + stand.x)) continue
          const res = push(node.state, i, dir)
          if (!res.moved || res.fell) continue
          // After the push the player stands where the block used to be.
          const k = key(res.state.blocks, res.state.filled, reachable(res.state, b).canon)
          if (seen.has(k)) continue
          seen.add(k)
          searched++
          next.push({ state: res.state, player: b, prev: node, step: { block: b, dir }, depth: node.depth + 1 })
        }
      })
      if (searched > limit) return { solvable: false, pushes: -1, steps: [], statesSearched: searched, truncated: true }
    }
    frontier = next
  }
  return { solvable: false, pushes: -1, steps: [], statesSearched: searched, truncated: false }
}
