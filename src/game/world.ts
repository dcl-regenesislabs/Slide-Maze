// The 3D side of the game (greybox look): spawns a level from data, detects the avatar pushing a block,
// animates the slide, and tells the session when the level is solved. All the rules live in logic.ts.

import { Animator, ColliderLayer, engine, ParticleSystem, PBParticleSystem_BlendMode, Entity, GltfContainer, InputAction, Material, MaterialTransparencyMode, MeshCollider, MeshRenderer, pointerEventsSystem, Transform } from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { copyToClipboard, movePlayerTo } from '~system/RestrictedActions'
import { FX_COLORS, clearFx, confetti, dust, holeBurst, plateOn, setupFx, stopBurst, trail, windStreak } from './fx'
import { buildCave, buildLevelLights } from './cave'
import { iceModel, slabEntity, stoneModel } from './tiles'
import { buildCeiling, buildCrystals, buildWallRing, ringAround } from './wallRing'
import { buildLobby, LOBBY_SPAWN } from './lobby'
import { ARROW_DIR, DIRS, DIR_DELTA, Dir, FAN_DIR, Level, Pt } from './grid'
import { LEVELS, levelCode } from './levels'
import { GameState, blockAt, createState, isPlateCovered, isSolved, playerCanStand, push, reachable } from './logic'
import { solveFrom } from './solver'
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
const FILL_TIME = 0.45 // seconds for a block to drop into a fillable pit
const PLATE_CLIP = 'PressurePlatePressed' // the plate model's press animation (shape key, 7 frames)
const PLATE_SOLID = true // the avatar collides with the plate model (it is a low step it has to climb); false = walk straight through
const PRESS_SPEED = 40 // the press snaps down (the clip is 0.5 s at speed 1, so this is a few frames)
const RELEASE_SPEED = 0.1 // playback speed when it comes back up (the clip played backward)
const PRESS_TIME = 0.5 / PRESS_SPEED // seconds the press takes
const RELEASE_TIME = 0.5 / RELEASE_SPEED // seconds one full release takes
const BOUNCE_TIME = 0.5 // seconds the landing deformation takes to settle
const BOUNCE_SQUASH = 0.07 // how much a block compresses along its travel direction when it lands (0.07 = 7%)
const WALL_GAP = 14 // metres between the edge of a level and the inner face of the cave walls (the corner modules reach 6 m closer)
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
const ISLAND = Color4.create(0.13, 0.17, 0.24, 1) // the rock the floating level hangs on
const ISLAND_LIGHT = Color4.create(0.2, 0.26, 0.35, 1)

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

/** vis: the plate is shown pressed; pressT: seconds since it started pressing; pending: release as soon as the press has finished; relT: seconds since it started releasing (-1 = not releasing) */
interface Plate {
  entity: Entity
  pt: Pt
  on: boolean
  vis: boolean
  pressT: number
  pending: boolean
  relT: number
}

