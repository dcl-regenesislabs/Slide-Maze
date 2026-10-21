// Pure grid operations for the level editor (no SDK imports, so tools/check.ts can test them against every level).
// A grid is an array of ASCII rows, see grid.ts for the legend.

const TURN_RIGHT: Record<string, string> = { '^': '>', '>': 'v', v: '<', '<': '^', u: 'r', r: 'd', d: 'l', l: 'u' }
const FLIP_X: Record<string, string> = { '>': '<', '<': '>', r: 'l', l: 'r' }
const FLIP_Y: Record<string, string> = { '^': 'v', v: '^', u: 'd', d: 'u' }

const toCells = (rows: string[]) => rows.map((r) => r.split(''))
const fromCells = (cells: string[][]) => cells.map((r) => r.join(''))

/** Replace the connected region (4-neighbour) of identical tiles around (x, y) with `ch`. */
export function floodFill(rows: string[], x: number, y: number, ch: string): string[] {
  const cells = toCells(rows)
  const target = cells[y][x]
  if (target === ch) return rows
  const stack = [{ x, y }]
  while (stack.length) {
    const p = stack.pop() as { x: number; y: number }
    if (p.y < 0 || p.y >= cells.length || p.x < 0 || p.x >= cells[0].length || cells[p.y][p.x] !== target) continue
    cells[p.y][p.x] = ch
    stack.push({ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 })
  }
  return fromCells(cells)
}

/** Fill the rectangle between two corners (inclusive, in any order). */
export function fillRect(rows: string[], x0: number, y0: number, x1: number, y1: number, ch: string): string[] {
  const cells = toCells(rows)
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) cells[y][x] = ch
  }
  return fromCells(cells)
}

/** Mirror left to right. East and west arrows and fans swap. */
export const flipHorizontal = (rows: string[]): string[] =>
  rows.map((r) => r.split('').reverse().map((c) => FLIP_X[c] ?? c).join(''))

/** Mirror top to bottom. North and south arrows and fans swap. */
export const flipVertical = (rows: string[]): string[] =>
  rows.slice().reverse().map((r) => r.split('').map((c) => FLIP_Y[c] ?? c).join(''))

/** Rotate a quarter turn clockwise. The grid becomes height x width, and arrows and fans turn with it. */
export function rotateRight(rows: string[]): string[] {
  const h = rows.length
  const w = rows[0].length
  const out: string[] = []
  for (let x = 0; x < w; x++) {
    let line = ''
    for (let y = h - 1; y >= 0; y--) line += TURN_RIGHT[rows[y][x]] ?? rows[y][x]
    out.push(line)
  }
  return out
}
