// The 3D side of the game (greybox look): spawns a level from data, detects the avatar pushing a block,
// animates the slide, and tells the session when the level is solved. All the rules live in logic.ts.

import { ColliderLayer, engine, Entity, InputAction, Material, MeshCollider, MeshRenderer, pointerEventsSystem, Transform } from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { copyToClipboard, movePlayerTo } from '~system/RestrictedActions'
import { FX_COLORS, clearFx, confetti, dust, holeBurst, plateOn, setupFx, stopBurst, trail, windStreak } from './fx'
import { buildLobby, LOBBY_SPAWN } from './lobby'
import { ARROW_DIR, DIRS, DIR_DELTA, Dir, FAN_DIR, Level, Pt } from './grid'
import { LEVELS, levelCode } from './levels'
import { GameState, createState, isPlateCovered, isSolved, push } from './logic'
import { editor, progress, session } from './session'

// ---- Tuning (metres, seconds) ----
const TILE = 3 // one grid tile
const ELEV = 12 // the whole level floats this many metres above the ground, so holes and edges are real drops
const FLOOR_THICK = 0.5 // thickness of the ice slab
const FLOOR_TOP = ELEV + FLOOR_THICK // absolute height of the ice surface
const BLOCK_SIZE = 2.7
const STEP_HEIGHT = 0.2 // a '#' tile is a ledge this far above the ice: low enough to jump onto easily
const WALL_HEIGHT = 3.6 // a 'W' tile is a full wall
const SLIDE_SPEED = 18 // m/s while a block slides
const PUSH_REACH = 0.75 // how far past the block face the avatar may be and still count as touching it
const PUSH_MIN_SPEED = 1.2 // m/s toward the block, sampled over the last PUSH_WINDOW, that counts as a deliberate push
const PUSH_WINDOW = 0.3
const PUSH_WINDUP = 0.6 // seconds the avatar must keep pressing against the face before the block starts to slide
const PUSH_COOLDOWN = 0.25 // pause after a slide ends before the next push can start
const FALL_RESET_DELAY = 0.7
const BOUNCE_TIME = 0.25 // seconds of squash-and-stretch when a block comes to rest
const ORIGIN = Vector3.create(64, 0, 64) // world position of the level's centre (scene is 8x8 parcels = 128 m)

// ---- Look ----
const ICE_A = Color4.create(0.72, 0.89, 0.98, 1)
const ICE_B = Color4.create(0.64, 0.82, 0.95, 1) // alternate tiles give a faint checker so tiles stay readable
const WALL = Color4.create(0.17, 0.22, 0.33, 1)
const STEP = Color4.create(0.3, 0.4, 0.55, 1) // lighter than a full wall so it reads as something you can climb
const STATIC = Color4.create(0.3, 0.36, 0.42, 1)
const MOVABLE = Color4.create(1, 0.55, 0.15, 1) // warm orange vs the cold level, so movable never looks like static
const PIT = Color4.create(0.02, 0.04, 0.08, 1)
const PLATE_OFF = Color4.create(0.95, 0.75, 0.2, 1)
const PLATE_ON = Color4.create(0.3, 1, 0.55, 1)
const PIT_LIP = Color4.create(1, 0.7, 0.2, 1) // amber lip: this hole can be filled (a plain hole has no lip)
const PATCH = Color4.create(0.85, 0.8, 0.62, 1) // the floor that appears once a pit is filled
const SNOW = Color4.create(0.97, 0.99, 1, 1)
const ARROW = Color4.create(0.2, 0.9, 1, 1)
const FAN_BODY = Color4.create(0.2, 0.25, 0.32, 1)
const FAN_BLADE = Color4.create(0.85, 0.95, 1, 1)
const FX_AMBER = FX_COLORS.amber
const DOOR_LEAF = Color4.create(0.28, 0.36, 0.5, 1)
const DOOR_RUNE = Color4.create(0.3, 0.9, 1, 1)

interface Slide {
  index: number
  pts: Vector3[] // block centre at the start, then at every tile it passes (the path may turn)
  lens: number[] // length of each leg pts[i] -> pts[i + 1]
  to: Vector3 // the last point
  travelled: number
  total: number
  fell: boolean
  consumed: boolean // the block ends in a fillable pit and is used up
  fallT: number // seconds into the fall / sink (only once the slide has reached the hole or pit)
  burst: boolean // the hole effect has been played
  trailT: number
  after: GameState // state once the slide ends
}

