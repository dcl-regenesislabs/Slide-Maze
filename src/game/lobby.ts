// The lobby: an ice cave at ground level where the game starts. Its geometry lives in the scene (assets/scene/main.composite,
// the "Lobby" group), so it can be edited visually in the Creator Hub. Code only wires the level-select terminal's click.
// The levels themselves float 12 m above, see world.ts. tools/bakeLobby.ts is the one-off script that produced the first version.

import { engine, InputAction, pointerEventsSystem } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { session } from './session'

export const LOBBY_CENTRE = Vector3.create(64, 0, 14)
/** Where the avatar arrives. Matches the spawn point in scene.json. */
export const LOBBY_SPAWN = Vector3.create(64, 0.1, 6.5)

/** Entities in the Creator Hub that open the level-select menu when clicked. Keep these names when editing. */
const TERMINAL_PARTS = ['Level Select Terminal Base', 'Level Select Terminal Screen']

export function setupLobby() {
  for (const name of TERMINAL_PARTS) {
    const e = engine.getEntityOrNullByName(name)
    if (!e) continue
    pointerEventsSystem.onPointerDown({ entity: e, opts: { button: InputAction.IA_POINTER, hoverText: 'Select level', maxDistance: 14 } }, () => {
      session.menuOpen = true
      session.codeOpen = false
    })
  }
}
