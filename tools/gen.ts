// Level generator: finds levels for a difficulty profile, each checked by the real solver.
//   node tools/run.mjs tools/gen.ts <plates> <statics> <holes> <minPushes> <maxPushes> [size=7] [count=6] [seed=1]
//        [snow=0] [arrows=0] [fans=0] [pits=0] [mode=0] [seconds=120]
//
// <plates> is the number of plates (and of blocks); each fillable pit adds one extra block so the level can be won.
//
// How it searches: it finds any solvable layout, then repeatedly MUTATES it (moves one object) and keeps changes that
// move it toward the target push range and the rules below. This reaches hard levels far faster than random layouts.
//
// Rules every candidate must pass (all measured with the real solver):
//   - solvable, with the fewest pushes inside [minPushes, maxPushes]
//   - every special tile TYPE in the profile must matter on its own: snow, arrows and the fan's wind must change the
//     answer when removed (a fan is compared with a plain static cube, since a solid fan alone changes things), and a
//     pit must be NEEDED (as a deadly hole the level must be unsolvable or longer)
// mode:
//   0  just the rules above
//   1  also solvable WITHOUT standing on a border step (#), with every standing spot open on two sides. For intros.
//   2  also "no pockets": every required standing spot on the floor has at least two open floor neighbours, and at
//      most half of the pushes are made from border steps. Border pushes stay allowed, awkward ones do not.
// Stops after `seconds` and prints the best candidates (most pushes first). A human still picks the ones that look good.

import { DIR_DELTA, parseLevel } from '../src/game/grid'
import { encodeLevelCode } from '../src/game/levelCode'
import { blockAt, createState, playerCanStand, push } from '../src/game/logic'
import { solve } from './solver'

declare const process: { argv: string[] }

