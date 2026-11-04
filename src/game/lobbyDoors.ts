// The three lobby doors, placed in the scene with the Creator Hub (ExitDoor.glb entities). They start shut and dark. When the
// player comes close the runes light up and the doors swing open; walk away and they close and go dark again. Walking into
// the open doorway does the door's job:
//   Levels           -> the level-select menu (regular play)
//   Community levels -> levels made by the community (not built yet: a note for now)
//   Editor           -> the level editor
//
// Finding the doors: by entity name ('Door Levels', 'Door Community Levels', 'Door Editor'), otherwise the three ExitDoor.glb
// entities standing at ground level, left to right (west to east: community, levels, editor). The doors' own placement and
// turn are never touched here, so they can be moved freely in the Hub: code only reads their transform.

import { Animator, ColliderLayer, engine, Entity, GltfContainer, MeshCollider, Transform, TriggerArea, triggerAreaEventsSystem } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { exitGlow } from './doorGlow'
import { openEditor } from './editor'
import { LOBBY_CENTRE } from './lobby'
import { session } from './session'

const DOOR_MODEL = 'assets/models/ExitDoor.glb'
const OPEN_DIST = 6 // metres from the door at which it wakes up
const CLOSE_DIST = 8.5 // metres at which it goes back to sleep (further out than OPEN_DIST, so it does not flicker at the edge)
const GLOW_ON = 1.6
const GLOW_TIME = 0.6 // seconds for the runes to light up (and to go dark again)
const OPEN_TIME = 1 // length of the DoorOpen clip in ExitDoor.glb

type Role = 'levels' | 'community' | 'editor'
const NAMES: Record<Role, string> = { levels: 'Door Levels', community: 'Door Community Levels', editor: 'Door Editor' }

interface LobbyDoor {
  role: Role
  entity: Entity
  gate: Entity // invisible collider that keeps the shut doors shut (the leaves move, a model collider would not)
  zone: Entity // the doorway: walking into it with the doors open triggers the door's action
  glow: number // 0..1
  open: number // 0 = shut, 1 = fully open
  want: boolean // the player is close
}

const doors: LobbyDoor[] = []

const actions: Record<Role, () => void> = {
  levels: () => {
    session.menuOpen = true
    session.codeOpen = false
  },
  community: () => {
    session.toastText = 'Community levels are coming soon!'
    session.toastUntil = Date.now() + 3500
  },
  editor: () => openEditor()
}

function findDoors(): [Role, Entity][] {
  const named = (Object.keys(NAMES) as Role[]).map((r) => [r, engine.getEntityOrNullByName(NAMES[r])] as const)
  if (named.every(([, e]) => e)) return named.map(([r, e]) => [r, e as Entity])
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
  for (const [role, entity] of findDoors()) {
    const t = Transform.get(entity)
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

    const door: LobbyDoor = { role, entity, gate, zone, glow: 0, open: 0, want: false }
    triggerAreaEventsSystem.onTriggerEnter(zone, (result) => {
      if (result.trigger?.entity !== engine.PlayerEntity) return
      if (session.inLobby && door.open >= 1) actions[role]()
    })
    doors.push(door)
  }
  engine.addSystem(lobbyDoorSystem, 6, 'sm-lobby-doors')
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
    // the doorway is passable once the leaves are well apart
    const blocked = MeshCollider.has(d.gate)
    if (d.open >= 0.5 && blocked) MeshCollider.deleteFrom(d.gate)
    else if (d.open < 0.5 && !blocked) MeshCollider.setBox(d.gate, ColliderLayer.CL_PHYSICS)
  }
}
