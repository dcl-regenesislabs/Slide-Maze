// The lobby: an ice cave at ground level where the game starts. Its geometry lives in the scene (assets/scene/main.composite,
// the "Lobby" group and the three doors), so it can be edited visually in the Creator Hub. The doors are wired in lobbyDoors.ts.
// The levels themselves float 12 m above, see world.ts.

import { Vector3 } from '@dcl/sdk/math'

export const LOBBY_CENTRE = Vector3.create(64, 0, 14)
/** Where the avatar arrives. Matches the spawn point in scene.json. */
export const LOBBY_SPAWN = Vector3.create(64, 0.1, 6.5)
