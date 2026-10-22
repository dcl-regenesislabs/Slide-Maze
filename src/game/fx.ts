// Visual effects built from plain cubes and spheres (no particle systems): each effect is a small glowing primitive
// that flies, spins, grows or shrinks and then removes itself. Everything is driven by one system.

import { engine, Entity, Material, MaterialTransparencyMode, MeshRenderer, Transform } from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

interface Fx {
  e: Entity
  age: number
  life: number
  px: number
  py: number
  pz: number
  vx: number
  vy: number
  vz: number
  gravity: number
  spin: Vector3 // degrees per second
  from: Vector3 // scale at birth
  to: Vector3 // scale at death
  out: boolean // ease-out scaling (fast start) instead of linear
  bell: boolean // scale swells from `from` up to `to` early in life (about a third in) and shrinks away to almost nothing by the end
}

const live: Fx[] = []
const MAX_FX = 180 // keeps the entity count bounded when effects stack up

export const FX_COLORS = {
  ice: Color4.create(0.75, 0.93, 1, 1),
  snow: Color4.create(1, 1, 1, 1),
  amber: Color4.create(1, 0.7, 0.2, 1),
  green: Color4.create(0.3, 1, 0.55, 1),
  cyan: Color4.create(0.3, 0.85, 1, 1),
  pink: Color4.create(1, 0.45, 0.7, 1),
  dark: Color4.create(0.1, 0.15, 0.25, 1)
}
const CONFETTI = [FX_COLORS.amber, FX_COLORS.green, FX_COLORS.cyan, FX_COLORS.pink, FX_COLORS.snow]

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const v3 = (x: number, y: number, z: number) => Vector3.create(x, y, z)
const uni = (s: number) => v3(s, s, s)

function spawn(
  shape: 'box' | 'sphere',
  pos: Vector3,
  from: Vector3,
  to: Vector3,
  color: Color4,
  glow: number,
  life: number,
  vel = Vector3.Zero(),
  gravity = 0,
  spin = Vector3.Zero(),
  out = false,
  rotation = Quaternion.Identity(),
  bell = false
) {
  if (live.length >= MAX_FX) return
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.clone(pos), scale: from, rotation })
  if (shape === 'box') MeshRenderer.setBox(e)
  else MeshRenderer.setSphere(e)
  Material.setPbrMaterial(e, {
    albedoColor: color,
    emissiveColor: Color3.create(color.r, color.g, color.b),
    emissiveIntensity: glow,
    roughness: 0.4,
    transparencyMode: color.a < 1 ? MaterialTransparencyMode.MTM_ALPHA_BLEND : undefined // a colour with alpha is see-through
  })
  live.push({ e, age: 0, life, px: pos.x, py: pos.y, pz: pos.z, vx: vel.x, vy: vel.y, vz: vel.z, gravity, spin, from, to, out, bell })
}

/** Ice shards shed behind a sliding block. Call every few frames while it slides. */
export function trail(x: number, y: number, z: number, backX: number, backZ: number) {
  for (let i = 0; i < 2; i++) {
    const s = rnd(0.16, 0.34)
    spawn(
      'box',
      v3(x + rnd(-0.9, 0.9), y, z + rnd(-0.9, 0.9)),
      uni(s),
      uni(0),
      FX_COLORS.ice,
      1.2,
      rnd(0.3, 0.5),
      v3(backX * rnd(1, 3), rnd(0.6, 1.8), backZ * rnd(1, 3)),
      6,
      v3(rnd(-360, 360), rnd(-360, 360), rnd(-360, 360))
    )
  }
}

/**
 * A block comes to rest: a square frame (four flat glowing bars) on the ice around its footprint that grows outward while it thins
 * to nothing, plus shards thrown outward.
 */
export function stopBurst(x: number, y: number, z: number) {
  const r0 = 1.5 // half-width of the frame at the start: just outside the block
  const r1 = 2.5 // and at the end
  const life = 0.5
  const v = (r1 - r0) / life
  const len0 = 2 * r0 + 0.25
  const len1 = 2 * r1 + 0.05
  for (const [ax, az] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const alongX = az !== 0 // the bars on the north and south sides run along x
    spawn(
      'box',
      v3(x + ax * r0, y + 0.06, z + az * r0),
      alongX ? v3(len0, 0.07, 0.22) : v3(0.22, 0.07, len0),
      alongX ? v3(len1, 0.01, 0.03) : v3(0.03, 0.01, len1),
      FX_COLORS.ice,
      1.8,
      life,
      v3(ax * v, 0, az * v),
      0,
      Vector3.Zero(),
      true
    )
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rnd(-0.2, 0.2)
    const sp = rnd(3, 6)
    const s = rnd(0.14, 0.3)
    spawn('box', v3(x, y + 0.2, z), uni(s), uni(0), FX_COLORS.snow, 1.4, rnd(0.4, 0.7), v3(Math.cos(a) * sp, rnd(2, 4.5), Math.sin(a) * sp), 14, v3(rnd(-540, 540), rnd(-540, 540), 0))
  }
}