const [plates, statics, holes, minP, maxP, size = 7, count = 6, seed = 1, snow = 0, arrows = 0, fans = 0, pits = 0, mode = 0, seconds = 120] = process.argv.slice(2).map(Number)
if ([plates, statics, holes, minP, maxP].some((n) => Number.isNaN(n))) {
  console.log('usage: gen.ts <plates> <statics> <holes> <minPushes> <maxPushes> [size] [count] [seed] [snow] [arrows] [fans] [pits] [mode] [seconds]')
} else {
  const LIMIT = 80_000 // while climbing
  const START_LIMIT = 12_000 // while hunting for a first solvable layout: give up on hard ones fast
  let limit = START_LIMIT
  let s = seed >>> 0 || 1
  const rnd = (n: number) => {
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s % n
  }

  const noSteps = (rows: string[]) => rows.map((r) => r.replace(/#/g, 'W'))
  const differs = (rows: string[], base: number, mustBeLonger = false) => {
    const v = solve(parseLevel('v', rows), limit)
    if (v.truncated) return false // cannot tell, so do not trust it
    return !v.solvable || (mustBeLonger ? v.pushes > base : v.pushes !== base)
  }
  const NEIGHBOURS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]

  /** Standing-spot quality of a solution: no pockets, and not too many pushes from border steps. */
  function standsOk(rows: string[], steps: { block: { x: number; y: number }; dir: 'N' | 'E' | 'S' | 'W' }[], allowSteps: boolean): boolean {
    const level = parseLevel('gen', rows)
    let st = createState(level)
    let fromSteps = 0
    for (const step of steps) {
      const d = DIR_DELTA[step.dir]
      const stand = { x: step.block.x - d.x, y: step.block.y - d.y }
      const t = level.tiles[stand.y][stand.x]
      if (t === '#' || t === 'E') {
        fromSteps++ // a border step: allowed in mode 2, with a cap below
      } else {
        // a floor tile: needs two open FLOOR neighbours (steps do not count, they look like walls)
        let open = 0
        for (const n of NEIGHBOURS) {
          const q = { x: stand.x + n.x, y: stand.y + n.y }
          const qt = level.tiles[q.y]?.[q.x]
          if (qt !== '#' && qt !== 'E' && playerCanStand(st, q)) open++
        }
        if (open < 2) return false
      }
      st = push(st, blockAt(st, step.block), step.dir).state
    }
    return allowSteps ? fromSteps <= Math.ceil(steps.length / 2) : fromSteps === 0
  }

  interface Measure {
    pushes: number
    ok: boolean // passes every rule
    fit: number // how good: higher is closer to a valid level
  }

  /** null = not solvable. Otherwise how close to valid it is (the climb maximises `fit`). */
  function measure(rows: string[]): Measure | null {
    const check = mode === 1 ? noSteps(rows) : rows
    const sol = solve(parseLevel('gen', check), limit)
    if (!sol.solvable) return null
    const dist = Math.max(0, minP - sol.pushes, sol.pushes - maxP)
    let fit = -dist * 100
    if (dist > 0) return { pushes: sol.pushes, ok: false, fit }
    fit += 5000
    // each special tile type present must matter on its own
    const checks: boolean[] = []
    if (snow > 0) checks.push(differs(check.map((r) => r.replace(/N/g, '.')), sol.pushes))
    if (arrows > 0) checks.push(differs(check.map((r) => r.replace(/[>v<^]/g, '.')), sol.pushes))
    if (fans > 0) checks.push(differs(check.map((r) => r.replace(/[urdl]/g, 'S')), sol.pushes))
    if (pits > 0) checks.push(differs(check.map((r) => r.replace(/F/g, 'O')), sol.pushes, true))
    fit += checks.filter(Boolean).length * 1000
    if (checks.some((c) => !c)) return { pushes: sol.pushes, ok: false, fit }
    if (mode >= 1 && !standsOk(check, sol.steps, mode === 2)) return { pushes: sol.pushes, ok: false, fit }
    return { pushes: sol.pushes, ok: true, fit: fit + 2000 }
  }

  const grid0 = (): string[][] =>
    Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => (x === 0 || y === 0 || x === size - 1 || y === size - 1 ? '#' : '.')))
  const freeCell = (g: string[][]) => {
    for (;;) {
      const x = 1 + rnd(size - 2)
      const y = 1 + rnd(size - 2)
      if (g[y][x] === '.') return { x, y }
    }
  }
  function randomLayout(): string[] {
    const g = grid0()
    const put = (ch: string, n: number) => {
      for (let i = 0; i < n; i++) {
        const p = freeCell(g)
        g[p.y][p.x] = ch
      }
    }
    put('S', statics)
    put('N', snow)
    for (let i = 0; i < arrows; i++) put('^>v<'[rnd(4)], 1)
    for (let i = 0; i < fans; i++) put('urdl'[rnd(4)], 1)
    put('O', holes)
    put('P', plates)
    put('B', plates + pits)
    put('F', pits)
    put('@', 1)
    return g.map((r) => r.join(''))
  }
  /** Move one object to a free cell, or turn one arrow / fan. Object counts never change. */
  function mutate(rows: string[]): string[] {
    const g = rows.map((r) => r.split(''))
    const objects: { x: number; y: number }[] = []
    for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) if (g[y][x] !== '.') objects.push({ x, y })
    const o = objects[rnd(objects.length)]
    const ch = g[o.y][o.x]
    if ('^>v<'.includes(ch) && rnd(3) === 0) {
      g[o.y][o.x] = '^>v<'[rnd(4)]
    } else if ('urdl'.includes(ch) && rnd(3) === 0) {
      g[o.y][o.x] = 'urdl'[rnd(4)]
    } else {
      g[o.y][o.x] = '.'
      const p = freeCell(g)
      g[p.y][p.x] = ch
    }
    return g.map((r) => r.join(''))
  }

  const found: { pushes: number; rows: string[] }[] = []
  const seen = new Set<string>()
  const deadline = Date.now() + seconds * 1000
  const funnel = { starts: 0, mutations: 0, valid: 0 }
  while (found.length < count * 4 && Date.now() < deadline) {
    // 1) any solvable layout to start from (cheap searches only)
    limit = START_LIMIT
    let cur = randomLayout()
    let m: Measure | null = null
    for (let tries = 0; tries < 400 && !m && Date.now() < deadline; tries++) {
      cur = randomLayout()
      try {
        m = measure(cur)
      } catch {
        m = null
      }
    }
    if (!m) continue
    funnel.starts++
    limit = LIMIT
    // 2) climb: keep mutations that are at least as good
    for (let iter = 0; iter < 250 && Date.now() < deadline; iter++) {
      if (m.ok) {
        const key = cur.join('/')
        if (!seen.has(key)) {
          seen.add(key)
          found.push({ pushes: m.pushes, rows: cur })
          funnel.valid++
        }
        break
      }
      const cand = mutate(cur)
      funnel.mutations++
      let mm: Measure | null = null
      try {
        mm = measure(cand)
      } catch {
        mm = null
      }
      if (mm && mm.fit >= m.fit) {
        cur = cand
        m = mm
      }
    }
  }
  found.sort((a, b) => b.pushes - a.pushes)
  found.slice(0, count).forEach((f, i) => {
    console.log(`\n#${i + 1}  ${f.pushes} pushes`)
    console.log(f.rows.join('\n'))
    console.log(encodeLevelCode(f.rows))
  })
  console.log(`\nsearch: ${JSON.stringify(funnel)}`)
  if (!found.length) console.log('no candidates in range, try a wider push range, fewer obstacles, or more seconds')
}
