// Level generator: random layouts for a difficulty profile, each checked by the solver.
//   node tools/run.mjs tools/gen.ts <blocks> <statics> <holes> <minPushes> <maxPushes> [size=7] [count=6] [seed=1] [snow=0] [arrows=0] [fans=0] [pits=0]
//   <blocks> is the number of plates; each fillable pit adds one extra block so the level can still be won.
// Prints the best candidates (most pushes first). A human still picks the ones that look and feel good.

import { parseLevel } from '../src/game/grid'
import { encodeLevelCode } from '../src/game/levelCode'
import { solve } from './solver'

declare const process: { argv: string[] }

const [blocks, statics, holes, minP, maxP, size = 7, count = 6, seed = 1, snow = 0, arrows = 0, fans = 0, pits = 0] = process.argv.slice(2).map(Number)
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
        if (snow + arrows + fans + pits > 0) {
          // a fan is solid, so its stand-in is a static cube: that isolates what the WIND adds
          const plain = solve(parseLevel('gen', rows.map((r) => r.replace(/[NF^>v<]/g, '.').replace(/[urdl]/g, 'S'))), 200_000)
          if (plain.solvable && plain.pushes === sol.pushes) continue
        }
        found.push({ pushes: sol.pushes, rows })
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