interface Runtime {
  level: Level
  state: GameState
  entities: Entity[]
  picks: Entity[] // editor-only: invisible pointer colliders, one per cell, so tiles can be painted from the 3D view
  blocks: Entity[]
  plates: { entity: Entity; pt: Pt; on: boolean }[]
  fans: { x: number; z: number; fx: number; fz: number; len: number }[] // wind lanes, for the wind streaks
  door: { parts: Entity[]; baseY: number[]; open: number; target: boolean; cx: number; cz: number } | null // the exit door
  pits: Record<string, Entity[]> // lip pieces of each open fillable pit, by 'x,y'
  fills: { entity: Entity; t: number; toY: number }[] // floor tiles rising into filled pits
  slide: Slide | null
  bounce: { index: number; t: number } | null
  cooldown: number
  resetIn: number // >0 = counting down to a reset (the player fell)
}

let rt: Runtime | null = null
let active: { level: Level; index: number } = { level: LEVELS[0], index: 0 } // index -1 = a custom (editor) level
let clock = 0
let dustT = 0
const samples: { t: number; vx: number; vz: number }[] = []
let prevPlayer: Vector3 | null = null

/**
 * The effort of a push in progress, for the push animation / sound / dust: `active` is true from the moment the avatar
 * starts leaning on a block until it either slides (the wind-up completed) or the avatar lets go (cancelled).
 * `progress` runs 0 -> 1 over PUSH_WINDUP. `lastEvent` changes to 'slide' or 'cancel' for one frame when it ends.
 */
export const pushEffort: { active: boolean; progress: number; dir: Dir; blockIndex: number; lastEvent: '' | 'slide' | 'cancel' } = {
  active: false,
  progress: 0,
  dir: 'N',
  blockIndex: -1,
  lastEvent: ''
}
let charge: { index: number; dir: Dir; t: number } | null = null

function endCharge(event: 'slide' | 'cancel') {
  charge = null
  pushEffort.active = false
  pushEffort.progress = 0
  pushEffort.blockIndex = -1
  pushEffort.lastEvent = event
}

// ---- Coordinates ----
const tileX = (x: number, level: Level) => ORIGIN.x + (x - (level.width - 1) / 2) * TILE
const tileZ = (y: number, level: Level) => ORIGIN.z + ((level.height - 1) / 2 - y) * TILE // row 0 = north = +z
const tileCentre = (p: Pt, level: Level, y: number) => Vector3.create(tileX(p.x, level), y, tileZ(p.y, level))

// ---- Fan blades (spin) and arrow glyphs ----
const fanBlades: { entity: Entity; yaw: number; phase: number }[] = []
let fanAngle = 0
let windT = 0

function fanSystem(dt: number) {
  fanAngle = (fanAngle + 720 * dt) % 360
  for (const b of fanBlades) {
    Transform.getMutable(b.entity).rotation = Quaternion.fromEulerDegrees(0, b.yaw, fanAngle + b.phase)
  }
  windT += dt
  if (rt && windT > 0.3) {
    windT = 0
    for (const f of rt.fans) {
      if (f.len < 1) continue
      const start = Math.floor(Math.random() * f.len) // a random tile along the lane
      const dist = Math.min(f.len - start, 3) * TILE
      const off = (TILE * 0.5) + start * TILE
      windStreak(f.x + f.fx * off + (Math.random() - 0.5) * 1.2 * Math.abs(f.fz), FLOOR_TOP + 0.4 + Math.random() * 1.6, f.z + f.fz * off + (Math.random() - 0.5) * 1.2 * Math.abs(f.fx), f.fx, f.fz, dist)
    }
  }
}

/** A glowing arrow lying on the ice, pointing along the world direction (fx, fz). */
function arrowGlyph(r: Runtime, c: Vector3, fx: number, fz: number) {
  const yaw = (Math.atan2(fx, fz) * 180) / Math.PI
  const rad = (yaw * Math.PI) / 180
  // local (x = right, z = forward) -> world
  const at = (lx: number, lz: number) =>
    Vector3.create(c.x + lx * Math.cos(rad) + lz * Math.sin(rad), c.y, c.z - lx * Math.sin(rad) + lz * Math.cos(rad))
  const part = (lx: number, lz: number, w: number, l: number, extraYaw: number) => {
    const e = box(r, at(lx, lz), Vector3.create(w, 0.06, l), ARROW, false, { glow: 1.6, roughness: 0.3 })
    Transform.getMutable(e).rotation = Quaternion.fromEulerDegrees(0, yaw + extraYaw, 0)
  }
  part(0, -0.2, 0.36, 1.5, 0) // shaft
  part(-0.42, 0.55, 0.36, 1.0, 45) // head, left bar
  part(0.42, 0.55, 0.36, 1.0, -45) // head, right bar
}

