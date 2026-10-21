// Prints the optimal solution of a level as a sequence of boards, marking where the player must stand for each push.
//   node tools/run.mjs tools/replay.ts "<level code | rows separated by />"
import { DIR_DELTA, parseLevel } from '../src/game/grid'
import { decodeLevelCode } from '../src/game/levelCode'
import { createState, push } from '../src/game/logic'
import { solve } from './solver'

declare const process: { argv: string[] }
const input = process.argv.slice(2).join(' ').trim()
const rows = input.startsWith('SM1-') ? decodeLevelCode(input) : input.split(/[\/\s]+/).filter(Boolean)
const level = parseLevel('replay', rows)
const sol = solve(level)
let state = createState(level)
const draw = (stand?: { x: number; y: number }) =>
  level.tiles
    .map((r, y) =>
      r
        .map((t, x) => {
          if (stand && stand.x === x && stand.y === y) return '@'
          if (state.blocks.some((b) => b.x === x && b.y === y)) return 'B'
          return t
        })
        .join('')
    )
    .join('\n')
console.log(sol.solvable ? `${sol.pushes} pushes\n` : 'NOT SOLVABLE')
console.log(draw(level.start) + '\n')
sol.steps.forEach((s, i) => {
  const d = DIR_DELTA[s.dir]
  const stand = { x: s.block.x - d.x, y: s.block.y - d.y }
  const idx = state.blocks.findIndex((b) => b.x === s.block.x && b.y === s.block.y)
  console.log(`push ${i + 1}: stand on ${stand.x},${stand.y} (${level.tiles[stand.y][stand.x] === '#' ? 'LEDGE' : 'floor'}), push block ${s.block.x},${s.block.y} ${s.dir}`)
  state = push(state, idx, s.dir).state
  console.log(draw() + '\n')
})
