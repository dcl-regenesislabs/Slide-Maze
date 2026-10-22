// A ring of cave-wall modules (assets/models/envWalls) around a rectangle. Used twice: around the lobby, and around every
// level, sized to the level so the walls grow with it. Each module has an invisible "_collider" child, the only part that collides.
//
// Module geometry (from the models): a straight module is about 14 m wide and 6.6-9 m deep, centred on its pivot, with its
// flat back at z = 0 and its front face looking along +Z. The corner module is modelled in x -14..0, z 0..14, but the model
// is mirrored in x when it is loaded into the scene (glTF is right-handed), so in the scene it fills x 0..14, z 0..14 from its pivot.

import { ColliderLayer, engine, Entity, GltfContainer, LightSource, Material, MeshRenderer, Transform } from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

const DIR = 'assets/models/envWalls/'
const STRAIGHT = [
  { file: 'Wall_straight_01.glb', back: 0 },
  { file: 'Wall_straight_02.glb', back: 0 },
  { file: 'Wall_straight_03.glb', back: 1.3 }, // this one sticks 1.3 m out behind its pivot, so it is pushed inwards by that much
  { file: 'Wall_straight_04.glb', back: 0 }
]
const CORNER = 'Wall_corner_01.glb'

/** How deep a straight module is, and how big the corner is. */
export const WALL_DEPTH = 8
export const CORNER_SIZE = 14
const PITCH = 10 // modules are about 14 m wide, so a 10 m pitch makes them overlap and hide their joints
const SCENE = 128
const THIN_DEPTH = 0.25 // a "thin" edge squashes its modules to this fraction of their depth

export interface Rect {
  x0: number // the BACK of each wall (the side away from the playfield), so the wall is built inwards from here
  x1: number
  z0: number
  z1: number
}

/** A rectangle centred on `centre` with the given inner half-sizes (the clear space inside), grown by the wall depth and clamped to the scene. */
export function ringAround(centre: { x: number; z: number }, halfX: number, halfZ: number, gap: number, sc = 1): Rect {
  const hx = Math.min(halfX + gap + WALL_DEPTH * sc, SCENE / 2 - 0.5)
  const hz = Math.min(halfZ + gap + WALL_DEPTH * sc, SCENE / 2 - 0.5)
  return { x0: centre.x - hx, x1: centre.x + hx, z0: centre.z - hz, z1: centre.z + hz }
}

function piece(out: Entity[], file: string, pos: Vector3, yaw: number, scaleY = 1, scaleZ = 1, scaleX = scaleY) {
  const e = engine.addEntity()
  Transform.create(e, { position: pos, rotation: Quaternion.fromEulerDegrees(0, yaw, 0), scale: Vector3.create(scaleX, scaleY, scaleZ) })
  GltfContainer.create(e, { src: DIR + file, visibleMeshesCollisionMask: 0, invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS })
  out.push(e)
}

/**
 * Build the ring. `thinSouth` squashes the south edge's straight modules to a thin ledge (the lobby's arrival point is right
 * behind that edge). `sc` scales every module uniformly (a smaller ring for the lobby). `seed` makes the random choice of modules repeatable. Returns the entities, so a level can remove them.
 */