// ---- Building ----
function pbr(entity: Entity, color: Color4, opts: { metallic?: number; roughness?: number; glow?: number } = {}) {
  Material.setPbrMaterial(entity, {
    albedoColor: color,
    metallic: opts.metallic ?? 0,
    roughness: opts.roughness ?? 0.8,
    emissiveColor: opts.glow ? Color3.create(color.r, color.g, color.b) : undefined,
    emissiveIntensity: opts.glow
  })
}

function box(r: Runtime, pos: Vector3, size: Vector3, color: Color4, collider: boolean, opts = {}): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: pos, scale: size })
  MeshRenderer.setBox(e)
  if (collider) MeshCollider.setBox(e, ColliderLayer.CL_PHYSICS)
  pbr(e, color, opts)
  r.entities.push(e)
  return e
}

function clearLevel() {
  fanBlades.length = 0
  if (!rt) return
  for (const e of rt.picks) {
    pointerEventsSystem.removeOnPointerDown(e)
    engine.removeEntity(e)
  }
  for (const e of rt.entities) engine.removeEntity(e)
  rt = null
}

function buildLevel(level: Level, index: number) {
  clearLevel()
  clearFx()
  active = { level, index }
  const r: Runtime = {
    level,
    state: createState(level),
    entities: [],
    picks: [],
    blocks: [],
    plates: [],
    fans: [],
    door: null,
    pits: {},
    fills: [],
    slide: null,
    bounce: null,
    cooldown: 0,
    resetIn: 0
  }
  rt = r

  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const t = level.tiles[y][x]
      const p = { x, y }
      if (t === '#') {
        const h = FLOOR_THICK + STEP_HEIGHT
        box(r, tileCentre(p, level, ELEV + h / 2), Vector3.create(TILE, h, TILE), STEP, true, { roughness: 0.6 })
      } else if (t === 'W') {
        box(r, tileCentre(p, level, ELEV + WALL_HEIGHT / 2), Vector3.create(TILE, WALL_HEIGHT, TILE), WALL, true)
      } else if (FAN_DIR[t]) {
        // a fan is a solid device standing on the ice: dark housing, spinning blades on the face that blows
        const d = DIR_DELTA[FAN_DIR[t]]
        const fx = d.x
        const fz = -d.y
        const c = tileCentre(p, level, 0)
        box(r, tileCentre(p, level, FLOOR_TOP - FLOOR_THICK / 2), Vector3.create(TILE, FLOOR_THICK, TILE), (x + y) % 2 === 0 ? ICE_A : ICE_B, true, { metallic: 0.1, roughness: 0.12 })
        const body = box(r, tileCentre(p, level, FLOOR_TOP + 0.8), Vector3.create(TILE * 0.8, 1.6, TILE * 0.8), FAN_BODY, true, { metallic: 0.4, roughness: 0.4 })
        Transform.getMutable(body).rotation = Quaternion.fromEulerDegrees(0, (Math.atan2(fx, fz) * 180) / Math.PI, 0)
        const yaw = (Math.atan2(fx, fz) * 180) / Math.PI
        const hub = Vector3.create(c.x + fx * (TILE * 0.4 + 0.1), FLOOR_TOP + 0.8, c.z + fz * (TILE * 0.4 + 0.1))
        for (let b = 0; b < 2; b++) {
          const blade = box(r, hub, Vector3.create(TILE * 0.7, 0.2, 0.06), FAN_BLADE, false, { glow: 0.8, roughness: 0.3 })
          fanBlades.push({ entity: blade, yaw, phase: b * 90 })
        }
        // wind lane length (tiles until something solid), for the streaks
        let len = 0
        for (let q = { x: x + d.x, y: y + d.y }; q.x >= 0 && q.y >= 0 && q.x < level.width && q.y < level.height; q = { x: q.x + d.x, y: q.y + d.y }) {
          const lt = level.tiles[q.y][q.x]
          if (lt === '#' || lt === 'W' || lt === 'S' || FAN_DIR[lt]) break
          len++
        }
        r.fans.push({ x: c.x, z: c.z, fx, fz, len })
      } else if (t === 'E') {
        // exit door: a gateway on the ice with two leaves. The leaves sink into the floor once every plate is covered.
        const inward = DIRS.find((d) => {
          const nx = x + DIR_DELTA[d].x
          const ny = y + DIR_DELTA[d].y
          return nx >= 0 && ny >= 0 && nx < level.width && ny < level.height && !['#', 'W', 'E'].includes(level.tiles[ny][nx])
        })
        const spansX = inward === 'N' || inward === 'S' || inward === undefined // the door faces along z, so it spans x
        const c = tileCentre(p, level, 0)
        box(r, tileCentre(p, level, FLOOR_TOP - FLOOR_THICK / 2), Vector3.create(TILE, FLOOR_THICK, TILE), (x + y) % 2 === 0 ? ICE_A : ICE_B, true, { metallic: 0.1, roughness: 0.12 })
        const at = (lat: number, y2: number) => Vector3.create(c.x + (spansX ? lat : 0), y2, c.z + (spansX ? 0 : lat))
        const sz = (lat: number, h: number, thick: number) => (spansX ? Vector3.create(lat, h, thick) : Vector3.create(thick, h, lat))
        for (const side of [-1, 1]) box(r, at(side * (TILE / 2 - 0.3), FLOOR_TOP + 1.9), sz(0.6, 3.8, 0.7), WALL, true) // posts
        box(r, at(0, FLOOR_TOP + 3.5), sz(TILE, 0.6, 0.7), WALL, true) // lintel
        const parts: Entity[] = []
        const baseY: number[] = []
        for (const side of [-1, 1]) {
          const leafY = FLOOR_TOP + 1.6
          parts.push(box(r, at(side * (TILE / 4 - 0.02), leafY), sz(TILE / 2 - 0.3, 3.2, 0.5), DOOR_LEAF, true, { roughness: 0.6 }))
          baseY.push(leafY)
          // a dim rune bar across each leaf; it is what lights up on the real art
          parts.push(box(r, at(side * (TILE / 4 - 0.02), leafY + 0.4), sz(TILE / 2 - 0.9, 0.14, 0.56), DOOR_RUNE, false, { glow: 0.25, roughness: 0.4 }))
          baseY.push(leafY + 0.4)
        }
        r.door = { parts, baseY, open: 0, target: false, cx: c.x, cz: c.z }
      } else if (t === 'O') {
        // no floor at all: the level floats, so a block or the avatar that goes in really drops to the ground below
      } else if (t === 'F') {
        // fillable pit: also no floor, but an amber lip on every side shows that a block can fill it
        const lips: Entity[] = []
        const c = tileCentre(p, level, FLOOR_TOP + 0.06)
        const half = TILE / 2 - 0.09
        for (const [ox, oz, sx, sz] of [[0, half, TILE, 0.18], [0, -half, TILE, 0.18], [half, 0, 0.18, TILE], [-half, 0, 0.18, TILE]]) {
          lips.push(box(r, Vector3.create(c.x + ox, c.y, c.z + oz), Vector3.create(sx, 0.12, sz), PIT_LIP, false, { glow: 0.9, roughness: 0.4 }))
        }
        r.pits[`${x},${y}`] = lips
      } else {
        const ice = (x + y) % 2 === 0 ? ICE_A : ICE_B
        box(r, tileCentre(p, level, FLOOR_TOP - FLOOR_THICK / 2), Vector3.create(TILE, FLOOR_THICK, TILE), ice, true, {
          metallic: 0.1,
          roughness: 0.12
        })
        if (t === 'N') {
          // snow patch: a matte white drift with a few lumps, so it reads as "grippy" against the glossy ice
          box(r, tileCentre(p, level, FLOOR_TOP + 0.06), Vector3.create(TILE * 0.9, 0.12, TILE * 0.9), SNOW, false, { roughness: 1 })
          for (const [ox, oz, s] of [[-0.6, -0.5, 0.5], [0.5, 0.4, 0.6], [0.1, -0.7, 0.35], [-0.4, 0.6, 0.4]]) {
            box(r, Vector3.create(tileX(x, level) + ox, FLOOR_TOP + 0.14, tileZ(y, level) + oz), Vector3.create(s, 0.2, s), SNOW, false, { roughness: 1 })
          }
        } else if (ARROW_DIR[t]) {
          const d = DIR_DELTA[ARROW_DIR[t]]
          arrowGlyph(r, tileCentre(p, level, FLOOR_TOP + 0.05), d.x, -d.y)
        } else if (t === 'P') {
          const plate = box(
            r,
            tileCentre(p, level, FLOOR_TOP + 0.03),
            Vector3.create(TILE * 0.72, 0.06, TILE * 0.72),
            PLATE_OFF,
            false,
            { glow: 0.6 }
          )
          r.plates.push({ entity: plate, pt: p, on: false })
        } else if (t === 'S') {
          box(r, tileCentre(p, level, FLOOR_TOP + BLOCK_SIZE / 2), Vector3.create(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE), STATIC, true, {
            roughness: 0.9
          })
        }
      }
    }
  }

  for (const b of level.blocks) {
    r.blocks.push(
      box(r, tileCentre(b, level, FLOOR_TOP + BLOCK_SIZE / 2), Vector3.create(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE), MOVABLE, true, {
        roughness: 0.35,
        glow: 0.25
      })
    )
  }

  if (editor.open) buildPicks(r)

  session.inLobby = false
  session.unlocked = false
  session.hasDoor = level.exit !== null
  session.levelIndex = index
  session.name = level.name
  session.code = levelCode(level)
  session.moves = 0
  session.startedAt = 0
  session.finishedAt = 0
  session.solved = false
  session.codeOpen = false
  session.menuOpen = false
  samples.length = 0
  charge = null
  pushEffort.active = false
  pushEffort.progress = 0
  pushEffort.blockIndex = -1
  refreshPlates(false)
}