/** Snow puffed at the avatar's feet while leaning on a block. */
export function dust(x: number, y: number, z: number, n: number, color: Color4 = FX_COLORS.snow) {
  for (let i = 0; i < n; i++) {
    const s = rnd(0.12, 0.26)
    spawn('box', v3(x + rnd(-0.5, 0.5), y, z + rnd(-0.5, 0.5)), uni(s), uni(0), color, 1, rnd(0.3, 0.55), v3(rnd(-1, 1), rnd(0.8, 2), rnd(-1, 1)), 4, v3(rnd(-300, 300), rnd(-300, 300), 0))
  }
}

/** A plate just got covered: a green ring and sparks rising off it. */
export function plateOn(x: number, y: number, z: number) {
  spawn('sphere', v3(x, y + 0.05, z), v3(1, 0.08, 1), v3(5, 0.01, 5), FX_COLORS.green, 2.5, 0.6, Vector3.Zero(), 0, Vector3.Zero(), true)
  for (let i = 0; i < 8; i++) {
    const s = rnd(0.12, 0.24)
    spawn('box', v3(x + rnd(-1, 1), y + 0.1, z + rnd(-1, 1)), uni(s), uni(0), FX_COLORS.green, 2.5, rnd(0.7, 1.1), v3(rnd(-0.6, 0.6), rnd(2.5, 4.5), rnd(-0.6, 0.6)), 1, v3(0, rnd(-400, 400), 0))
  }
}

/** Level complete: a confetti fountain of coloured cubes. */
export function confetti(x: number, y: number, z: number) {
  for (let i = 0; i < 26; i++) {
    const a = rnd(0, Math.PI * 2)
    const sp = rnd(1.5, 5)
    const s = rnd(0.16, 0.34)
    spawn('box', v3(x, y + 0.3, z), uni(s), uni(0.02), CONFETTI[i % CONFETTI.length], 2, rnd(1.1, 1.8), v3(Math.cos(a) * sp, rnd(7, 12), Math.sin(a) * sp), 16, v3(rnd(-720, 720), rnd(-720, 720), rnd(-720, 720)))
  }
}

/** A streak of wind drifting along a fan's lane. (fx, fz) is the unit direction the wind blows. */
export function windStreak(x: number, y: number, z: number, fx: number, fz: number, dist: number) {
  const speed = 9
  const yaw = (Math.atan2(fx, fz) * 180) / Math.PI
  // a thin, long stretched sphere along the direction of travel: the same streak as the original boxes, lighter to draw on mobile
  spawn('sphere', v3(x, y, z), v3(0.09, 0.09, 1.6), v3(0.04, 0.04, 0.4), FX_COLORS.ice, 1.6, dist / speed, v3(fx * speed, 0, fz * speed), 0, Vector3.Zero(), false, Quaternion.fromEulerDegrees(0, yaw, 0))
}

/** A block drops into a hole: dark chips and a dull ring. */
export function holeBurst(x: number, y: number, z: number) {
  spawn('sphere', v3(x, y + 0.04, z), v3(1, 0.08, 1), v3(4.5, 0.01, 4.5), FX_COLORS.cyan, 1, 0.5, Vector3.Zero(), 0, Vector3.Zero(), true)
  for (let i = 0; i < 10; i++) {
    const a = rnd(0, Math.PI * 2)
    const sp = rnd(1.5, 4)
    const s = rnd(0.16, 0.34)
    spawn('box', v3(x, y, z), uni(s), uni(0), FX_COLORS.dark, 0.2, rnd(0.5, 0.9), v3(Math.cos(a) * sp, rnd(2, 5), Math.sin(a) * sp), 14, v3(rnd(-540, 540), rnd(-540, 540), 0))
  }
}

function fxSystem(dt: number) {
  for (let i = live.length - 1; i >= 0; i--) {
    const f = live[i]
    f.age += dt
    const t = f.age / f.life
    if (t >= 1) {
      engine.removeEntity(f.e)
      live.splice(i, 1)
      continue
    }
    f.vy -= f.gravity * dt
    f.px += f.vx * dt
    f.py += f.vy * dt
    f.pz += f.vz * dt
    const u = f.bell ? Math.sin(Math.PI * Math.pow(t, 0.6)) : f.out ? 1 - (1 - t) * (1 - t) : t
    const tr = Transform.getMutable(f.e)
    tr.position = Vector3.create(f.px, f.py, f.pz)
    tr.scale = Vector3.lerp(f.from, f.to, u)
    if (f.spin.x || f.spin.y || f.spin.z) {
      tr.rotation = Quaternion.fromEulerDegrees(f.spin.x * f.age, f.spin.y * f.age, f.spin.z * f.age)
    }
  }
}

export function setupFx() {
  engine.addSystem(fxSystem, 5, 'sm-fx')
}

/** Drop every live effect (used when a level is rebuilt so nothing is left hanging in mid-air). */
export function clearFx() {
  for (const f of live) engine.removeEntity(f.e)
  live.length = 0
}