interface Runtime {
  level: Level
  state: GameState
  entities: Entity[]
  picks: Entity[] // editor-only: invisible pointer colliders, one per cell, so tiles can be painted from the 3D view
  blocks: Entity[]
  plates: Plate[]
  fans: { x: number; z: number; fx: number; fz: number; len: number }[] // wind lanes, for the wind streaks
  spawn: Vector3 | null // where the player arrives (the entrance annex), or null = the start tile
  door: { parts: Entity[]; baseY: number[]; open: number; target: boolean; cx: number; cz: number } | null // the exit door
  fills: { entity: Entity; t: number; toY: number }[] // floor tiles rising into filled pits
  slide: Slide | null
  bounce: { index: number; t: number; dx: number; dz: number; bx: number; bz: number } | null // dx, dz: the way the block was travelling; bx, bz: where it rests
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

// ---- Wind: dust puffs and streaks ----
let streakT = 0
const STREAK_EVERY = 0.3 // seconds between wind streaks, per wind statue
const MOUTH_FORWARD = 1.3 // metres in front of the statue's centre where the wind leaves its mouth
const MOUTH_HEIGHT = 0.9 // and how high above the floor

function fanSystem(dt: number) {
  streakT += dt
  if (!rt || streakT <= STREAK_EVERY) return
  streakT = 0
  for (const f of rt.fans) {
    if (f.len < 1) continue
    const start = Math.floor(Math.random() * f.len) // a random tile along the lane
    const dist = Math.min(f.len - start, 3) * TILE
    const off = (TILE * 0.5) + start * TILE
    windStreak(f.x + f.fx * off + (Math.random() - 0.5) * 1.2 * Math.abs(f.fz), FLOOR_TOP + 0.4 + Math.random() * 1.6, f.z + f.fz * off + (Math.random() - 0.5) * 1.2 * Math.abs(f.fx), f.fx, f.fz, dist)
  }
}

/**
 * An arrow tile ('^ > v <'): the ArrowPlate model, which shares the ice tile's origin, so it goes where the ice tile is. Its
 * looping idle animation plays all the time, and its "_collider" child is the only part that collides. The world direction
 * (fx, fz) is the way a block gets turned.
 */
const ARROW_MODEL_YAW = 180 // the model's arrow points along -Z at rotation 0; if the arrows all point the wrong way in game, change this
function arrowPlate(r: Runtime, pos: Vector3, fx: number, fz: number): Entity {
  const yaw = (Math.atan2(fx, fz) * 180) / Math.PI + ARROW_MODEL_YAW
  const e = engine.addEntity()
  Transform.create(e, { position: pos, rotation: Quaternion.fromEulerDegrees(0, yaw, 0) })
  GltfContainer.create(e, {
    src: 'assets/models/arrowPlate01.glb',
    visibleMeshesCollisionMask: 0,
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS
  })
  Animator.create(e, { states: [{ clip: 'ArrowPlateIdle', playing: true, loop: true, speed: 1 }] })
  r.entities.push(e)
  return e
}

const WIND_IDLE_SPEED = 1.25 // playback speed of the wind statue's idle animation

/**
 * The wind dust: a soft cloud of cyan-white particles blowing out of the statue's mouth along its lane. A particle lives exactly
 * long enough to reach the end of the lane (`len` tiles, from the mouth), starts small, and shrinks away towards the end. One
 * emitter per statue (mobile allows about 8 emitters in a scene).
 */
function windGust(r: Runtime, c: Vector3, fx: number, fz: number, len: number) {
  const speed = 4.5
  const reach = len * TILE + (TILE / 2 - MOUTH_FORWARD) // from the mouth to the far end of the lane
  const e = engine.addEntity()
  Transform.create(e, {
    position: Vector3.create(c.x + fx * MOUTH_FORWARD, FLOOR_TOP + MOUTH_HEIGHT, c.z + fz * MOUTH_FORWARD),
    rotation: Quaternion.fromEulerDegrees(0, (Math.atan2(fx, fz) * 180) / Math.PI, 0)
  })
  ParticleSystem.create(e, {
    rate: 18,
    maxParticles: 70,
    lifetime: reach / speed,
    initialVelocitySpeed: { start: speed, end: speed },
    initialSize: { start: 0.25, end: 0.45 },
    sizeOverTime: { start: 1.2, end: 0.1 },
    colorOverTime: { start: Color4.create(0.75, 0.97, 1, 0.5), end: Color4.create(0.45, 0.9, 1, 0) },
    texture: { src: 'assets/images/windPuff.png' },
    blendMode: PBParticleSystem_BlendMode.PSB_ADD,
    billboard: true,
    shape: ParticleSystem.Shape.Cone({ angle: 7, radius: 0.25 })
  })
  r.entities.push(e)
}

/** A wind statue: the WindCube model, turned so its mouth faces the way it blows (world direction fx, fz). */
function windCube(r: Runtime, pos: Vector3, fx: number, fz: number): Entity {
  const yaw = (Math.atan2(fx, fz) * 180) / Math.PI
  const e = engine.addEntity()
  Transform.create(e, { position: pos, rotation: Quaternion.fromEulerDegrees(0, yaw, 0) })
  GltfContainer.create(e, {
    src: 'assets/models/WindCube01.glb',
    visibleMeshesCollisionMask: 0,
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS
  })
  Animator.create(e, { states: [{ clip: 'WindCubeIdle', playing: true, loop: true, speed: WIND_IDLE_SPEED }] })
  r.entities.push(e)
  return e
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

const FILL_GAP_MODEL = 'assets/models/FillGapTile01.glb'

// A floor slab (ice, or the stone ledge): see tiles.ts.
function slab(r: Runtime, pos: Vector3, x: number, y: number, model: (n: number) => string): Entity {
  const e = slabEntity(pos, x, y, active.index, model)
  r.entities.push(e)
  return e
}
const iceTile = (r: Runtime, pos: Vector3, x: number, y: number) =>
  slab(r, pos, x, y, iceModel)
const stoneTile = (r: Runtime, pos: Vector3, x: number, y: number) =>
  slab(r, pos, x, y, stoneModel)

// A movable block: the SlideCube model, which is already BLOCK_SIZE metres wide, so its scale is 1 (the squash-and-stretch
// and sink animations scale it relative to that).
function slideCube(r: Runtime, pos: Vector3): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: pos })
  GltfContainer.create(e, { src: 'assets/models/SlideCube01.glb', visibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS })
  r.entities.push(e)
  return e
}

// A static cube ('S'): the WallCube model. Its origin is on the floor (the ice surface), and its "_collider" child is the
// invisible collision mesh, so only that child collides. It is turned in 90 degree steps from a hash of its tile.
function wallCube(r: Runtime, pos: Vector3, x: number, y: number): Entity {
  let h = Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul(active.index + 1, 83492791)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  const e = engine.addEntity()
  Transform.create(e, { position: pos, rotation: Quaternion.fromEulerDegrees(0, 90 * ((h >>> 8) & 3), 0) })
  GltfContainer.create(e, {
    src: 'assets/models/Wallcube01.glb',
    visibleMeshesCollisionMask: 0,
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS
  })
  r.entities.push(e)
  return e
}