/** Called when a cell is clicked in the 3D view while editing. Set by editor.ts (world must not import the editor). */
let cellClick: ((x: number, y: number) => void) | null = null
export const setCellClickHandler = (fn: (x: number, y: number) => void) => (cellClick = fn)

/** One invisible, pointer-only collider per cell, as tall as what is drawn there, so a click lands on the right tile. */
function buildPicks(r: Runtime) {
  const level = r.level
  const blockCells = new Set(level.blocks.map((b) => `${b.x},${b.y}`))
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const t = level.tiles[y][x]
      let top = FLOOR_TOP + 0.1
      if (t === '#') top = FLOOR_TOP + STEP_HEIGHT
      else if (t === 'W' || t === 'E') top = ELEV + WALL_HEIGHT
      else if (t === 'S' || blockCells.has(`${x},${y}`)) top = FLOOR_TOP + BLOCK_SIZE
      else if (FAN_DIR[t]) top = FLOOR_TOP + 1.6
      const h = top - ELEV
      const e = engine.addEntity()
      Transform.create(e, { position: Vector3.create(tileX(x, level), ELEV + h / 2, tileZ(y, level)), scale: Vector3.create(TILE, h, TILE) })
      MeshCollider.setBox(e, ColliderLayer.CL_POINTER)
      pointerEventsSystem.onPointerDown({ entity: e, opts: { button: InputAction.IA_POINTER, hoverText: `Paint (${x}, ${y})`, maxDistance: 100 } }, () => cellClick?.(x, y))
      r.picks.push(e)
    }
  }
}

