// Proposes an exit door (E) for each level that has none: a border step (#) next to plain floor, as far from the start
// as possible, that keeps the level solvable with the same minimum pushes. Prints JSON {levelName: rows}.
//   node tools/run.mjs tools/doors.ts

import { DIR_DELTA, parseLevel } from '../src/game/grid'
import { blockAt, createState, playerCanStand, push } from '../src/game/logic'
import { LEVELS } from '../src/game/levels'
import { solve } from './solver'

/** No required standing spot on the floor may have fewer than two open FLOOR neighbours (steps and the exit do not count). */
function noPockets(level: ReturnType<typeof parseLevel>, steps: { block: { x: number; y: number }; dir: 'N' | 'E' | 'S' | 'W' }[]): boolean {
  let st = createState(level)
  for (const step of steps) {
    const d = DIR_DELTA[step.dir]
    const stand = { x: step.block.x - d.x, y: step.block.y - d.y }
    const t = level.tiles[stand.y][stand.x]
    if (t !== '#' && t !== 'E') {
      let open = 0
      for (const n of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
        const q = { x: stand.x + n.x, y: stand.y + n.y }
        const qt = level.tiles[q.y]?.[q.x]
        if (qt !== '#' && qt !== 'E' && playerCanStand(st, q)) open++
      }
      if (open < 2) return false
    }
    st = push(st, blockAt(st, step.block), step.dir).state
  }
  return true
}

const out: Record<string, string[]> = {}
for (const level of LEVELS) {
  if (level.exit) continue
  const base = solve(level)
  const cands: { x: number; y: number; dist: number }[] = []
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const border = x === 0 || y === 0 || x === level.width - 1 || y === level.height - 1
      const corner = (x === 0 || x === level.width - 1) && (y === 0 || y === level.height - 1)
      if (!border || corner || level.tiles[y][x] !== '#') continue
      // the tile just inside the border must be plain floor
      const ix = x === 0 ? 1 : x === level.width - 1 ? x - 1 : x
      const iy = y === 0 ? 1 : y === level.height - 1 ? y - 1 : y
      if (!['.', 'N'].includes(level.tiles[iy][ix])) continue
      if (level.blocks.some((b) => b.x === ix && b.y === iy) || (level.start.x === ix && level.start.y === iy)) continue
      cands.push({ x, y, dist: Math.abs(x - level.start.x) + Math.abs(y - level.start.y) })
    }
  }
  cands.sort((a, b) => b.dist - a.dist)
  for (const c of cands) {
    const rows = level.rows.map((r, y) => (y === c.y ? r.slice(0, c.x) + 'E' + r.slice(c.x + 1) : r))
    const withDoor = parseLevel(level.name, rows)
    const sol = solve(withDoor)
    if (sol.solvable && sol.pushes === base.pushes && noPockets(withDoor, sol.steps)) {
      out[level.name] = rows
      break
    }
  }
  if (!out[level.name]) console.log(`// no door position keeps "${level.name}" at ${base.pushes} pushes`)
}
console.log(JSON.stringify(out, null, 1))