export function buildWallRing(r: Rect, seed: number, thinSouth = false, sc = 1): Entity[] {
  const out: Entity[] = []
  let s = (seed * 2654435761 + 12345) >>> 0
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
  const w = r.x1 - r.x0
  const d = r.z1 - r.z0
  const corner = CORNER_SIZE * sc

  // each edge: the length it runs, where its pivot sits at distance t along it, and the yaw that turns the front face inwards
  const edges = [
    { len: w, yaw: 0, at: (t: number) => Vector3.create(r.x0 + corner + t, 0, r.z0), thin: thinSouth }, // south, facing +Z
    { len: w, yaw: 180, at: (t: number) => Vector3.create(r.x1 - corner - t, 0, r.z1), thin: false }, // north, facing -Z
    { len: d, yaw: 90, at: (t: number) => Vector3.create(r.x0, 0, r.z1 - corner - t), thin: false }, // west, facing +X
    { len: d, yaw: 270, at: (t: number) => Vector3.create(r.x1, 0, r.z0 + corner + t), thin: false } // east, facing -X
  ]
  for (const edge of edges) {
    const span = edge.len - 2 * corner
    if (span < 2) continue
    const count = Math.max(1, Math.round(span / (PITCH * sc)))
    const pitch = span / count
    let last = -1
    for (let i = 0; i < count; i++) {
      let v = Math.floor(rnd() * STRAIGHT.length)
      if (v === last) v = (v + 1) % STRAIGHT.length // never the same module twice in a row
      last = v
      const depth = edge.thin ? THIN_DEPTH : 1
      const rad = (edge.yaw * Math.PI) / 180
      const push = STRAIGHT[v].back * depth * sc
      const base = edge.at(pitch * (i + 0.5))
      const pos = Vector3.create(base.x + Math.sin(rad) * push, 0, base.z + Math.cos(rad) * push)
      piece(out, STRAIGHT[v].file, pos, edge.yaw, (0.9 + rnd() * 0.14) * sc, depth * sc, sc)
    }
  }
  // corners: the module fills x 0..14, z 0..14 from its pivot (the south-west corner at no rotation), turned to fill each corner
  piece(out, CORNER, Vector3.create(r.x0, 0, r.z0), 0, sc, sc) // south-west
  piece(out, CORNER, Vector3.create(r.x0, 0, r.z1), 90, sc, sc) // north-west
  piece(out, CORNER, Vector3.create(r.x1, 0, r.z1), 180, sc, sc) // north-east
  piece(out, CORNER, Vector3.create(r.x1, 0, r.z0), 270, sc, sc) // south-east
  return out
}

// ---- Ceiling and crystals for a ring ----
const ROCK_DARK = Color4.create(0.07, 0.1, 0.16, 1)
const ROCK_LIGHT = Color4.create(0.19, 0.25, 0.34, 1)
const CYAN = Color4.create(0.3, 0.9, 1, 1)
const PINK = Color4.create(1, 0.45, 0.8, 1)
const CEILING_Y = 46 // metres: the underside of a full-size ring's ceiling, below the shortest wall (about 49 m)

function solid(out: Entity[], pos: Vector3, size: Vector3, color: Color4, opts: { glow?: number; rot?: Quaternion; rough?: number } = {}) {
  const e = engine.addEntity()
  Transform.create(e, { position: pos, scale: size, rotation: opts.rot ?? Quaternion.Identity() })
  MeshRenderer.setBox(e)
  Material.setPbrMaterial(e, {
    albedoColor: color,
    roughness: opts.rough ?? 0.95,
    emissiveColor: opts.glow ? Color3.create(color.r, color.g, color.b) : undefined,
    emissiveIntensity: opts.glow
  })
  out.push(e)
}

/** A rock ceiling over the ring, with stalactites hanging from it. It sits just under the wall tops, so the ring is closed. */
export function buildCeiling(r: Rect, seed: number, sc = 1): Entity[] {
  const out: Entity[] = []
  let s = (seed * 2246822519 + 777) >>> 0
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
  const y = CEILING_Y * sc
  const cx = (r.x0 + r.x1) / 2
  const cz = (r.z0 + r.z1) / 2
  // slightly bigger than the ring, so no gap shows over the walls
  solid(out, Vector3.create(cx, y + 2, cz), Vector3.create(r.x1 - r.x0 + 2, 4, r.z1 - r.z0 + 2), ROCK_DARK)
  const inset = WALL_DEPTH * sc
  const area = (r.x1 - r.x0 - 2 * inset) * (r.z1 - r.z0 - 2 * inset)
  const n = Math.max(6, Math.min(40, Math.round(area / 150)))
  for (let i = 0; i < n; i++) {
    const w = (1.5 + rnd() * 3) * sc
    const h = (6 + rnd() * 14) * sc
    const x = r.x0 + inset + rnd() * (r.x1 - r.x0 - 2 * inset)
    const z = r.z0 + inset + rnd() * (r.z1 - r.z0 - 2 * inset)
    solid(out, Vector3.create(x, y - h / 2, z), Vector3.create(w, h, w), ROCK_LIGHT, {
      rot: Quaternion.fromEulerDegrees((rnd() - 0.5) * 6, rnd() * 90, (rnd() - 0.5) * 6)
    })
  }
  return out
}

/**
 * Clusters of glowing crystals growing out of the walls of the ring: each cluster is several crystals of different sizes
 * fanning out from one base, leaning into the room. Some clusters sit on the wall face at different heights and some at its
 * foot, with a few real lights among them. `pink` is the share of clusters that are pink instead of cyan. `skipSouth` leaves
 * the south edge alone (the lobby's is a thin ledge).
 */
