// Level generator: random layouts for a difficulty profile, each checked by the solver.
//   node tools/run.mjs tools/gen.ts <blocks> <statics> <holes> <minPushes> <maxPushes> [size=7] [count=6] [seed=1] [snow=0] [arrows=0] [fans=0] [pits=0] [easy=0]
//   easy=1 keeps only levels solvable WITHOUT standing on a border step (#), where the pit is still needed and every
//   standing spot has open floor on at least two sides (no pockets). For introductory levels.
//   <blocks> is the number of plates; each fillable pit adds one extra block so the level can still be won.
// Prints the best candidates (most pushes first). A human still picks the ones that look and feel good.

import { parseLevel } from '../src/game/grid'
import { encodeLevelCode } from '../src/game/levelCode'
import { DIR_DELTA } from '../src/game/grid'
import { blockAt, createState, playerCanStand, push } from '../src/game/logic'
import { solve } from './solver'

declare const process: { argv: string[] }

const [blocks, statics, holes, minP, maxP, size = 7, count = 6, seed = 1, snow = 0, arrows = 0, fans = 0, pits = 0, easy = 0] = process.argv.slice(2).map(Number)
if ([blocks, statics, holes, minP, maxP].some((n) => Number.isNaN(n))) {
  console.log('usage: gen.ts <blocks> <statics> <holes> <minPushes> <maxPushes> [size=7] [count=6] [seed=1] [snow] [arrows] [fans]')
} else {
  let s = seed >>> 0 || 1
  const rnd = (n: number) => {
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s % n
  }

  const found: { pushes: number; rows: string[] }[] = []
  const seen = new Set<string>()
  for (let attempt = 0; attempt < 20000 && found.length < count * 4; attempt++) {
    const grid: string[][] = []
    for (let y = 0; y < size; y++) {
      grid.push([])
      for (let x = 0; x < size; x++) grid[y].push(x === 0 || y === 0 || x === size - 1 || y === size - 1 ? '#' : '.')
    }
    const free = () => {
      for (;;) {
        const x = 1 + rnd(size - 2)
        const y = 1 + rnd(size - 2)
        if (grid[y][x] === '.') return { x, y }
      }
    }
    const put = (ch: string, n: number) => {
      for (let i = 0; i < n; i++) {
        const p = free()
        grid[p.y][p.x] = ch
      }
    }
    put('S', statics)
    put('N', snow)
    for (let i = 0; i < arrows; i++) put('^>v<'[rnd(4)], 1)
    for (let i = 0; i < fans; i++) put('urdl'[rnd(4)], 1)
    put('O', holes)
    put('P', blocks)
    put('B', blocks + pits)
    put('F', pits)
    put('@', 1)
    const rows = grid.map((r) => r.join(''))
    const key = rows.join('/')
    if (seen.has(key)) continue
    seen.add(key)
    try {
      const sol = solve(parseLevel('gen', rows), 200_000)
      if (sol.solvable && sol.pushes >= minP && sol.pushes <= maxP) {
        // when the profile uses special tiles, keep only levels where they change the answer (not decoration)
        // a pit must be needed: if it were a deadly hole instead, the level must be unsolvable or need more pushes
        if (pits > 0) {
          const asHole = solve(parseLevel('gen', rows.map((r) => r.replace(/F/g, 'O'))), 200_000)
          if (asHole.solvable && asHole.pushes <= sol.pushes) continue
        }
        if (snow + arrows + fans + pits > 0) {
          // a fan is solid, so its stand-in is a static cube: that isolates what the WIND adds
          const plain = solve(parseLevel('gen', rows.map((r) => r.replace(/[NF^>v<]/g, '.').replace(/[urdl]/g, 'S'))), 200_000)
          if (plain.solvable && plain.pushes === sol.pushes) continue
        }
        let pushes = sol.pushes
        if (easy) {
          // the same level with the border steps turned into walls: nothing may need them
          const lf = parseLevel('gen', rows.map((r) => r.replace(/#/g, 'W')))
          const s2 = solve(lf, 200_000)
          if (!s2.solvable || s2.pushes > maxP || s2.pushes < minP) continue
          if (pits > 0) {
            const hole = solve(parseLevel('gen', rows.map((r) => r.replace(/#/g, 'W').replace(/F/g, 'O'))), 200_000)
            if (hole.solvable && hole.pushes <= s2.pushes) continue
          }
          // every standing spot needs open floor on at least two sides
          let st = createState(lf)
          let open = true
          for (const step of s2.steps) {
            const d = DIR_DELTA[step.dir]
            const stand = { x: step.block.x - d.x, y: step.block.y - d.y }
            let free = 0
            for (const n of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
              if (playerCanStand(st, { x: stand.x + n.x, y: stand.y + n.y })) free++
            }
            if (free < 2) open = false
            st = push(st, blockAt(st, step.block), step.dir).state
          }
          if (!open) continue
          pushes = s2.pushes
        }
        found.push({ pushes, rows })
      }
    } catch {
      /* invalid layout, skip */
    }
  }
  found.sort((a, b) => b.pushes - a.pushes)
  found.slice(0, count).forEach((f, i) => {
    console.log(`\n#${i + 1}  ${f.pushes} pushes`)
    console.log(f.rows.join('\n'))
    console.log(encodeLevelCode(f.rows))
  })
  if (!found.length) console.log('no candidates in range, try a wider push range or more obstacles')
}