function clearLevel() {
  clearHint()
  if (!rt) return
  for (const e of rt.picks) {
    pointerEventsSystem.removeOnPointerDown(e)
    pointerEventsSystem.removeOnPointerHoverEnter(e)
    pointerEventsSystem.removeOnPointerHoverLeave(e)
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
    spawn: null,
    door: null,
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
      if (t === '#' || t === 'E') {
        const h = FLOOR_THICK + STEP_HEIGHT
        stoneTile(r, tileCentre(p, level, ELEV + h / 2), x, y)
        if (t === 'E' && level.exitSide) {
          // the exit step: a walkable ledge with a glowing threshold. The door itself stands outside the square.
          box(r, tileCentre(p, level, FLOOR_TOP + STEP_HEIGHT + 0.03), Vector3.create(TILE * 0.7, 0.06, TILE * 0.7), DOOR_RUNE, false, { glow: 0.8, roughness: 0.4 })
          r.door = buildAnnex(r, p, level.exitSide, true)
        }
      } else if (t === 'W') {
        box(r, tileCentre(p, level, ELEV + WALL_HEIGHT / 2), Vector3.create(TILE, WALL_HEIGHT, TILE), WALL, true)
      } else if (FAN_DIR[t]) {
        // a wind statue (WindCube01) stands on the ice and blows out of its mouth. Its origin is on the floor, its face looks along +Z
        // at rotation 0, its looping idle animation plays all the time, and its "_collider" child is the only part that collides
        const d = DIR_DELTA[FAN_DIR[t]]
        const fx = d.x
        const fz = -d.y
        const c = tileCentre(p, level, 0)
        iceTile(r, tileCentre(p, level, FLOOR_TOP - FLOOR_THICK / 2), x, y)
        windCube(r, tileCentre(p, level, FLOOR_TOP), fx, fz)
        // wind lane length for the streaks: the tiles the rules treat as windy (so they always agree)
        let len = 0
        for (let q = { x: x + d.x, y: y + d.y }; q.x >= 0 && q.y >= 0 && q.x < level.width && q.y < level.height && level.wind[q.y][q.x] === FAN_DIR[t]; q = { x: q.x + d.x, y: q.y + d.y }) len++
        r.fans.push({ x: c.x, z: c.z, fx, fz, len })
        if (len >= 1) windGust(r, c, fx, fz, len)
      } else if (t === 'O') {
        // no floor at all: the level floats, so a block or the avatar that goes in really drops to the ground below
      } else if (t === 'F') {
        // fillable pit: an ice tile with a square shaft cut through it (FillGapTile01). The shaft is as deep as a block is tall, so the
        // block that slides in sinks until its top is flush with the ice and stays there as the floor. Same origin as an ice tile.
        slab(r, tileCentre(p, level, FLOOR_TOP - FLOOR_THICK / 2), x, y, () => FILL_GAP_MODEL)
      } else {
        iceTile(r, tileCentre(p, level, FLOOR_TOP - FLOOR_THICK / 2), x, y)
        if (t === 'N') {
          // snow patch: a matte white drift with a few lumps, so it reads as "grippy" against the glossy ice
          box(r, tileCentre(p, level, FLOOR_TOP + 0.06), Vector3.create(TILE * 0.9, 0.12, TILE * 0.9), SNOW, false, { roughness: 1 })
          for (const [ox, oz, s] of [[-0.6, -0.5, 0.5], [0.5, 0.4, 0.6], [0.1, -0.7, 0.35], [-0.4, 0.6, 0.4]]) {
            box(r, Vector3.create(tileX(x, level) + ox, FLOOR_TOP + 0.14, tileZ(y, level) + oz), Vector3.create(s, 0.2, s), SNOW, false, { roughness: 1 })
          }
        } else if (ARROW_DIR[t]) {
          const d = DIR_DELTA[ARROW_DIR[t]]
          arrowPlate(r, tileCentre(p, level, FLOOR_TOP - FLOOR_THICK / 2), d.x, -d.y)
        } else if (t === 'P') {
          // the plate model shares the ice tile's origin, so it goes exactly where the ice tile is; its animation presses it
          const plate = engine.addEntity()
          Transform.create(plate, { position: tileCentre(p, level, FLOOR_TOP - FLOOR_THICK / 2) })
          GltfContainer.create(plate, {
            src: 'assets/models/pressurePlate01.glb',
            visibleMeshesCollisionMask: PLATE_SOLID ? ColliderLayer.CL_PHYSICS : 0
          })
          // held on frame 0 (playing, speed 0): a clip that is merely not playing can show its last pose, i.e. pressed
          Animator.create(plate, { states: [{ clip: PLATE_CLIP, playing: true, loop: false, speed: 0, shouldReset: true }] })
          r.entities.push(plate)
          r.plates.push({ entity: plate, pt: p, on: false, vis: false, pressT: 0, pending: false, relT: -1 })
        } else if (t === 'S') {
          wallCube(r, tileCentre(p, level, FLOOR_TOP), x, y)
        }
      }
    }
  }

  for (const b of level.blocks) {
    r.blocks.push(slideCube(r, tileCentre(b, level, FLOOR_TOP + BLOCK_SIZE / 2)))
  }

  buildUnderside(r)
  buildEntrance(r)
  // the cave around the game, sized to this level (the clear space inside is the level plus a gap, so corners never touch the slab):
  // walls, its own ceiling, and glowing crystals on the walls
  const ring = ringAround({ x: ORIGIN.x, z: ORIGIN.z }, (level.width * TILE) / 2, (level.height * TILE) / 2, WALL_GAP)
  r.entities.push(...buildWallRing(ring, index + 7), ...buildCeiling(ring, index + 7), ...buildCrystals(ring, index + 7))
  if (editor.open) {
    buildGrid(r)
    buildPicks(r)
  }

  session.inLobby = false
  session.unlocked = false
  session.advancing = false
  advanceIn = 0
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