export function buildCrystals(r: Rect, seed: number, sc = 1, pink = 0, skipSouth = false): Entity[] {
  const out: Entity[] = []
  let s = (seed * 3266489917 + 99) >>> 0
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
  const corner = CORNER_SIZE * sc
  const edges = [
    { len: r.x1 - r.x0, yaw: 0, at: (t: number) => Vector3.create(r.x0 + corner + t, 0, r.z0), skip: skipSouth },
    { len: r.x1 - r.x0, yaw: 180, at: (t: number) => Vector3.create(r.x1 - corner - t, 0, r.z1), skip: false },
    { len: r.z1 - r.z0, yaw: 90, at: (t: number) => Vector3.create(r.x0, 0, r.z1 - corner - t), skip: false },
    { len: r.z1 - r.z0, yaw: 270, at: (t: number) => Vector3.create(r.x1, 0, r.z0 + corner + t), skip: false }
  ].filter((e) => !e.skip && e.len - 2 * corner > 4)
  if (edges.length === 0) return out
  const perimeter = edges.reduce((a, e) => a + e.len, 0)
  const clusters = Math.max(4, Math.round(perimeter / (16 * sc + 4)))
  const lights: Vector3[] = []
  for (let c = 0; c < clusters; c++) {
    const edge = edges[Math.floor(rnd() * edges.length)]
    const span = edge.len - 2 * corner
    const base = edge.at(rnd() * span)
    const rad = (edge.yaw * Math.PI) / 180
    const inward = Vector3.create(Math.sin(rad), 0, Math.cos(rad))
    const side = Vector3.create(Math.cos(rad), 0, -Math.sin(rad)) // along the edge
    const onFloor = c % 3 === 2 // every third cluster sits at the foot of the wall, the others on the wall face
    const y = onFloor ? 0 : (7 + rnd() * 30) * sc
    const depth = onFloor ? WALL_DEPTH * sc * 0.75 + 1 + rnd() * 2 : WALL_DEPTH * sc * (0.55 + rnd() * 0.25)
    const lateral = (rnd() - 0.5) * 4 * sc
    const anchor = Vector3.create(base.x + inward.x * depth + side.x * lateral, y, base.z + inward.z * depth + side.z * lateral)
    const col = rnd() < pink ? PINK : CYAN
    const n = 5 + Math.floor(rnd() * 4)
    const lead = (onFloor ? 1.6 + rnd() * 1.4 : 2 + rnd() * 1.8) * sc // length of the biggest crystal in the cluster
    for (let k = 0; k < n; k++) {
      const len = lead * (k === 0 ? 1 : 0.3 + rnd() * 0.55)
      const w = Math.max(0.22 * sc, len * (0.16 + rnd() * 0.1))
      const tilt = (onFloor ? 8 + rnd() * 30 : 45 + rnd() * 25) + (rnd() - 0.5) * 22
      const yaw = edge.yaw + (rnd() - 0.5) * 80
      const yr = (yaw * Math.PI) / 180
      const tr = (tilt * Math.PI) / 180
      const tip = Vector3.create(Math.sin(yr) * Math.sin(tr), Math.cos(tr), Math.cos(yr) * Math.sin(tr))
      const off = Vector3.create(anchor.x + side.x * (rnd() - 0.5) * 1.4 * sc, anchor.y + (rnd() - 0.5) * 1.2 * sc, anchor.z + side.z * (rnd() - 0.5) * 1.4 * sc)
      const half = len / 2 - 0.2
      solid(out, Vector3.create(off.x + tip.x * half, off.y + tip.y * half, off.z + tip.z * half), Vector3.create(w, len, w), col, {
        glow: 2.6,
        rough: 0.2,
        rot: Quaternion.multiply(Quaternion.fromEulerDegrees(0, yaw, 0), Quaternion.fromEulerDegrees(tilt, rnd() * 40, 0))
      })
    }
    if (c % 4 === 0) lights.push(Vector3.create(anchor.x + inward.x * 3, anchor.y + 1, anchor.z + inward.z * 3))
  }
  // a few real lights: dynamic lights are costly, so only at some clusters
  for (const p of lights.slice(0, 4)) {
    const e = engine.addEntity()
    Transform.create(e, { position: p })
    LightSource.create(e, { type: LightSource.Type.Point({}), color: Color3.create(0.35, 0.85, 1), intensity: 9000 * sc, range: 28 * Math.max(sc, 0.6) })
    out.push(e)
  }
  return out
}
