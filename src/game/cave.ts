// The cave around everything: a dark floor, rock walls, a ceiling with stalactites, and glowing crystals. Greybox
// shapes (boxes) until the real art replaces them. It is built once and never changes. The only light colour is
// cyan, so warm orange stays the colour of "things you can move". See design/concept-art-prompt.md, Direction J.

import { engine, Entity, LightSource, Material, MeshCollider, MeshRenderer, SkyboxTime, Transform } from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

const SIZE = 128 // the scene is 8x8 parcels
const CEILING = 60 // metres. The tallest level (31 tiles, 12 m up) stays far below it
/** Time of day for the sky light: 0 = midnight, so only the crystals and the lights below really light the cave. */
const CAVE_TIME = 0

const ROCK_DARK = Color4.create(0.07, 0.1, 0.16, 1)
const ROCK = Color4.create(0.12, 0.17, 0.25, 1)
const ROCK_LIGHT = Color4.create(0.19, 0.25, 0.34, 1)
const CYAN = Color4.create(0.3, 0.9, 1, 1)

// A small seeded random so the cave looks the same every time (and the same for every player).
let seed = 20261207
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}
const range = (a: number, b: number) => a + rnd() * (b - a)

function part(pos: Vector3, size: Vector3, color: Color4, opts: { collider?: boolean; glow?: number; rot?: Quaternion; rough?: number } = {}): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: pos, scale: size, rotation: opts.rot ?? Quaternion.Identity() })
  MeshRenderer.setBox(e)
  if (opts.collider) MeshCollider.setBox(e)
  Material.setPbrMaterial(e, {
    albedoColor: color,
    roughness: opts.rough ?? 0.95,
    emissiveColor: opts.glow ? Color3.create(color.r, color.g, color.b) : undefined,
    emissiveIntensity: opts.glow
  })
  return e
}

function light(pos: Vector3, intensity: number, range: number) {
  const e = engine.addEntity()
  Transform.create(e, { position: pos })
  LightSource.create(e, { type: LightSource.Type.Point({}), color: Color3.create(0.35, 0.85, 1), intensity, range })
}

export function buildCave() {
  SkyboxTime.createOrReplace(engine.RootEntity, { fixedTime: CAVE_TIME })

  // floor: covers the whole scene, so there is always ground to land on (and to stand on in the lobby)
  part(Vector3.create(SIZE / 2, -0.1, SIZE / 2), Vector3.create(SIZE, 0.22, SIZE), ROCK_DARK, { collider: true, rough: 0.8 })

  // ceiling
  part(Vector3.create(SIZE / 2, CEILING + 2, SIZE / 2), Vector3.create(SIZE, 4, SIZE), ROCK_DARK)

  // perimeter walls (inside the scene bounds; the south one is thin because the lobby's arrival point is right behind it)
  part(Vector3.create(SIZE / 2, CEILING / 2, 1), Vector3.create(SIZE, CEILING, 2), ROCK, { collider: true })
  part(Vector3.create(SIZE / 2, CEILING / 2, SIZE - 2), Vector3.create(SIZE, CEILING, 4), ROCK, { collider: true })
  part(Vector3.create(2, CEILING / 2, SIZE / 2), Vector3.create(4, CEILING, SIZE), ROCK, { collider: true })
  part(Vector3.create(SIZE - 2, CEILING / 2, SIZE / 2), Vector3.create(4, CEILING, SIZE), ROCK, { collider: true })

  // irregular rock masses leaning against the walls, so the cavern has depth instead of flat slabs
  for (let i = 0; i < 46; i++) {
    const side = Math.floor(rnd() * 4)
    const along = range(6, SIZE - 6)
    const inset = range(4, 12)
    const w = range(5, 13)
    const h = range(14, 46)
    const d = range(5, 12)
    const x = side === 0 ? along : side === 1 ? along : side === 2 ? inset : SIZE - inset
    const z = side === 0 ? inset : side === 1 ? SIZE - inset : along
    // keep the lobby's arrival area (south wall, around the spawn) clear
    if (side === 0 && Math.abs(x - 64) < 22) continue
    part(Vector3.create(x, h / 2, z), Vector3.create(w, h, d), i % 3 === 0 ? ROCK_LIGHT : ROCK, {
      collider: true,
      rot: Quaternion.fromEulerDegrees(range(-5, 5), range(0, 90), range(-5, 5))
    })
  }

  // stalactites hanging from the ceiling
  for (let i = 0; i < 60; i++) {
    const w = range(1.5, 4.5)
    const h = range(6, 20)
    part(Vector3.create(range(8, SIZE - 8), CEILING - h / 2, range(8, SIZE - 8)), Vector3.create(w, h, w), ROCK_LIGHT, {
      rot: Quaternion.fromEulerDegrees(range(-3, 3), range(0, 90), range(-3, 3))
    })
  }

  // glowing crystals on the floor around the edges, cyan only
  const lit: Vector3[] = []
  for (let i = 0; i < 22; i++) {
    const edge = Math.floor(rnd() * 4)
    const t = range(10, SIZE - 10)
    const pos = Vector3.create(edge === 2 ? range(6, 14) : edge === 3 ? SIZE - range(6, 14) : t, 0, edge === 0 ? range(6, 14) : edge === 1 ? SIZE - range(6, 14) : t)
    if (edge === 0 && Math.abs(pos.x - 64) < 20) continue // not inside the lobby
    const h = range(3, 9)
    const w = range(0.9, 1.8)
    part(Vector3.create(pos.x, h / 2, pos.z), Vector3.create(w, h, w), CYAN, {
      glow: 2.4,
      rough: 0.2,
      rot: Quaternion.fromEulerDegrees(range(-12, 12), range(0, 90), range(-12, 12))
    })
    if (i % 4 === 0) lit.push(Vector3.create(pos.x, h + 1, pos.z))
  }
  // a handful of real lights: dynamic lights are costly, so only a few, at crystal clusters
  for (const p of lit.slice(0, 5)) light(p, 9000, 28)
}

/** Lights over a level, so the floating slab is evenly lit whatever its size. Called once; the lights stay. */
export function buildLevelLights(centre: Vector3, elevation: number) {
  for (const [dx, dz] of [[-18, -18], [18, -18], [-18, 18], [18, 18]]) {
    light(Vector3.create(centre.x + dx, elevation + 14, centre.z + dz), 12000, 40)
  }
}
