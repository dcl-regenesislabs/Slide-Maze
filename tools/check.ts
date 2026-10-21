// Checks the game rules, the level-code format, and that every committed level is solvable.
//   node tools/run.mjs tools/check.ts            (needs Node 22: nvm use 22)
// Exits non-zero on any failure, so it can gate commits / CI.

import { parseLevel } from '../src/game/grid'
import { decodeLevelCode, encodeLevelCode } from '../src/game/levelCode'
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

  // A second block in the lane shields what is behind it.
  const shield = parseLevel('t', ['#########', '#r.B...P#', '#.......#', '#...B...#', '#...@...#', '#########'])
  const sh = push(createState(shield), 1, 'N')
  ok(sh.state.blocks[1].x === 4 && sh.state.blocks[1].y === 1, 'a block behind another in the lane is not blown')
}

console.log('fillable pit')
{
  // The first block fills the pit and is used up; the second slides across it onto the plate.
  const pit = parseLevel('t', ['########', '#@BBF.P#', '#......#', '########'])
  const st = createState(pit)
  const first = push(st, 1, 'E')
  ok(first.consumed && !first.fell && first.state.blocks.length === 1 && first.state.filled.length === 1, 'a block that slides into a pit fills it and is used up')
  ok(first.state.moves === 1, 'filling a pit counts as a push')
  const second = push(first.state, 0, 'E')
  ok(second.moved && !second.consumed && second.state.blocks[0].x === 6, 'once filled, blocks slide across the pit')
  ok(isSolved(second.state), 'and the plate is covered')
  ok(playerCanStand(first.state, { x: 4, y: 1 }) && !playerCanStand(st, { x: 4, y: 1 }), 'the player can only cross a pit once it is filled')
  ok(solve(pit).solvable && solve(pit).pushes === 3, 'the solver understands pits (fill, then slide the next block)')
  const short = parseLevel('t', ['WWWWWWWW', 'W@B.F.PW', 'WWWWWWWW'])
  ok(!solve(short).solvable, 'in a sealed corridor with one block, the pit eats it and the plate can never be covered')
}

console.log('exit door')
{
  ok(parseLevel('t', ['WEWWWW', 'W.P..W', 'W.B..W', 'W@...W', 'WWWWWW']).exit?.x === 1, 'a level can have an exit door (E)')
  ok(throws(() => parseLevel('t', ['WEEWWW', 'W.P..W', 'W.B..W', 'W@...W', 'WWWWWW'])), 'two exit doors are rejected')
  ok(parseLevel('t', ['WWWWW', 'W@BPW', 'WWWWW']).exit === null, 'a level with no door has exit = null')

  // The block covers the plate in front of the door and seals it, so the level cannot be finished.
  const sealed = ['WEWWWW', 'WP...W', 'W.B..W', 'W@...W', 'WWWWWW']
  ok(solve(parseLevel('t', sealed.map((r) => r.replace('E', 'W')))).pushes === 2, 'sanity: without a door the same level is solved in 2 pushes')
  ok(!solve(parseLevel('t', sealed)).solvable, 'the plate sits in front of the door, so covering it blocks the way out')

  // Plate moved aside: the door stays reachable.
  const open = parseLevel('t', ['WEWWWW', 'W.P..W', 'W.B..W', 'W@...W', 'WWWWWW'])
  const sol = solve(open)
  ok(sol.solvable && sol.pushes === 1, 'with the plate beside the door the level is solvable')
  const done = push(createState(open), 0, 'N')
  ok(isSolved(done.state) && canReachExit(done.state, open.start), 'after covering the plate the player can reach the door')
  ok(!playerCanStand(createState(open), { x: 1, y: 0 }), 'the door tile itself is not standable (it is where you exit)')
  const toDoor = push(createState(parseLevel('t', ['WEWWW', 'W.P.W', 'WB@.W', 'WWWWW'])), 0, 'N')
  ok(toDoor.moved && toDoor.state.blocks[0].x === 1 && toDoor.state.blocks[0].y === 1, 'a block sliding at the door stops in front of it')
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
  if (rows.join('').includes('F')) ok(differs(plain(/F/g, '.')), `${tag}: the pit matters`)
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