/** The level floats, so hang a tapering mass of rock under it (a stepped inverted pyramid with a few spikes). */
function buildUnderside(r: Runtime) {
  const level = r.level
  const w = level.width * TILE
  const d = level.height * TILE
  const layers: [number, number, number, number][] = [
    // [size factor, height, yaw, centre depth below the slab]
    [0.96, 2.8, 4, 1.4], // reaches down past the floor of a fillable pit (2.7 m under the ice top), which is cut out of it
    [0.74, 2.6, -7, 4.1],
    [0.5, 2.6, 9, 6.7],
    [0.3, 2.2, -5, 9.0]
  ]
  // the top layer sits just under the ice, so it is built from runs of cells with the fillable pits left out: their shafts stay open
  const [, topH, , topDepth] = layers[0]
  for (let y = 0; y < level.height; y++) {
    let x = 0
    while (x < level.width) {
      if (level.tiles[y][x] === 'F') {
        x++
        continue
      }
      let x2 = x
      while (x2 < level.width && level.tiles[y][x2] !== 'F') x2++
      box(r, Vector3.create((tileX(x, level) + tileX(x2 - 1, level)) / 2, ELEV - topDepth, tileZ(y, level)), Vector3.create((x2 - x) * TILE, topH, TILE), ISLAND, false, { roughness: 0.95 })
      x = x2
    }
  }
  layers.slice(1).forEach(([k, h, yaw, depth], i0) => {
    const i = i0 + 1
    box(r, Vector3.create(ORIGIN.x, ELEV - depth, ORIGIN.z), Vector3.create(w * k, h, d * k), i % 2 === 0 ? ISLAND : ISLAND_LIGHT, false, { roughness: 0.95 })
    Transform.getMutable(r.entities[r.entities.length - 1]).rotation = Quaternion.fromEulerDegrees(0, yaw, 0)
  })
  // spikes hanging off the edge, in a fixed pattern so a level always looks the same
  const spikes = Math.min(14, 6 + Math.floor(level.width / 2))
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2
    const rx = (w / 2) * 0.82 * (0.7 + 0.3 * Math.abs(Math.sin(i * 2.3)))
    const rz = (d / 2) * 0.82 * (0.7 + 0.3 * Math.abs(Math.cos(i * 1.7)))
    const len = 2.5 + 3 * Math.abs(Math.sin(i * 3.1))
    box(r, Vector3.create(ORIGIN.x + Math.cos(a) * rx, ELEV - 1.5 - len / 2, ORIGIN.z + Math.sin(a) * rz), Vector3.create(1, len, 1), ISLAND_LIGHT, false, { roughness: 0.9 })
  }
}

/** Called when a cell is clicked in the 3D view while editing. Set by editor.ts (world must not import the editor). */
let cellClick: ((x: number, y: number) => void) | null = null
export const setCellClickHandler = (fn: (x: number, y: number) => void) => (cellClick = fn)

/** Called with the cell under the cursor while editing, or (-1, -1) when it leaves every cell. */
let cellHover: ((x: number, y: number) => void) | null = null
export const setCellHoverHandler = (fn: (x: number, y: number) => void) => (cellHover = fn)

// ---- Editor cursor: a highlight on the tile you are aiming at and a see-through preview of the selected item ----
let cursorEnts: Entity[] = []

export function hideCursor() {
  for (const e of cursorEnts) engine.removeEntity(e)
  cursorEnts = []
}

// what the preview looks like per tile character: [height above the ice, colour]
const GHOST: Record<string, [number, Color4]> = {
  '.': [0.12, ICE_A],
  '#': [STEP_HEIGHT, STEP],
  W: [WALL_HEIGHT - FLOOR_THICK, WALL],
  O: [0.08, PIT],
  F: [0.14, PIT_LIP],
  E: [STEP_HEIGHT, DOOR_RUNE],
  P: [0.1, PLATE_OFF],
  S: [BLOCK_SIZE, STATIC],
  B: [BLOCK_SIZE, MOVABLE],
  '@': [0.1, PLATE_ON],
  N: [0.22, SNOW],
  '^': [0.1, ARROW],
  '>': [0.1, ARROW],
  v: [0.1, ARROW],
  '<': [0.1, ARROW],
  u: [1.6, FAN_BODY],
  r: [1.6, FAN_BODY],
  d: [1.6, FAN_BODY],
  l: [1.6, FAN_BODY]
}

