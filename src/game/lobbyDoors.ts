// The three lobby doors, placed in the scene with the Creator Hub (ExitDoor.glb entities). They start shut and dark. When the
// player comes close the runes light up and the doors swing open; walk away and they close and go dark again. Walking into
// the open doorway does the door's job:
//   Levels           -> the first unfinished level (regular play)
//   Community levels -> levels made by the community   } both out of the game for now (ENABLED below): their doors stay
//   Editor           -> the level editor                } shut, dark and solid, and their signs are removed
//
// Finding the doors: by entity name ('Door Levels', 'Door Community Levels', 'Door Editor'), otherwise the three ExitDoor.glb
// entities standing at ground level, left to right (west to east: community, levels, editor). The doors' own placement and
// turn are never touched here, so they can be moved freely in the Hub: code only reads their transform.

import { Animator, ColliderLayer, engine, Entity, GltfContainer, MeshCollider, TextShape, Transform, TriggerArea, triggerAreaEventsSystem } from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { exitGlow } from './doorGlow'
import { openEditor } from './editor'
import { LOBBY_CENTRE } from './lobby'
import { progress, session } from './session'
import { loadLevel } from './world'
import { beginPortalTransition, portalTransition } from './portalTransition'

const DOOR_MODEL = 'assets/models/ExitDoor.glb'
/** Lilita One, the face the UI sprites are lettered in (Google Fonts, SIL OFL: assets/fonts/OFL.txt). */
export const UI_FONT = 'assets/fonts/LilitaOne-Regular.ttf'
const SIGN_FONT_SIZE = 4 // the door signs (the Hub has them at 2.6)
const SIGN_OUTLINE = 0.07 // metres: how far the black outline reaches past the letters
const OPEN_DIST = 6 // metres from the door at which it wakes up
const CLOSE_DIST = 8.5 // metres at which it goes back to sleep (further out than OPEN_DIST, so it does not flicker at the edge)
const GLOW_ON = 1.6
const GLOW_TIME = 0.6 // seconds for the runes to light up (and to go dark again)
const OPEN_TIME = 1 // length of the DoorOpen clip in ExitDoor.glb

type Role = 'levels' | 'community' | 'editor'
const NAMES: Record<Role, string> = { levels: 'Door Levels', community: 'Door Community Levels', editor: 'Door Editor' }
/** Which doors work. The others are kept as scenery: shut, dark, blocking, and with no sign over them. */
const ENABLED: Record<Role, boolean> = { levels: true, community: false, editor: false }
const SIGNS: Record<Role, string> = { levels: 'Sign Levels', community: 'Sign Community Levels', editor: 'Sign Editor' }

interface LobbyDoor {
  role: Role
  entity: Entity
  gate: Entity // invisible collider that keeps the shut doors shut (the leaves move, a model collider would not)
  zone: Entity // the doorway: walking into it with the doors open triggers the door's action
  glow: number // 0..1
  open: number // 0 = shut, 1 = fully open
  inside: boolean // local player occupies the doorway
  used: boolean // re-arm only after leaving the doorway
  want: boolean // the player is close
}

const doors: LobbyDoor[] = []

const actions: Record<Role, () => void | Promise<unknown>> = {
  levels: () => {
    const next = progress.findIndex((level) => !level.done)
    return loadLevel(next < 0 ? 0 : next)
  },
  community: () => {}, // not built yet
  editor: () => openEditor()
}

function findDoors(): [Role, Entity][] {
  const named = (Object.keys(NAMES) as Role[]).map((r) => [r, engine.getEntityOrNullByName(NAMES[r])] as const)
  // any named door counts (one deleted in the Hub must not shuffle the others' roles)
  if (named.some(([, e]) => e)) return named.filter(([, e]) => e).map(([r, e]) => [r, e as Entity])
  // fall back: every ground-level ExitDoor in the scene, west to east
  const found: { e: Entity; x: number }[] = []
  for (const [e, gltf] of engine.getEntitiesWith(GltfContainer, Transform)) {
    const t = Transform.get(e)
    if (gltf.src === DOOR_MODEL && t.position.y < 2) found.push({ e, x: t.position.x })
  }
  found.sort((a, b) => a.x - b.x)
  const roles: Role[] = ['community', 'levels', 'editor']
  return found.slice(0, 3).map((f, i) => [roles[i], f.e])
}

