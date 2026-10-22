// The cave around everything: a dark floor, rock walls, a ceiling with stalactites, and glowing crystals. Greybox
// shapes (boxes) until the real art replaces them. It is built once and never changes. The only light colour is
// cyan, so warm orange stays the colour of "things you can move". See design/concept-art-prompt.md, Direction J.

import { engine, Entity, LightSource, Material, MeshCollider, MeshRenderer, Transform } from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

const SIZE = 128 // the scene is 8x8 parcels
const CEILING = 60 // metres. The tallest level (31 tiles, 12 m up) stays far below it
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

function part(pos: Vector3, size: Vector3, color: Color4, opts: { collider?: boolean; glow?: number; rot?: Quaternion; rough?: number; matte?: boolean } = {}): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: pos, scale: size, rotation: opts.rot ?? Quaternion.Identity() })
  MeshRenderer.setBox(e)
  if (opts.collider) MeshCollider.setBox(e)
  Material.setPbrMaterial(e, {
    albedoColor: color,
    roughness: opts.rough ?? 0.95,
    metallic: 0,
    specularIntensity: opts.matte ? 0 : undefined, // no highlight at all: a pure matte surface
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

/** An invisible wall along the scene border, so nobody can walk out of the cave. The visible walls are built by wallRing.ts. */
function buildBorder() {
  for (const [x, z, w, d] of [[SIZE / 2, 0.5, SIZE, 1], [SIZE / 2, SIZE - 0.5, SIZE, 1], [0.5, SIZE / 2, 1, SIZE], [SIZE - 0.5, SIZE / 2, 1, SIZE]]) {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(x, CEILING / 2, z), scale: Vector3.create(w, CEILING, d) })
    MeshCollider.setBox(e)
  }
}

export function buildCave() {
  // floor: covers the whole scene, so there is always ground to land on (and to stand on in the lobby)
  part(Vector3.create(SIZE / 2, -0.1, SIZE / 2), Vector3.create(SIZE, 0.22, SIZE), ROCK_DARK, { collider: true, rough: 1, matte: true })

  buildBorder()

}

/** Lights over a level, so the floating slab is evenly lit whatever its size. Called once; the lights stay. */
export function buildLevelLights(centre: Vector3, elevation: number) {
  for (const [dx, dz] of [[-18, -18], [18, -18], [-18, 18], [18, 18]]) {
    light(Vector3.create(centre.x + dx, elevation + 14, centre.z + dz), 12000, 40)
  }
}
