// The lobby: a greybox ice cave at ground level where the game starts. A terminal opens the level-select menu, and a
// board is reserved for the leaderboard. Everything here is a placeholder shape until the real art (see
// design/3d-assets.md) replaces it. The levels themselves float 12 m above, see world.ts.

import { Billboard, BillboardMode, engine, Entity, InputAction, Material, MeshCollider, MeshRenderer, pointerEventsSystem, TextShape, Transform } from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { session } from './session'

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

  // floor (its top is at ground level so the avatar just walks on it)
  part(Vector3.create(c.x, -0.05, c.z), Vector3.create(W, 0.1, D), FLOOR, { collider: true, rough: 0.15, metal: 0.1 })

  // cave walls: back, two sides, and a low front lip behind the spawn
  part(Vector3.create(c.x, 3.5, c.z + D / 2), Vector3.create(W + 1, 7, 1), ROCK, { collider: true })
  part(Vector3.create(c.x - W / 2, 3.5, c.z), Vector3.create(1, 7, D), ROCK, { collider: true })
  part(Vector3.create(c.x + W / 2, 3.5, c.z), Vector3.create(1, 7, D), ROCK, { collider: true })
  part(Vector3.create(c.x, 3.5, c.z - D / 2), Vector3.create(W + 1, 7, 1), ROCK, { collider: true })

  // rocks along the walls, tilted so the room does not look like a box
  const rocks: [number, number, number, number, number][] = [
    [-13, 9, 3, 4, 20], [12, 10, 3.5, 5, -15], [-12, -8, 2.5, 3, 35], [13, -7, 3, 4, -30], [-6, 11, 2.5, 3, 10], [7, 11.2, 3, 3.5, -25]
  ]
  for (const [ox, oz, w, h, yaw] of rocks) {
    part(Vector3.create(c.x + ox, h / 2, c.z + oz), Vector3.create(w, h, w * 0.9), ROCK_LIGHT, { collider: true, rot: Quaternion.fromEulerDegrees(0, yaw, 0) })
  }

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
