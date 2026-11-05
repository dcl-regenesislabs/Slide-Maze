import { AvatarModifierArea, AvatarModifierType, Entity, engine, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'
import { session } from './session'

// Inside a level every other player is hidden (avatar, name tag and passport), so the puzzle plays solo while the comms
// room, and with it the auth server that saves progress and My levels, stays up. The area is local to each client and
// excludes the local player, so everyone sees only themselves. In the lobby it is removed and players see each other.

// The whole 8x8-parcel scene (128 m), tall enough to cover jumps and falls.
const CENTER = Vector3.create(64, 40, 64)
const SIZE = Vector3.create(128, 100, 128)

export function setupSoloArea() {
  let area: Entity | null = null
  engine.addSystem(() => {
    const want = !session.inLobby
    if (want === (area !== null)) return
    if (!want) {
      engine.removeEntity(area!)
      area = null
      return
    }
    // Without our own id the area would hide us too; wait until the player data is in.
    const me = getPlayer()?.userId
    if (!me) return
    area = engine.addEntity()
    Transform.create(area, { position: CENTER })
    AvatarModifierArea.create(area, {
      area: SIZE,
      excludeIds: [me],
      modifiers: [AvatarModifierType.AMT_HIDE_AVATARS, AvatarModifierType.AMT_HIDE_NAMETAGS, AvatarModifierType.AMT_DISABLE_PASSPORTS]
    })
  })
}
