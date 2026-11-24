// Print a shipped level's optimal solution as a picture per push: @ = where to stand, * = the block to push.
//   node tools/run.mjs tools/walkthrough.ts 19
import { LEVELS } from '../src/game/levels'
import { createState, push } from '../src/game/logic'
import { solve } from '../src/game/solver'
import { DIR_DELTA } from '../src/game/grid'
declare const process: { argv: string[] }
const n = Number(process.argv[2])
const L = LEVELS[n - 1]
const sol = solve(L)
let st = createState(L)
const draw = (player: any, mark?: any, stand?: any) => {
  const g = L.rows.map((row) => row.replace(/[B@]/g, '.').split(''))
  for (const f of (st as any).filled ?? []) g[f.y][f.x] = '_'
  for (const b of st.blocks) g[b.y][b.x] = 'B'
  if (mark) g[mark.y][mark.x] = '*'
  if (stand) g[stand.y][stand.x] = '@'
  return g.map((r) => '    ' + r.join(' ')).join('\n')
}
const name: any = { N: 'north (up)', S: 'south (down)', E: 'east (right)', W: 'west (left)' }
sol.steps.forEach((s, i) => {
  const d = DIR_DELTA[s.dir]
  const stand = { x: s.block.x - d.x, y: s.block.y - d.y }
  console.log(`\n${i + 1}. stand on @ and push * to the ${name[s.dir]}`)
  console.log(draw(null, s.block, stand))
  const bi = st.blocks.findIndex((b) => b.x === s.block.x && b.y === s.block.y)
  const r = push(st, bi, s.dir)
  st = r.state
})
console.log('\nFinal:\n' + draw(null))