export function setupLobbyDoors() {
  for (const role of Object.keys(SIGNS) as Role[]) {
    const sign = engine.getEntityOrNullByName(SIGNS[role])
    if (!sign) continue
    if (!ENABLED[role]) engine.removeEntity(sign)
    // the signs are TextShapes placed in the Hub; give them the UI's lettering (sans-serif stays as the fallback)
    else if (TextShape.has(sign)) styleSign(sign)
  }
  for (const [role, entity] of findDoors()) {
    const t = Transform.get(entity)
    if (!ENABLED[role]) {
      shutForGood(entity, t)
      continue
    }
    // which way the door looks (+Z of the model) and which side of it the lobby is on; the doorway is on the other side
    const front = Vector3.rotate(Vector3.create(0, 0, 1), t.rotation)
    const toRoom = Vector3.subtract(LOBBY_CENTRE, t.position)
    const inward = Vector3.scale(front, Math.sign(front.x * toRoom.x + front.z * toRoom.z) || 1)

    exitGlow(entity, 0) // dark until someone comes close
    // held on the first frame (closed) with speed 0: an Animator that is not playing can show the open pose
    Animator.createOrReplace(entity, { states: [{ clip: 'DoorOpen', playing: true, loop: false, speed: 0, shouldReset: true }] })

    const gate = engine.addEntity()
    Transform.create(gate, { position: Vector3.create(t.position.x, t.position.y + 2.75, t.position.z), rotation: t.rotation, scale: Vector3.create(3, 5.5, 0.6) })
    MeshCollider.setBox(gate, ColliderLayer.CL_PHYSICS)

    const zone = engine.addEntity()
    Transform.create(zone, {
      position: Vector3.create(t.position.x - inward.x * 1.3, t.position.y + 1.5, t.position.z - inward.z * 1.3),
      rotation: t.rotation,
      scale: Vector3.create(2.4, 3, 1.6)
    })
    TriggerArea.setBox(zone, ColliderLayer.CL_PLAYER)

    const door: LobbyDoor = { role, entity, gate, zone, glow: 0, open: 0, want: false, inside: false, used: false }
    triggerAreaEventsSystem.onTriggerEnter(zone, (result) => {
      if (result.trigger?.entity !== engine.PlayerEntity) return
      door.inside = true
    })
    triggerAreaEventsSystem.onTriggerExit(zone, (result) => {
      if (result.trigger?.entity !== engine.PlayerEntity) return
      door.inside = false
      door.used = false
    })
    doors.push(door)
  }
  engine.addSystem(lobbyDoorSystem, 6, 'sm-lobby-doors')
}

/**
 * Door sign in the UI's lettering: Lilita One, bigger, with a thick black outline (no drop shadow).
 * TextShape's own outline did not show on the explorer, so the outline is built the way the UI does it: black copies of
 * the text nudged all around, just behind the letters (+Z is away from the reader).
 */
function styleSign(sign: Entity) {
  const text = TextShape.getMutable(sign)
  text.fontSrc = UI_FONT
  text.fontSize = SIGN_FONT_SIZE
  text.outlineWidth = 0
  const o = SIGN_OUTLINE
  const offsets: [number, number][] = [
    [-o, 0], [o, 0], [0, -o], [0, o],
    [-o * 0.7, -o * 0.7], [o * 0.7, -o * 0.7], [-o * 0.7, o * 0.7], [o * 0.7, o * 0.7]
  ]
  offsets.forEach(([x, y]) => {
    const e = engine.addEntity()
    Transform.create(e, { parent: sign, position: Vector3.create(x, y, 0.02) })
    TextShape.create(e, { ...text, textColor: Color4.Black(), outlineWidth: 0 })
  })
}

/** A door that is out of use: dark, held shut on the clip's first frame, with a solid gate in its doorway. */
function shutForGood(entity: Entity, t: { position: Vector3; rotation: Quaternion }) {
  exitGlow(entity, 0)
  Animator.createOrReplace(entity, { states: [{ clip: 'DoorOpen', playing: true, loop: false, speed: 0, shouldReset: true }] })
  const gate = engine.addEntity()
  Transform.create(gate, { position: Vector3.create(t.position.x, t.position.y + 2.75, t.position.z), rotation: t.rotation, scale: Vector3.create(3, 5.5, 0.6) })
  MeshCollider.setBox(gate, ColliderLayer.CL_PHYSICS)
}

function lobbyDoorSystem(dt: number) {
  if (!Transform.has(engine.PlayerEntity)) return
  const p = Transform.get(engine.PlayerEntity).position
  for (const d of doors) {
    const dp = Transform.get(d.entity).position
    const dist = Math.hypot(p.x - dp.x, p.z - dp.z)
    if (session.inLobby) {
      if (dist < OPEN_DIST) d.want = true
      else if (dist > CLOSE_DIST) d.want = false
    } else d.want = false

    // runes light up first, then the doors open; on the way out the doors close first, then the runes go dark
    const before = d.open
    if (d.want) {
      if (d.glow < 1) d.glow = Math.min(1, d.glow + dt / GLOW_TIME)
      if (d.glow >= 1) d.open = Math.min(1, d.open + dt / OPEN_TIME)
    } else {
      if (d.open > 0) d.open = Math.max(0, d.open - dt / OPEN_TIME)
      else if (d.glow > 0) d.glow = Math.max(0, d.glow - dt / GLOW_TIME)
    }
    if (d.open !== before || (d.want && d.glow < 1) || (!d.want && d.open === 0 && d.glow > 0)) exitGlow(d.entity, GLOW_ON * d.glow)

    if (d.open > before && before === 0) {
      const st = Animator.getMutable(d.entity).states[0]
      st.playing = true
      st.speed = 1
      st.shouldReset = true
    } else if (d.open < before && (before === 1 || (Animator.get(d.entity).states[0]?.speed ?? 0) > 0)) {
      const st = Animator.getMutable(d.entity).states[0]
      st.playing = true
      st.speed = -1 // the clip plays backwards
      st.shouldReset = false
    }
    if (session.inLobby && d.inside && !d.used && d.open >= 1 && !portalTransition.active) {
      d.used = true
      beginPortalTransition(actions[d.role])
    }
    // the doorway is passable once the leaves are well apart
    const blocked = MeshCollider.has(d.gate)
    if (d.open >= 0.5 && blocked) MeshCollider.deleteFrom(d.gate)
    else if (d.open < 0.5 && !blocked) MeshCollider.setBox(d.gate, ColliderLayer.CL_PHYSICS)
  }
}
