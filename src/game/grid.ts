// Pure grid types and the ASCII level format. No SDK imports, so tools/ can run this in Node.
//
// Legend (what you see in a level file / level code):
//   #  step (low ledge: stops blocks, the player can climb on it and push from it)
//   W  full wall (stops blocks AND the player)
//   .  ice floor    O  hole (block or player falling in resets the level)
//   P  pressure plate    S  static cube    B  movable block (on ice)    @  player start (on ice)
//   E  exit door (at most one): sealed until every plate is covered, then you finish by walking through it.
//      Put it on the border next to a floor tile. A level with no E is finished as soon as the plates are covered.
//   F  fillable pit: the first block that slides in is used up and fills it; after that it is plain floor
//   N  snow patch: a sliding block that enters it stops there
//   ^ > v <  arrow: a sliding block that enters it turns to face the arrow and keeps sliding
//   u r d l  fan (up/right/down/left = north/east/south/west): a solid device. When a block comes to rest in its wind
//            lane (the line it faces, up to the first obstacle), the wind pushes that block away from the fan.
// Row 0 is the NORTH edge, so a level reads like a map seen from above.

export interface Pt {
  x: number // column
  y: number // row (0 = north)
}

export type Dir = 'N' | 'E' | 'S' | 'W'
export const DIRS: Dir[] = ['N', 'E', 'S', 'W']
export const DIR_DELTA: Record<Dir, Pt> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 }
}

// Static tiles only. Blocks and the start are separate so a tile is always one of these.
export type Tile = '#' | 'W' | '.' | 'O' | 'P' | 'S' | 'N' | 'F' | 'E' | '^' | '>' | 'v' | '<' | 'u' | 'r' | 'd' | 'l'

export const ARROW_DIR: Record<string, Dir> = { '^': 'N', '>': 'E', v: 'S', '<': 'W' }
export const FAN_DIR: Record<string, Dir> = { u: 'N', r: 'E', d: 'S', l: 'W' }

export interface Level {
  name: string
  width: number
  height: number
  rows: string[] // the original ASCII, kept as the source of truth for the level code
  tiles: Tile[][] // tiles[y][x]
  blocks: Pt[] // movable block start positions
  plates: Pt[]
  fans: { x: number; y: number; dir: Dir }[]
  exit: Pt | null // the exit door, if the level has one
  start: Pt
}

const TILE_CHARS = '#W.OPSNFE^>v<urdl'

export function parseLevel(name: string, rows: string[]): Level {
  if (rows.length < 3) throw new Error('level needs at least 3 rows')
  const width = rows[0].length
  const tiles: Tile[][] = []
  const blocks: Pt[] = []
  const plates: Pt[] = []
  const fans: Level['fans'] = []
  let exit: Pt | null = null
  let start: Pt | null = null

  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`row ${y} is ${row.length} wide, expected ${width}`)
    const line: Tile[] = []
    for (let x = 0; x < width; x++) {
      const ch = row[x]
      if (ch === 'B') {
        blocks.push({ x, y })
        line.push('.')
      } else if (ch === '@') {
        if (start) throw new Error('more than one player start (@)')
        start = { x, y }
        line.push('.')
      } else if (TILE_CHARS.includes(ch)) {
        if (ch === 'P') plates.push({ x, y })
        if (FAN_DIR[ch]) fans.push({ x, y, dir: FAN_DIR[ch] })
        if (ch === 'E') {
          if (exit) throw new Error('more than one exit door (E)')
          exit = { x, y }
        }
        line.push(ch as Tile)
      } else {
        throw new Error(`unknown tile '${ch}' at ${x},${y}`)
      }
    }
    tiles.push(line)
  })

  if (!start) throw new Error('level has no player start (@)')
  if (plates.length === 0) throw new Error('level has no pressure plate (P)')
  if (blocks.length < plates.length) throw new Error(`${plates.length} plates but only ${blocks.length} blocks`)

  return { name, width, height: rows.length, rows: rows.slice(), tiles, blocks, plates, fans, exit, start }
}
