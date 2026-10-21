// Checks the game rules, the level-code format, and that every committed level is solvable.
//   node tools/run.mjs tools/check.ts            (needs Node 22: nvm use 22)
// Exits non-zero on any failure, so it can gate commits / CI.

import { parseLevel } from '../src/game/grid'
import { decodeLevelCode, encodeLevelCode } from '../src/game/levelCode'
import { fillRect, flipHorizontal, flipVertical, floodFill, growEdgeRows, rotateRight } from '../src/game/editorOps'
import { LEVELS, levelCode } from '../src/game/levels'
import { canReachExit, createState, isSolved, playerCanStand, push } from '../src/game/logic'
import { solve, solveFrom } from './solver'

declare const process: { exitCode?: number }

let failures = 0
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? '  ok ' : 'FAIL '} ${msg}`)
  if (!cond) failures++
}
const throws = (fn: () => unknown) => {
  try {
    fn()
    return false
  } catch {
    return true
  }
}

console.log('rules')
{
  const lvl = parseLevel('t', ['#####', '#@B.#', '#..P#', '#####'])
  const s = createState(lvl)
  const r = push(s, 0, 'E')
  ok(r.moved && r.path.length === 1 && r.state.blocks[0].x === 3, 'block slides until the wall')
  ok(!push(r.state, 0, 'E').moved, 'a block against a wall cannot move')
  ok(r.state.moves === 1 && s.moves === 0, 'push counts a move and does not mutate the old state')

  const step = parseLevel('t', ['#####', '#.B@#', '#..P#', '#####'])
  ok(createState(step).level.tiles[0][0] === '#' && playerCanStand(createState(step), { x: 0, y: 0 }), 'the player can stand on a step (#)')
  const wall = parseLevel('t', ['WWWWW', 'W@.BW', 'W..PW', 'WWWWW'])
  ok(!playerCanStand(createState(wall), { x: 0, y: 0 }) && !push(createState(wall), 0, 'E').moved, 'a full wall (W) blocks the player and blocks')

  const hole = parseLevel('t', ['######', '#@B.O#', '#...P#', '######'])
  const h = push(createState(hole), 0, 'E')
  ok(h.moved && h.fell && h.path[h.path.length - 1].x === 4, 'sliding into a hole makes the block fall')

  const two = parseLevel('t', ['#######', '#.BB..#', '#@..PP#', '#######'])
  const t = push(createState(two), 1, 'E')
  ok(t.state.blocks[1].x === 5, 'block slides to the wall')
  const stop = push(createState(two), 0, 'E')
  ok(!stop.moved, 'a block cannot slide into another block')

  const win = parseLevel('t', ['#####', '#@B.#', '#..P#', '#####'])
  const w = push(createState(win), 0, 'E')
  ok(!isSolved(w.state), 'sliding past a plate does not solve it unless the block stops there')
}

console.log('new tiles')
{
  const snow = parseLevel('t', ['#######', '#@B.N.#', '#....P#', '#######'])
  const sn = push(createState(snow), 0, 'E')
  ok(sn.state.blocks[0].x === 4, 'a snow patch stops the block on it')

  const arrow = parseLevel('t', ['#######', '#@B.v.#', '#...P.#', '#.....#', '#######'])
  const ar = push(createState(arrow), 0, 'E')
  ok(ar.state.blocks[0].x === 4 && ar.state.blocks[0].y === 3, 'an arrow turns the sliding block and it keeps going')
  ok(ar.path.length === 4, 'the path follows the turn (2 east, then 2 south)')

  const loop = parseLevel('t', ['#######', '#@B>.v#', '#..P..#', '#^...<#', '#######'])
  const lp = push(createState(loop), 0, 'E')
  ok(lp.moved, 'an arrow loop does not hang the solver (capped)')

  const fan = parseLevel('t', ['#########', '#@B....r#', '#...P...#', '#########'])
  const fn = push(createState(fan), 0, 'E')
  ok(fn.state.blocks[0].x === 6, 'plain slide stops against the fan (a fan is solid)')

  const wind = parseLevel('t', ['#######', '#@Bl..#', '#.....#', '#..P..#', '#######'])
  ok(!push(createState(wind), 0, 'E').moved, 'a block next to a fan cannot be pushed into it')

  // The block stops in the fan's lane against the north wall, then the wind carries it east onto the plate.
  const launch = parseLevel('t', ['#########', '#r.....P#', '#..B....#', '#..@....#', '#########'])
  const la = push(createState(launch), 0, 'N')
  ok(la.state.blocks[0].x === 7 && la.state.blocks[0].y === 1, 'a block that comes to rest in a fan lane is blown along it')
  ok(la.path.length === 5 && isSolved(la.state), 'the path includes the wind leg, and the plate is covered')

  // A static cube stops the block just below the lane, so there is no wind.
  const outside = parseLevel('t', ['#########', '#r.S...P#', '#.......#', '#..B....#', '#..@....#', '#########'])
  const out = push(createState(outside), 0, 'N')
  ok(out.state.blocks[0].x === 3 && out.state.blocks[0].y === 2, 'a block that stops outside the lane is not blown')

  // The wind acts on any block that ENTERS the lane, not only on one that stops there.
  // A block sliding east along row 3 crosses the lane of the fan above (column 3) and is pushed south.
  const crossing = parseLevel('t', ['#######', '#..d..#', '#....P#', '#@B...#', '#.....#', '#######'])
  const cr = push(createState(crossing), 0, 'E')
  ok(cr.state.blocks[0].x === 3 && cr.state.blocks[0].y === 4, 'a block crossing the wind lane is pushed along it (and slides to the end of the lane)')
  ok(cr.path.map((p) => `${p.x},${p.y}`).join(' ') === '3,3 3,4', 'the path turns with the wind at the lane')
  // A block that never touches the lane is unaffected.
  const beside = parseLevel('t', ['#######', '#d....#', '#....P#', '#@B...#', '#.....#', '#######'])
  const bs = push(createState(beside), 0, 'E')
  ok(bs.state.blocks[0].x === 5 && bs.state.blocks[0].y === 3, 'a block sliding along a row the lane does not cross is unaffected')
  // Pushed toward the fan, a block entering the lane is blown back out.
  const against = parseLevel('t', ['#######', '#..d..#', '#....P#', '#@....#', '#..B..#', '#######'])
  const ag = push(createState(against), 0, 'N')
  ok(ag.state.blocks[0].x === 3 && ag.state.blocks[0].y === 4, 'a block pushed toward the fan is blown back along the wind')
  // The lane stops at the first solid tile, so a block beyond it is not affected.
  const blocked = parseLevel('t', ['#########', '#..d....#', '#..S...P#', '#@......#', '#.B.....#', '#########'])
  const bk = push(createState(blocked), 0, 'E')
  ok(bk.state.blocks[0].x === 7 && bk.state.blocks[0].y === 4, 'a cube in front of the fan stops the lane (no wind past it)')
}

console.log('level code')
{
  const rows = ['#######', '#....P#', '#.....#', '#..B..#', '#.....#', '#@....#', '#######']
  const code = encodeLevelCode(rows)
  console.log(`       ${code}`)
  ok(JSON.stringify(decodeLevelCode(code)) === JSON.stringify(rows), 'encode -> decode round-trips')
  ok(encodeLevelCode(rows) === code, 'encoding is deterministic')
  ok(throws(() => decodeLevelCode(code.slice(0, -3))), 'a cut-off code is rejected')
  ok(throws(() => decodeLevelCode(code.replace('#.4P#', '#.3P#'))), 'a typo is rejected by the checksum')
  ok(throws(() => decodeLevelCode('hello')), 'garbage is rejected')
  const sloppy = ' ' + code.slice(0, -4) + code.slice(-4).toLowerCase() + '\n'
  ok(decodeLevelCode(sloppy).length === 7, 'surrounding whitespace and a lowercase checksum are tolerated')
}

console.log('levels')
LEVELS.forEach((level, i) => {
  const sol = solve(level)
  const tag = `level ${i + 1} "${level.name}"`
  ok(sol.solvable, `${tag} is solvable${sol.solvable ? ` in ${sol.pushes} pushes` : sol.truncated ? ' (search limit hit)' : ''}`)
  if (sol.solvable) console.log(`       ${sol.steps.map((s) => `${s.block.x},${s.block.y}${s.dir}`).join('  ')}`)
  console.log(`       ${levelCode(level)}`)
})

console.log('editor operations')
{
  ok(JSON.stringify(floodFill(['#####', '#...#', '#.#.#', '#...#', '#####'], 1, 1, 'O')) === JSON.stringify(['#####', '#OOO#', '#O#O#', '#OOO#', '#####']), 'flood fill replaces a connected region and stops at walls')
  ok(JSON.stringify(fillRect(['.....', '.....', '.....'], 3, 2, 1, 0, 'W')) === JSON.stringify(['.WWW.', '.WWW.', '.WWW.']), 'rectangle fill works with corners in any order')
  ok(JSON.stringify(rotateRight(['xy.', 'zp.'])) === JSON.stringify(['zx', 'py', '..']), 'rotate turns the grid a quarter clockwise')
  ok(JSON.stringify(rotateRight(rotateRight(rotateRight(rotateRight(['#^>', 'vu.']))))) === JSON.stringify(['#^>', 'vu.']), 'four rotations come back to the start')
  ok(JSON.stringify(rotateRight(['>^'])) === JSON.stringify(['v', '>']), 'rotating turns arrows with the grid')
  // The strongest check: a mirrored or rotated level plays identically, so its minimum push count must not change.
  // This would fail if any arrow or fan were turned the wrong way.
  for (const [i, level] of LEVELS.entries()) {
    const base = solve(level).pushes
    const variants: [string, string[]][] = [['flipped left-right', flipHorizontal(level.rows)], ['flipped top-bottom', flipVertical(level.rows)], ['rotated', rotateRight(level.rows)]]
    for (const [name, rows] of variants) {
      const p = solve(parseLevel('v', rows)).pushes
      ok(p === base, `level ${i + 1} ${name}: still ${base} pushes${p === base ? '' : ` (got ${p})`}`)
    }
  }
}

console.log('growing and shrinking')
{
  const base = ['#######', '#.....#', '#..B..#', '#.P..@#', '#######']
  for (const edge of ['N', 'S', 'E', 'W'] as const) {
    const grown = growEdgeRows(base, edge, 1)
    ok(JSON.stringify(growEdgeRows(grown, edge, -1)) === JSON.stringify(base), `growing the ${edge} edge then shrinking it gives the original back`)
    const w = grown[0].length
    const ringOk = grown[0] === '#'.repeat(w) && grown[grown.length - 1] === '#'.repeat(w) && grown.every((r) => r[0] === '#' && r[w - 1] === '#')
    ok(ringOk && grown.length * w > base.length * base[0].length, `growing the ${edge} edge keeps the border ring and adds ice inside it`)
  }
  // an exit step on the border must stay on the border whichever edge grows
  const lvl = ['#######', '#.....#', '#..B..#', '#.P..@#', '###E###']
  for (const edge of ['N', 'S', 'E', 'W'] as const) {
    const g = growEdgeRows(lvl, edge, 1)
    const onBorder = parseLevel('g', g).exit
    ok(onBorder !== null, `an exit step on the border is still a valid exit after growing the ${edge} edge`)
  }
}

console.log('hint (solve from any position)')
{
  const lvl = LEVELS[0]
  const afterFirst = push(createState(lvl), 0, 'N').state // block goes north to the wall; one push (east) remains
  const rest = solveFrom(afterFirst, { x: 3, y: 3 })
  ok(rest.solvable && rest.pushes === 1, 'after one push of the optimal solution, one push is left')
  const solved = push(afterFirst, 0, 'E').state
  const none = solveFrom(solved, { x: 2, y: 1 })
  ok(none.solvable && none.pushes === 0 && none.steps.length === 0, 'a finished position needs no more pushes')
}

console.log('introductory levels need no border steps')
// Levels meant to teach a new idea must be solvable from open floor alone (border steps turned into walls, exit kept).
for (const n of [1, 14]) {
  const level = LEVELS[n - 1]
  const sol = solve(parseLevel('f', level.rows.map((r) => r.replace(/#/g, 'W'))))
  ok(sol.solvable, `level ${n} "${level.name}" is solvable without standing on a border step${sol.solvable ? ` (${sol.pushes} pushes)` : ''}`)
}

console.log('special tiles are used')
LEVELS.forEach((level, i) => {
  const rows = level.rows
  const sol = solve(level)
  const plain = (re: RegExp, repl: string) => solve(parseLevel('p', rows.map((r) => r.replace(re, repl))))
  const differs = (p: ReturnType<typeof solve>) => !p.solvable || p.pushes !== sol.pushes
  const tag = `level ${i + 1} "${level.name}"`
  ok(level.exit !== null, `${tag} has an exit door`)
  if (/[urdl]/.test(rows.join(''))) ok(differs(plain(/[urdl]/g, 'S')), `${tag}: the fan's wind matters (not just a solid block)`)
  if (/[>v<^]/.test(rows.join(''))) ok(differs(plain(/[>v<^]/g, '.')), `${tag}: the arrows matter`)
  if (rows.join('').includes('N')) ok(differs(plain(/N/g, '.')), `${tag}: the snow matters`)
  if (rows.join('').includes('F')) ok(differs(plain(/F/g, 'O')), `${tag}: the pit has to be filled (as a deadly hole the level is unsolvable or longer)`)
})

console.log('solver')
{
  // Full walls: the only block sits in a corner pocket and can never be pushed out.
  const stuck = parseLevel('stuck', ['WWWWW', 'WB..W', 'W...W', 'W@.PW', 'WWWWW'])
  const sol = solve(stuck)
  ok(!sol.solvable && !sol.truncated, 'an unwinnable level is reported as unsolvable')
  // The same corner with steps (#) is winnable: the player climbs the ledge and pushes from behind.
  const ledge = parseLevel('ledge', ['#####', '#B..#', '#...#', '#@.P#', '#####'])
  ok(solve(ledge).solvable, 'a corner block is rescuable when the walls are steps')
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed')
process.exitCode = failures ? 1 : 0