export const activeLevel = () => active.level

export function teleportToStart() {
  if (!rt) return
  const l = rt.level
  const pos = tileCentre(l.start, l, FLOOR_TOP + 0.1)
  void movePlayerTo({
    newRelativePosition: pos,
    cameraTarget: Vector3.create(ORIGIN.x, FLOOR_TOP + 1, ORIGIN.z)
  })
  prevPlayer = null
}

/** Update plate colours; `fx` plays the burst for plates that just became covered. */
function refreshPlates(fx: boolean) {
  if (!rt) return
  for (const p of rt.plates) {
    const on = isPlateCovered(rt.state, p.pt)
    pbr(p.entity, on ? PLATE_ON : PLATE_OFF, { glow: on ? 2.5 : 0.6 })
    if (fx && on && !p.on) {
      const c = Transform.get(p.entity).position
      plateOn(c.x, FLOOR_TOP, c.z)
    }
    p.on = on
  }
}

// ---- Actions the HUD / editor call ----
export function restartLevel() {
  buildLevel(active.level, active.index)
  teleportToStart()
}

export function loadLevel(index: number) {
  buildLevel(LEVELS[index], index)
  teleportToStart()
}

/** Leave the current level and go back to the lobby. */
export function returnToLobby() {
  clearLevel()
  clearFx()
  session.inLobby = true
  session.menuOpen = false
  session.codeOpen = false
  session.solved = false
  session.levelIndex = 0
  void movePlayerTo({ newRelativePosition: LOBBY_SPAWN, cameraTarget: Vector3.create(LOBBY_SPAWN.x, 2, LOBBY_SPAWN.z + 10) })
  prevPlayer = null
}

/** Show a level that is not one of the shipped ones (the editor's working copy). Does not move the player. */
export function buildCustom(level: Level) {
  buildLevel(level, -1)
}

