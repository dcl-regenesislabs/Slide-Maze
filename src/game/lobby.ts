// The lobby: a greybox ice cave at ground level where the game starts. A terminal opens the level-select menu, and a
// board is reserved for the leaderboard. Everything here is a placeholder shape until the real art (see
// design/3d-assets.md) replaces it. The levels themselves float 12 m above, see world.ts.

import { Billboard, BillboardMode, engine, Entity, InputAction, Material, MeshCollider, MeshRenderer, pointerEventsSystem, TextShape, Transform } from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { session } from './session'
import { iceModel, slabEntity, stoneModel } from './tiles'
import { WALL_DEPTH, buildCeiling, buildCrystals, buildWallRing } from './wallRing'

const LOBBY_WALL_SCALE = 0.6 // the lobby's walls are the wall modules shrunk to this fraction
export const LOBBY_CENTRE = Vector3.create(64, 0, 14)
/** Where the avatar arrives. Matches the spawn point in scene.json. */
export const LOBBY_SPAWN = Vector3.create(64, 0.1, 6.5)

const ROCK = Color4.create(0.13, 0.18, 0.27, 1)
const ROCK_LIGHT = Color4.create(0.2, 0.27, 0.38, 1)
const FLOOR = Color4.create(0.55, 0.74, 0.88, 1)
const CYAN = Color4.create(0.3, 0.9, 1, 1)
const PINK = Color4.create(1, 0.45, 0.8, 1)

function part(pos: Vector3, size: Vector3, color: Color4, opts: { collider?: boolean; glow?: number; rot?: Quaternion; rough?: number; metal?: number } = {}): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: pos, scale: size, rotation: opts.rot ?? Quaternion.Identity() })
  MeshRenderer.setBox(e)
  if (opts.collider) MeshCollider.setBox(e)
  Material.setPbrMaterial(e, {
    albedoColor: color,
    roughness: opts.rough ?? 0.8,
    metallic: opts.metal ?? 0,
    emissiveColor: opts.glow ? Color3.create(color.r, color.g, color.b) : undefined,
    emissiveIntensity: opts.glow
  })
  return e
}

export function buildLobby() {
  const c = LOBBY_CENTRE
  const W = 30
  const D = 24

  // floor: the game's own tiles, ice inside and a stone ledge around the edge, like a level. The ice top is at y = 0.05, where the old floor was
  for (let j = 0; j < D / 3; j++) {
    for (let i = 0; i < W / 3; i++) {
      const edge = i === 0 || j === 0 || i === W / 3 - 1 || j === D / 3 - 1
      const x = c.x - W / 2 + 1.5 + 3 * i
      const z = c.z - D / 2 + 1.5 + 3 * j
      // ice is 0.5 m thick and stone 0.7 m (0.2 m higher), both with the top at their centre + half the thickness
      slabEntity(Vector3.create(x, edge ? 0.25 - 0.35 : 0.05 - 0.25, z), i, j, 0, edge ? stoneModel : iceModel)
    }
  }

  // the cave walls around the lobby: a smaller ring of wall modules (LOBBY_WALL_SCALE). The south edge is a thin ledge, because
  // the arrival point is right behind it
  const wd = WALL_DEPTH * LOBBY_WALL_SCALE
  const ring = { x0: c.x - W / 2 - 4 - wd, x1: c.x + W / 2 + 4 + wd, z0: 0, z1: c.z + D / 2 + 1 + wd }
  buildWallRing(ring, 1, true, LOBBY_WALL_SCALE)
  buildCeiling(ring, 1, LOBBY_WALL_SCALE) // the lobby has its own ceiling, separate from the game's
  buildCrystals(ring, 1, LOBBY_WALL_SCALE, 0.3, true)

  // glowing crystals
  const crystals: [number, number, number, Color4][] = [
    [-11, 10, 3.2, CYAN], [-9.5, 10.6, 2.2, PINK], [10.5, 10.4, 3.6, CYAN], [12, 9.6, 2.4, PINK], [-13, 2, 2.6, CYAN], [13.2, 3, 2.8, CYAN]
  ]
  for (const [ox, oz, h, col] of crystals) {
    part(Vector3.create(c.x + ox, h / 2, c.z + oz), Vector3.create(0.7, h, 0.7), col, { glow: 2.2, rot: Quaternion.fromEulerDegrees(6, ox * 9, -7), rough: 0.2 })
  }

  // level-select terminal: a pillar with a glowing screen, in front of the avatar's arrival point
  const base = part(Vector3.create(c.x, 0.9, c.z + 2), Vector3.create(1.6, 1.8, 1.2), ROCK_LIGHT, { collider: true, metal: 0.3, rough: 0.5 })
  const screen = part(Vector3.create(c.x, 2.3, c.z + 1.55), Vector3.create(2.4, 1.5, 0.18), CYAN, { collider: true, glow: 1.4, rot: Quaternion.fromEulerDegrees(-18, 0, 0) })
  for (const e of [base, screen]) {
    pointerEventsSystem.onPointerDown(
      { entity: e, opts: { button: InputAction.IA_POINTER, hoverText: 'Select level', maxDistance: 14 } },
      () => {
        session.menuOpen = true
        session.codeOpen = false
      }
    )
  }
  label('SELECT LEVEL', Vector3.create(c.x, 4.4, c.z + 2), 2.6, CYAN)

  // leaderboard board (the real one comes with the server work)
  part(Vector3.create(c.x, 3.6, c.z + D / 2 - 0.4), Vector3.create(11, 4.4, 0.3), Color4.create(0.05, 0.09, 0.17, 1), { glow: 0.15 })
  label('LEADERBOARD\nComing soon', Vector3.create(c.x, 3.6, c.z + D / 2 - 0.7), 2.4, Color4.create(0.95, 0.98, 1, 1))

  // title
  label('SLIDE MAZE', Vector3.create(c.x, 6.2, c.z + 5), 5, Color4.create(0.75, 0.93, 1, 1))
}

function label(text: string, pos: Vector3, size: number, color: Color4) {
  const e = engine.addEntity()
  Transform.create(e, { position: pos })
  TextShape.create(e, { text, fontSize: size, textColor: color, outlineWidth: 0.12, outlineColor: Color3.create(0.02, 0.05, 0.1) })
  Billboard.create(e, { billboardMode: BillboardMode.BM_Y })
}
