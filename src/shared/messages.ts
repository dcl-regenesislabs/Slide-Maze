// Messages between the client and the headless server. This module must be imported statically at the top of
// index.ts: registerMessages() defines a component, which has to happen before the engine seals.

import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

export const Messages = {
  // client -> server
  requestLevels: Schemas.Map({ v: Schemas.Int }),
  saveLevel: Schemas.Map({ name: Schemas.String, code: Schemas.String }),
  deleteLevel: Schemas.Map({ id: Schemas.String }),
  getLevel: Schemas.Map({ id: Schemas.String }),
  requestProgress: Schemas.Map({ v: Schemas.Int }),
  reportComplete: Schemas.Map({ level: Schemas.Int, moves: Schemas.Int, timeMs: Schemas.Int }),
  // server -> client (each message must stay well under 13 KB, so the list carries names only and codes come one by one)
  levelList: Schemas.Map({ json: Schemas.String }),
  levelData: Schemas.Map({ id: Schemas.String, name: Schemas.String, code: Schemas.String }),
  saveResult: Schemas.Map({ ok: Schemas.Boolean, message: Schemas.String }),
  progressData: Schemas.Map({ json: Schemas.String }) // { "<level index>": { m: best moves, t: best time ms } }
}

export const room = registerMessages(Messages)

// Limits shared by the server (enforces them) and the editor (explains them).
export const MAX_SAVED_LEVELS = 20
export const MAX_NAME_LENGTH = 32
export const MAX_LEVEL_SIZE = 31
