// Floor tiles shared by the game and the lobby: the ice and stone slab models (assets/models), 9 of each. A slab is picked and
// turned (in 90 degree steps) from a hash of its grid position and a seed, so the same layout always looks the same.

import { ColliderLayer, engine, Entity, GltfContainer, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

export const TILE_MODELS = 9
export const iceModel = (n: number) => `assets/models/IceTiles/iceTile0${n}.glb`
export const SNOW_MODELS = 3
export const snowModel = (n: number) => `assets/models/Snow0${n}.glb`
export const stoneModel = (n: number) => `assets/models/StoneTiles/stoneTiles0${n}.glb`

/** Place one slab at `pos` (its centre; ice is 0.5 m thick, stone 0.7 m) with a pick and a turn from the hash of (x, y, seed).
 * `count` is how many variants `model` has; `collide` false makes it visual only (the snow mounds). */
export function slabEntity(pos: Vector3, x: number, y: number, seed: number, model: (n: number) => string, count = TILE_MODELS, collide = true): Entity {
  let h = Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul(seed + 1, 83492791)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  const e = engine.addEntity()
  Transform.create(e, { position: pos, rotation: Quaternion.fromEulerDegrees(0, 90 * ((h >>> 8) & 3), 0) })
  GltfContainer.create(e, { src: model(1 + ((h >>> 0) % count)), visibleMeshesCollisionMask: collide ? ColliderLayer.CL_PHYSICS : 0 })
  return e
}
