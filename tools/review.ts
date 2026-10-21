// Review a level: paste a level code OR an ASCII grid (rows separated by '/' or spaces) and get the grid back,
// whether it is solvable, the fewest pushes, and one optimal solution.
//   node tools/run.mjs tools/review.ts "SM1-7x7-...-KAGH"
//   node tools/run.mjs tools/review.ts "#####/#@B.#/#..P#/#####"

import { parseLevel } from '../src/game/grid'
import { decodeLevelCode, encodeLevelCode } from '../src/game/levelCode'
import { solve } from './solver'

declare const process: { argv: string[]; exitCode?: number }

const input = process.argv.slice(2).join(' ').trim()
if (!input) {
  console.log('usage: review.ts "<level code | rows separated by />"')
  process.exitCode = 2
} else {
  try {
    const rows = input.startsWith('SM1-') ? decodeLevelCode(input) : input.split(/[\/\s]+/).filter(Boolean)
    const level = parseLevel('review', rows)
    console.log(rows.join('\n'))
    console.log(`\n${level.width}x${level.height}  blocks ${level.blocks.length}  plates ${level.plates.length}`)
    console.log(`code: ${encodeLevelCode(rows)}`)
    const sol = solve(level)
    if (sol.solvable) {
      console.log(`SOLVABLE in ${sol.pushes} pushes (searched ${sol.statesSearched} states)`)
      console.log(sol.steps.map((s, i) => `${i + 1}. block@${s.block.x},${s.block.y} ${s.dir}`).join('\n'))
    } else {
      console.log(sol.truncated ? 'UNKNOWN: search limit hit' : 'NOT SOLVABLE')
      process.exitCode = 1
    }
  } catch (e) {
    console.log(`error: ${(e as Error).message}`)
    process.exitCode = 1
  }
}