/** Move the cursor to cell (x, y) showing `tool`. Pass x < 0 to hide it. */
export function updateCursor(x: number, y: number, tool: string) {
  hideCursor()
  if (!rt || !editor.open || x < 0 || y < 0 || x >= rt.level.width || y >= rt.level.height) return
  const [h, color] = GHOST[tool] ?? [0.1, ICE_A]
  const c = tileCentre({ x, y }, rt.level, 0)
  const make = (pos: Vector3, size: Vector3, col: Color4, alpha: number, glow: number) => {
    const e = engine.addEntity()
    Transform.create(e, { position: pos, scale: size })
    MeshRenderer.setBox(e)
    Material.setPbrMaterial(e, {
      albedoColor: Color4.create(col.r, col.g, col.b, alpha),
      emissiveColor: Color3.create(col.r, col.g, col.b),
      emissiveIntensity: glow,
      roughness: 0.5,
      transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND
    })
    cursorEnts.push(e)
  }
  // a bright frame-like slab on the tile top, then the preview of the item standing on it
  const top = tool === '#' || tool === 'W' ? ELEV + FLOOR_THICK : FLOOR_TOP
  make(Vector3.create(c.x, FLOOR_TOP + 0.32, c.z), Vector3.create(TILE + 0.06, 0.06, TILE + 0.06), DOOR_RUNE, 0.55, 2.2)
  make(Vector3.create(c.x, top + h / 2, c.z), Vector3.create(TILE * 0.96, h, TILE * 0.96), color, 0.5, 0.6)
}

const GRID_LINE = Color4.create(0.3, 0.75, 1, 1)

/** Thin lines along every tile edge, so the grid you are building on is visible in the world (editor only). */
function buildGrid(r: Runtime) {
  const l = r.level
  const y = FLOOR_TOP + STEP_HEIGHT + 0.03
  const x0 = ORIGIN.x - (l.width * TILE) / 2
  const z0 = ORIGIN.z - (l.height * TILE) / 2
  for (let i = 0; i <= l.width; i++) {
    box(r, Vector3.create(x0 + i * TILE, y, ORIGIN.z), Vector3.create(0.07, 0.03, l.height * TILE), GRID_LINE, false, { glow: 0.9, roughness: 0.5 })
  }
  for (let j = 0; j <= l.height; j++) {
    box(r, Vector3.create(ORIGIN.x, y, z0 + j * TILE), Vector3.create(l.width * TILE, 0.03, 0.07), GRID_LINE, false, { glow: 0.9, roughness: 0.5 })
  }
}

/** One invisible, pointer-only collider per cell, as tall as what is drawn there, so a click lands on the right tile. */
function buildPicks(r: Runtime) {
  const level = r.level
  const blockCells = new Set(level.blocks.map((b) => `${b.x},${b.y}`))
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const t = level.tiles[y][x]
      let top = FLOOR_TOP + 0.1
      if (t === '#') top = FLOOR_TOP + STEP_HEIGHT
      else if (t === 'W') top = ELEV + WALL_HEIGHT
      else if (t === 'E') top = FLOOR_TOP + STEP_HEIGHT
      else if (t === 'S' || blockCells.has(`${x},${y}`)) top = FLOOR_TOP + BLOCK_SIZE
      else if (FAN_DIR[t]) top = FLOOR_TOP + 1.6
      const h = top - ELEV
      const e = engine.addEntity()
      Transform.create(e, { position: Vector3.create(tileX(x, level), ELEV + h / 2, tileZ(y, level)), scale: Vector3.create(TILE, h, TILE) })
      MeshCollider.setBox(e, ColliderLayer.CL_POINTER)
      pointerEventsSystem.onPointerDown({ entity: e, opts: { button: InputAction.IA_POINTER, hoverText: `Place   (F: erase,  E: next item)  [${x}, ${y}]`, maxDistance: 120 } }, () => cellClick?.(x, y))
      pointerEventsSystem.onPointerHoverEnter({ entity: e, opts: { maxDistance: 120 } }, () => cellHover?.(x, y))
      pointerEventsSystem.onPointerHoverLeave({ entity: e, opts: { maxDistance: 120 } }, () => cellHover?.(-1, -1))
      r.picks.push(e)
    }
  }
}

export const activeLevel = () => active.level

export function teleportToStart() {
  if (!rt) return
  const l = rt.level
  const pos = rt.spawn ?? tileCentre(l.start, l, FLOOR_TOP + 0.1)
  void movePlayerTo({
    newRelativePosition: pos,
    cameraTarget: Vector3.create(ORIGIN.x, FLOOR_TOP + 1, ORIGIN.z)
  })
  prevPlayer = null
}

/** Press the plate: the clip plays forward so fast that it snaps to the pressed pose. */
function pressPlate(p: Plate) {
  const st = Animator.getMutable(p.entity).states[0]
  st.playing = true
  st.loop = false
  st.speed = PRESS_SPEED
  st.shouldReset = true
  p.vis = true
  p.pending = false
  p.relT = -1
  p.pressT = 0
}

/** Release the plate (play the clip backward) once the press has had time to finish, so a quick pass still shows a full dip. */
function releasePlate(p: Plate) {
  if (!p.vis) return
  if (p.pressT < PRESS_TIME) {
    p.pending = true
    return
  }
  const st = Animator.getMutable(p.entity).states[0]
  st.playing = true
  st.loop = false
  st.speed = -RELEASE_SPEED
  st.shouldReset = false
  p.vis = false
  p.pending = false
  p.relT = 0
}

/** Per-frame plate timers: finish a delayed release, and park a released plate back on frame 0. */
function plateTick(dt: number) {
  if (!rt) return
  for (const p of rt.plates) {
    if (p.vis) {
      p.pressT += dt
      if (p.pending && p.pressT >= PRESS_TIME) releasePlate(p)
    } else if (p.relT >= 0) {
      p.relT += dt
      if (p.relT >= RELEASE_TIME + 0.1) {
        const st = Animator.getMutable(p.entity).states[0]
        st.playing = true
        st.speed = 0
        st.shouldReset = true
        p.relT = -1
      }
    }
  }
}