export const hasNextLevel = () => session.levelIndex >= 0 && session.levelIndex + 1 < LEVELS.length

export function nextLevel() {
  if (hasNextLevel()) loadLevel(session.levelIndex + 1)
}

export function toggleMenu() {
  session.menuOpen = !session.menuOpen
  if (session.menuOpen) session.codeOpen = false
}

export function toggleCode() {
  session.codeOpen = !session.codeOpen
}

export function copyLevelCode() {
  copyToClipboard({ text: session.code }).then(
    () => (session.copiedAt = Date.now()),
    () => {}
  )
}

// While editing, a fall just rebuilds the level in place instead of yanking the camera back to the start.
function resetAfterFall() {
  if (editor.open) buildLevel(active.level, active.index)
  else restartLevel()
}

// ---- Pushing ----
function startPush(index: number, dir: Dir) {
  if (!rt) return
  const res = push(rt.state, index, dir)
  if (!res.moved) {
    rt.cooldown = PUSH_COOLDOWN
    return
  }
  const from = Transform.get(rt.blocks[index]).position
  const pts = [Vector3.clone(from), ...res.path.map((p) => tileCentre(p, rt!.level, FLOOR_TOP + BLOCK_SIZE / 2))]
  const lens = pts.slice(1).map((p, i) => Vector3.distance(pts[i], p))
  rt.slide = {
    index,
    pts,
    lens,
    to: pts[pts.length - 1],
    travelled: 0,
    total: lens.reduce((a, b) => a + b, 0),
    fell: res.fell,
    consumed: res.consumed,
    fallT: 0,
    burst: false,
    trailT: 0,
    after: res.state
  }
  dust(from.x, FLOOR_TOP + 0.1, from.z, 5)
  if (!res.fell) {
    session.moves = res.state.moves
    if (!session.startedAt) session.startedAt = Date.now()
  }
  samples.length = 0
}

function slideSystem(dt: number) {
  if (!rt) return

  // squash-and-stretch after a block stops
  if (rt.bounce) {
    const b = rt.bounce
    b.t += dt
    const tr = Transform.getMutable(rt.blocks[b.index])
    if (b.t >= BOUNCE_TIME) {
      tr.scale = Vector3.create(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE)
      tr.position = Vector3.create(tr.position.x, FLOOR_TOP + BLOCK_SIZE / 2, tr.position.z)
      rt.bounce = null
    } else {
      const k = Math.sin((b.t / BOUNCE_TIME) * Math.PI)
      const h = BLOCK_SIZE * (1 - 0.1 * k)
      tr.scale = Vector3.create(BLOCK_SIZE * (1 + 0.05 * k), h, BLOCK_SIZE * (1 + 0.05 * k))
      tr.position = Vector3.create(tr.position.x, FLOOR_TOP + h / 2, tr.position.z)
    }
  }

  // floor tiles rising into pits that were just filled
  for (let i = rt.fills.length - 1; i >= 0; i--) {
    const f = rt.fills[i]
    f.t += dt
    const k = Math.min(1, f.t / 0.4)
    const tr = Transform.getMutable(f.entity)
    tr.position = Vector3.create(tr.position.x, f.toY - 2 * (1 - k) * (1 - k), tr.position.z)
    if (k >= 1) rt.fills.splice(i, 1)
  }

  if (!rt.slide) return
  const s = rt.slide
  const t = Transform.getMutable(rt.blocks[s.index])

  if (s.travelled < s.total) {
    s.travelled = Math.min(s.total, s.travelled + SLIDE_SPEED * dt)
    // find the leg we are on (the path may turn at arrows and fans)
    let d = s.travelled
    let i = 0
    while (i < s.lens.length - 1 && d > s.lens[i]) {
      d -= s.lens[i]
      i++
    }
    const a = s.pts[i]
    const b = s.pts[i + 1]
    const len = s.lens[i]
    t.position = Vector3.lerp(a, b, len === 0 ? 1 : Math.min(1, d / len))
    s.trailT += dt
    if (s.trailT > 0.04 && len > 0) {
      s.trailT = 0
      // the shards fly backwards, away from travel
      trail(t.position.x, FLOOR_TOP + 0.15, t.position.z, -(b.x - a.x) / len, -(b.z - a.z) / len)
    }
    return
  }

  if (s.fell) {
    if (!s.burst) {
      s.burst = true
      holeBurst(s.to.x, FLOOR_TOP, s.to.z)
    }
    // the block drops through the hole; then the whole attempt resets
    s.fallT += dt
    t.position = Vector3.create(s.to.x, s.to.y - 5 * s.fallT * s.fallT * 2, s.to.z)
    if (s.fallT >= FALL_RESET_DELAY) resetAfterFall()
    return
  }

  if (s.consumed) {
    // the block sinks into the pit and is used up; a floor tile rises where the pit was
    if (!s.burst) {
      s.burst = true
      dust(s.to.x, FLOOR_TOP + 0.2, s.to.z, 8, FX_AMBER)
    }
    s.fallT += dt
    const k = Math.min(1, s.fallT / 0.35)
    t.scale = Vector3.create(BLOCK_SIZE * (1 - k), BLOCK_SIZE * (1 - k), BLOCK_SIZE * (1 - k))
    t.position = Vector3.create(s.to.x, s.to.y - 3.2 * k, s.to.z)
    if (k < 1) return
    const pit = s.after.filled[s.after.filled.length - 1]
    const gone = rt.blocks[s.index]
    engine.removeEntity(gone)
    rt.entities = rt.entities.filter((e) => e !== gone)
    rt.blocks.splice(s.index, 1)
    for (const lip of rt.pits[`${pit.x},${pit.y}`] ?? []) engine.removeEntity(lip)
    rt.entities = rt.entities.filter((e) => !(rt!.pits[`${pit.x},${pit.y}`] ?? []).includes(e))
    delete rt.pits[`${pit.x},${pit.y}`]
    const c = tileCentre(pit, rt.level, FLOOR_TOP - FLOOR_THICK / 2)
    const patch = box(rt, Vector3.create(c.x, c.y - 2, c.z), Vector3.create(TILE, FLOOR_THICK, TILE), PATCH, true, { metallic: 0.1, roughness: 0.3 })
    rt.fills.push({ entity: patch, t: 0, toY: c.y })
    stopBurst(s.to.x, FLOOR_TOP, s.to.z)
    finishSlide(s.after, false)
    return
  }

  finishSlide(s.after, true)
  stopBurst(s.to.x, FLOOR_TOP, s.to.z)
}