/** While a block slides: a plate presses as the block enters its tile and releases as it leaves, so a block that only passes over plays both. */
function updatePlatesUnder(pos: Vector3, blockIndex: number) {
  if (!rt) return
  for (const p of rt.plates) {
    const c = tileCentre(p.pt, rt.level, 0)
    const inside = Math.abs(pos.x - c.x) < TILE / 2 && Math.abs(pos.z - c.z) < TILE / 2
    const other = blockAt(rt.state, p.pt) // a block resting here keeps it pressed (the sliding one is still in the state at its start)
    const held = other !== -1 && other !== blockIndex
    if (inside || held) {
      if (!p.vis) pressPlate(p)
      else p.pending = false
    } else releasePlate(p)
  }
}

/** Sync the plates with the rules: `fx` plays the burst for plates that just became covered. */
function refreshPlates(fx: boolean) {
  if (!rt) return
  for (const p of rt.plates) {
    const on = isPlateCovered(rt.state, p.pt)
    if (on && !p.vis) pressPlate(p)
    else if (on) p.pending = false
    else releasePlate(p)
    if (fx && on && !p.on) {
      const c = Transform.get(p.entity).position
      plateOn(c.x, FLOOR_TOP, c.z)
    }
    p.on = on
  }
}

// ---- Gateways ----
/** Two posts and a lintel standing on `baseY`, framing an opening that spans x or z. */
function archFrame(r: Runtime, c: Vector3, spansX: boolean, baseY: number) {
  const at = (lat: number, y: number) => Vector3.create(c.x + (spansX ? lat : 0), y, c.z + (spansX ? 0 : lat))
  const sz = (lat: number, h: number, thick: number) => (spansX ? Vector3.create(lat, h, thick) : Vector3.create(thick, h, lat))
  for (const side of [-1, 1]) box(r, at(side * (TILE / 2 - 0.3), baseY + 1.9), sz(0.6, 3.8, 0.7), WALL, true) // posts
  box(r, at(0, baseY + 3.5), sz(TILE, 0.6, 0.7), WALL, true) // lintel
  box(r, at(0, baseY + 3.15), sz(TILE - 1.2, 0.1, 0.5), DOOR_RUNE, false, { glow: 0.9, roughness: 0.4 }) // rune strip under the lintel
}

// the annex floor is a stone tile, the same thickness (and so height) as the '#' ledge it joins
const ANNEX_THICK = FLOOR_THICK + STEP_HEIGHT
const ANNEX_TOP = ELEV + ANNEX_THICK

const SIDE_VEC: Record<Dir, { x: number; z: number }> = { N: { x: 0, z: 1 }, S: { x: 0, z: -1 }, E: { x: 1, z: 0 }, W: { x: -1, z: 0 } }

/**
 * A short corridor attached to the OUTSIDE of the level's border at `borderPt`, facing `side`: a floor tile, two side
 * walls and an arch at the far end. With `withDoor` the arch is closed by two leaves (the exit); without, it is open
 * (the entrance). Being outside the square, it is not part of the puzzle grid.
 */
function buildAnnex(r: Runtime, borderPt: Pt, side: Dir, withDoor: boolean): NonNullable<Runtime['door']> {
  const level = r.level
  const o = SIDE_VEC[side]
  const bc = tileCentre(borderPt, level, 0)
  const cx = bc.x + o.x * TILE
  const cz = bc.z + o.z * TILE
  const spansX = o.z !== 0 // the opening faces along z, so it spans x
  stoneTile(r, Vector3.create(cx, ELEV + ANNEX_THICK / 2, cz), borderPt.x + o.x + 17, borderPt.y - o.z + 31)
  box(r, Vector3.create(cx, ELEV - 1.4, cz), Vector3.create(TILE * 0.9, 2.2, TILE * 0.9), ISLAND, false, { roughness: 0.95 })
  // side walls, from the border inwards to the arch
  for (const lat of [-(TILE / 2 - 0.3), TILE / 2 - 0.3]) {
    const len = TILE - 0.7
    const mx = cx - o.x * 0.35 + (spansX ? lat : 0)
    const mz = cz - o.z * 0.35 + (spansX ? 0 : lat)
    box(r, Vector3.create(mx, ELEV + WALL_HEIGHT / 2, mz), spansX ? Vector3.create(0.6, WALL_HEIGHT, len) : Vector3.create(len, WALL_HEIGHT, 0.6), WALL, true)
  }
  const edge = Vector3.create(cx + o.x * (TILE / 2 - 0.35), 0, cz + o.z * (TILE / 2 - 0.35))
  archFrame(r, edge, spansX, ANNEX_TOP)
  const parts: Entity[] = []
  const baseY: number[] = []
  if (withDoor) {
    const at = (lat: number, y: number) => Vector3.create(edge.x + (spansX ? lat : 0), y, edge.z + (spansX ? 0 : lat))
    const sz = (lat: number, h: number, thick: number) => (spansX ? Vector3.create(lat, h, thick) : Vector3.create(thick, h, lat))
    for (const side2 of [-1, 1]) {
      const leafY = ANNEX_TOP + 1.6
      parts.push(box(r, at(side2 * (TILE / 4 - 0.02), leafY), sz(TILE / 2 - 0.3, 3.2, 0.5), DOOR_LEAF, true, { roughness: 0.6 }))
      baseY.push(leafY)
      // a dim rune bar across each leaf; it is what lights up on the real art
      parts.push(box(r, at(side2 * (TILE / 4 - 0.02), leafY + 0.4), sz(TILE / 2 - 0.9, 0.14, 0.56), DOOR_RUNE, false, { glow: 0.25, roughness: 0.4 }))
      baseY.push(leafY + 0.4)
    }
  }
  return { parts, baseY, open: 0, target: false, cx, cz }
}

/** The border side a border tile is on, as the direction pointing out of the square. */
const outwardSide = (level: Level, p: Pt): Dir => (p.x === 0 ? 'W' : p.x === level.width - 1 ? 'E' : p.y === 0 ? 'N' : 'S')

/**
 * The entrance: an open annex outside the border step nearest the start. The player arrives in it and walks in. Only
 * used when the solver confirms that step can be reached from the start, so it never changes what is solvable.
 */
function buildEntrance(r: Runtime) {
  const l = r.level
  const s = l.start
  const reach = reachable(r.state, s).set
  // the four border tiles in line with the start, nearest first
  const options = [
    { d: s.x, x: 0, y: s.y },
    { d: l.width - 1 - s.x, x: l.width - 1, y: s.y },
    { d: s.y, x: s.x, y: 0 },
    { d: l.height - 1 - s.y, x: s.x, y: l.height - 1 }
  ].sort((a, b) => a.d - b.d)
  for (const o of options) {
    if (l.tiles[o.y][o.x] !== '#' || !reach.has(o.y * l.width + o.x)) continue // a step you can actually walk onto
    const annex = buildAnnex(r, { x: o.x, y: o.y }, outwardSide(l, o), false)
    r.spawn = Vector3.create(annex.cx, ANNEX_TOP + 0.1, annex.cz)
    return
  }
}

// ---- Hint ----
let hintEnts: Entity[] = []

function clearHint() {
  for (const e of hintEnts) engine.removeEntity(e)
  hintEnts = []
  session.hintUntil = 0
}

/** Ask the solver for the next push from where things stand now, and mark it in the world. */
export function showHint() {
  if (!rt || rt.slide || session.unlocked) return
  clearHint()
  const say = (text: string) => {
    session.hintText = text
    session.hintUntil = Date.now() + 7000
  }
  // where the avatar stands, as a tile (falls back to the level start if it is not on a standable tile)
  const l = rt.level
  let from = l.start
  if (Transform.has(engine.PlayerEntity)) {
    const p = Transform.get(engine.PlayerEntity).position
    const t = { x: Math.floor((p.x - (ORIGIN.x - (l.width * TILE) / 2)) / TILE), y: Math.floor((ORIGIN.z + (l.height * TILE) / 2 - p.z) / TILE) }
    if (t.x >= 0 && t.y >= 0 && t.x < l.width && t.y < l.height && playerCanStand(rt.state, t)) from = t
  }
  const sol = solveFrom(rt.state, from, 60_000)
  if (!sol.solvable) {
    say(sol.truncated ? 'Hint: this level is too big to check from here.' : 'The level cannot be finished from here. Press Restart.')
    return
  }
  if (sol.steps.length === 0) {
    say('Every plate is covered. Head for the door!')
    return
  }
  const step = sol.steps[0]
  const d = DIR_DELTA[step.dir]
  const mark = (pos: Vector3, scale: Vector3) => {
    const e = engine.addEntity()
    Transform.create(e, { position: pos, scale })
    MeshRenderer.setSphere(e)
    Material.setPbrMaterial(e, { albedoColor: FX_COLORS.cyan, emissiveColor: Color3.create(0.3, 0.85, 1), emissiveIntensity: 2.5, roughness: 0.3 })
    hintEnts.push(e)
  }
  mark(tileCentre(step.block, l, FLOOR_TOP + BLOCK_SIZE + 1.3), Vector3.create(0.9, 0.9, 0.9)) // above the block to push
  mark(tileCentre({ x: step.block.x - d.x, y: step.block.y - d.y }, l, FLOOR_TOP + 0.06), Vector3.create(2.6, 0.06, 2.6)) // where to stand
  say(`Hint: stand on the ring and push the marked block. ${sol.pushes} ${sol.pushes === 1 ? 'push' : 'pushes'} to go.`)
}

function hintSystem() {
  if (!hintEnts.length) return
  if (Date.now() > session.hintUntil) {
    clearHint()
    return
  }
  const t = Date.now() / 1000
  const marker = Transform.getMutable(hintEnts[0])
  marker.position = Vector3.create(marker.position.x, marker.position.y + Math.sin(t * 4) * 0.01, marker.position.z)
  const k = 2.6 + Math.sin(t * 5) * 0.25
  const ring = Transform.getMutable(hintEnts[1])
  ring.scale = Vector3.create(k, 0.06, k)
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
  if (rt.bounce && rt.bounce.index === index) endBounce() // pushed again before it finished settling
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
  clearHint()
  if (!res.fell) {
    session.moves = res.state.moves
    if (!session.startedAt) session.startedAt = Date.now()
  }
  samples.length = 0
}