/** Common end of a slide: adopt the new state, update plates, and check for the win. */
function finishSlide(after: GameState, bounce: boolean) {
  if (!rt || !rt.slide) return
  const s = rt.slide
  rt.state = after
  rt.slide = null
  rt.cooldown = PUSH_COOLDOWN
  if (bounce) rt.bounce = { index: s.index, t: 0 }
  refreshPlates(true)
  if (isSolved(rt.state) && !session.unlocked && !session.solved) {
    session.unlocked = true
    if (rt.door) {
      // every plate is covered: the door opens and the player walks through it to finish
      rt.door.target = true
      plateOn(rt.door.cx, FLOOR_TOP, rt.door.cz)
    } else {
      completeLevel()
    }
  }
}

/** The level is finished: record the result and celebrate. */
function completeLevel() {
  if (!rt || session.solved) return
  session.solved = true
  session.finishedAt = Date.now()
  const ms = session.finishedAt - session.startedAt
  if (session.levelIndex >= 0) {
    const pr = progress[session.levelIndex]
    pr.done = true
    if (!pr.bestMoves || session.moves < pr.bestMoves) pr.bestMoves = session.moves
    if (!pr.bestTimeMs || ms < pr.bestTimeMs) pr.bestTimeMs = ms
  }
  for (const p of rt.plates) {
    const c = Transform.get(p.entity).position
    confetti(c.x, FLOOR_TOP, c.z)
  }
  if (rt.door) confetti(rt.door.cx, FLOOR_TOP, rt.door.cz)
}

/** Animates the door and finishes the level when the player walks into the open doorway. */
function doorSystem(dt: number) {
  const d = rt?.door
  if (!rt || !d) return
  if (d.target && d.open < 1) d.open = Math.min(1, d.open + dt / 0.9)
  const k = 1 - (1 - d.open) * (1 - d.open) // ease-out
  d.parts.forEach((e, i) => {
    const tr = Transform.getMutable(e)
    tr.position = Vector3.create(tr.position.x, d.baseY[i] - 3.6 * k, tr.position.z)
  })
  if (d.open >= 1 && session.unlocked && !session.solved && Transform.has(engine.PlayerEntity)) {
    const p = Transform.get(engine.PlayerEntity).position
    if (Math.abs(p.x - d.cx) < TILE / 2 && Math.abs(p.z - d.cz) < TILE / 2 && p.y > ELEV - 1 && p.y < ELEV + 5) completeLevel()
  }
}