/** Stop the landing deformation: the block goes back to its exact size and resting place. */
function endBounce() {
  if (!rt || !rt.bounce) return
  const b = rt.bounce
  const e = rt.blocks[b.index]
  rt.bounce = null
  if (!e) return
  const tr = Transform.getMutable(e)
  tr.scale = Vector3.One()
  tr.position = Vector3.create(b.bx, FLOOR_TOP + BLOCK_SIZE / 2, b.bz)
}

function slideSystem(dt: number) {
  if (!rt) return
  plateTick(dt)

  // landing: the block is squashed along the way it was travelling, its landing side stays put and it bulges a little across and up,
  // then it springs back with a small overshoot (a damped wobble)
  if (rt.bounce) {
    const b = rt.bounce
    b.t += dt
    if (b.t >= BOUNCE_TIME) endBounce()
    else {
      const a = (1 - Math.exp(-b.t / 0.03)) * Math.exp(-4.5 * b.t) * Math.cos(2 * Math.PI * 1.8 * b.t) // 1 = fully squashed
      const squash = BOUNCE_SQUASH * a
      const along = 1 - squash
      const across = 1 + squash * 0.5
      const tr = Transform.getMutable(rt.blocks[b.index])
      const xAxis = Math.abs(b.dx) > Math.abs(b.dz)
      tr.scale = Vector3.create(xAxis ? along : across, across, xAxis ? across : along)
      const half = BLOCK_SIZE / 2
      tr.position = Vector3.create(b.bx + b.dx * half * (1 - along), FLOOR_TOP + (BLOCK_SIZE * across) / 2, b.bz + b.dz * half * (1 - along))
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
    updatePlatesUnder(t.position, s.index)
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
    // the block drops into the pit until its top is flush with the ice, and stays there as the floor
    if (!s.burst) {
      s.burst = true
      dust(s.to.x, FLOOR_TOP + 0.2, s.to.z, 8, FX_AMBER)
    }
    s.fallT += dt
    const k = Math.min(1, s.fallT / FILL_TIME)
    const ease = 1 - (1 - k) * (1 - k) * (1 - k)
    t.position = Vector3.create(s.to.x, s.to.y - BLOCK_SIZE * ease, s.to.z)
    if (k < 1) return
    // it is no longer a block to push: forget it, but keep the entity (it is cleaned up with the level)
    rt.blocks.splice(s.index, 1)
    dust(s.to.x, FLOOR_TOP + 0.1, s.to.z, 10, FX_AMBER)
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
  if (bounce) {
    // the way it was going when it stopped: the direction of the last leg that moved
    let dx = 0
    let dz = 0
    for (let i = s.lens.length - 1; i >= 0; i--) {
      if (s.lens[i] > 0.01) {
        dx = (s.pts[i + 1].x - s.pts[i].x) / s.lens[i]
        dz = (s.pts[i + 1].z - s.pts[i].z) / s.lens[i]
        break
      }
    }
    endBounce() // a previous wobble that has not finished
    rt.bounce = { index: s.index, t: 0, dx, dz, bx: s.to.x, bz: s.to.z }
  }
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

/** Set by levelStore so the world can report a finished level to the server without importing it. */
let onComplete: ((index: number, moves: number, timeMs: number) => void) | null = null
export const setCompleteHandler = (fn: (index: number, moves: number, timeMs: number) => void) => (onComplete = fn)

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
    onComplete?.(session.levelIndex, session.moves, ms)
  }
  for (const p of rt.plates) {
    const c = Transform.get(p.entity).position
    confetti(c.x, FLOOR_TOP, c.z)
  }
  if (rt.door) confetti(rt.door.cx, FLOOR_TOP, rt.door.cz)
  // walking through the door takes you on to the next level, with the result shown as a short toast there
  if (rt.door && hasNextLevel()) {
    session.advancing = true
    advanceIn = 1.1
    session.toastText = `Level ${session.levelIndex + 1} complete!   ${session.moves} ${session.moves === 1 ? 'move' : 'moves'}   ${fmtTime(ms)}`
    session.toastUntil = Date.now() + 4500
  }
}

let advanceIn = 0
function advanceSystem(dt: number) {
  if (advanceIn <= 0) return
  advanceIn -= dt
  if (advanceIn <= 0) nextLevel()
}

function fmtTime(ms: number): string {
  const t = Math.floor(ms / 100)
  const s = Math.floor(t / 10)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${t % 10}`
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
  buildCave() // the dark cavern around everything
  buildLevelLights(ORIGIN, ELEV)
  buildLobby() // the game starts in the lobby: no level is built until one is picked
  setupFx()
  engine.addSystem(pushSystem, 9, 'sm-push')
  engine.addSystem(slideSystem, 8, 'sm-slide')
  engine.addSystem(playerFallSystem, 7, 'sm-player-fall')
  engine.addSystem(fanSystem, 6, 'sm-fan')
  engine.addSystem(doorSystem, 6, 'sm-door')
  engine.addSystem(hintSystem, 5, 'sm-hint')
  engine.addSystem(advanceSystem, 5, 'sm-advance')
}