function pushSystem(dt: number) {
  clock += dt
  if (!Transform.has(engine.PlayerEntity)) return
  const p = Transform.get(engine.PlayerEntity).position

  if (prevPlayer && dt > 0) {
    samples.push({ t: clock, vx: (p.x - prevPlayer.x) / dt, vz: (p.z - prevPlayer.z) / dt })
    while (samples.length && clock - samples[0].t > PUSH_WINDOW) samples.shift()
  }
  prevPlayer = Vector3.clone(p)

  pushEffort.lastEvent = ''
  if (!rt) return
  if (rt.cooldown > 0) rt.cooldown -= dt
  if (rt.slide || rt.cooldown > 0 || session.solved || session.unlocked || rt.resetIn > 0) {
    if (charge) endCharge('cancel')
    return
  }

  // Already leaning on a block: keep going while the avatar stays against the same face, else cancel.
  if (charge) {
    if (contactDir(charge.index, p) !== charge.dir) {
      endCharge('cancel')
      return
    }
    charge.t += dt
    pushEffort.progress = Math.min(1, charge.t / PUSH_WINDUP)
    dustT += dt
    if (dustT > 0.1) {
      dustT = 0
      const d = DIR_DELTA[charge.dir]
      dust(p.x + d.x * 0.5, FLOOR_TOP + 0.1, p.z - d.y * 0.5, 1)
    }
    if (charge.t >= PUSH_WINDUP) {
      const { index, dir } = charge
      endCharge('slide')
      startPush(index, dir)
    }
    return
  }

  for (let i = 0; i < rt.blocks.length; i++) {
    const dir = contactDir(i, p)
    if (!dir) continue
    const dd = DIR_DELTA[dir]
    // grid y grows southward, world z grows northward
    const wx = dd.x
    const wz = -dd.y
    let best = 0
    for (const s of samples) best = Math.max(best, s.vx * wx + s.vz * wz)
    if (best >= PUSH_MIN_SPEED) {
      charge = { index: i, dir, t: 0 }
      pushEffort.active = true
      pushEffort.progress = 0
      pushEffort.dir = dir
      pushEffort.blockIndex = i
      return
    }
  }
}

/** Which face of block `i` the avatar is touching (as the direction the push would go), or null. */
function contactDir(i: number, p: Vector3): Dir | null {
  if (!rt) return null
  const c = Transform.get(rt.blocks[i]).position
  const dx = c.x - p.x
  const dz = c.z - p.z
  const alongX = Math.abs(dx) > Math.abs(dz)
  const along = alongX ? Math.abs(dx) : Math.abs(dz)
  const across = alongX ? Math.abs(dz) : Math.abs(dx)
  if (along > BLOCK_SIZE / 2 + PUSH_REACH || across > BLOCK_SIZE / 2 + 0.1) return null
  if (Math.abs(p.y - (FLOOR_TOP + 0.1)) > 1.5) return null // jumping/falling past the block is not a push
  // direction from avatar to block, in grid terms (north = -row = +z)
  return alongX ? (dx > 0 ? 'E' : 'W') : dz > 0 ? 'N' : 'S'
}

function playerFallSystem(dt: number) {
  if (!rt) return
  if (editor.open) {
    rt.resetIn = 0 // no fall resets while editing
    return
  }
  if (rt.resetIn > 0) {
    rt.resetIn -= dt
    if (rt.resetIn <= 0) restartLevel()
    return
  }
  if (!Transform.has(engine.PlayerEntity)) return
  const p = Transform.get(engine.PlayerEntity).position
  // The level floats ELEV metres up, so anything that drops well below the ice (a hole, an open pit, the outer edge)
  // is a fall. Only count it near the level, so walking around the lobby underneath never triggers it.
  const l = rt.level
  const near = Math.abs(p.x - ORIGIN.x) < (l.width * TILE) / 2 + 12 && Math.abs(p.z - ORIGIN.z) < (l.height * TILE) / 2 + 12
  if (near && p.y < ELEV - 2.5) rt.resetIn = FALL_RESET_DELAY
}

export function setupWorld() {
  buildLobby() // the game starts in the lobby: no level is built until one is picked
  setupFx()
  engine.addSystem(pushSystem, 9, 'sm-push')
  engine.addSystem(slideSystem, 8, 'sm-slide')
  engine.addSystem(playerFallSystem, 7, 'sm-player-fall')
  engine.addSystem(fanSystem, 6, 'sm-fan')
  engine.addSystem(doorSystem, 6, 'sm-door')
}
