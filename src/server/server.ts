// Runs on the headless server only. Stores each player's saved levels (as level codes) in Player Storage.
// Every code is decoded and parsed here before it is stored, so storage only ever holds valid levels.

import { Storage } from '@dcl/sdk/server'
import { parseLevel } from '../game/grid'
import { decodeLevelCode } from '../game/levelCode'
import { MAX_LEVEL_SIZE, MAX_NAME_LENGTH, MAX_SAVED_LEVELS, room } from '../shared/messages'

interface SavedLevel {
  id: string
  name: string
  code: string
  savedAt: number
}

const KEY = 'levels'

async function loadLevels(address: string): Promise<SavedLevel[]> {
  const raw = await Storage.player.get<string>(address, KEY)
  if (!raw) return []
  try {
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

// Storage writes can fail silently (they resolve to false), so always report that to the player.
const storeLevels = (address: string, list: SavedLevel[]) => Storage.player.set(address, KEY, JSON.stringify(list))

const newId = () => Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36)

function sendList(address: string, list: SavedLevel[]) {
  room.send('levelList', { json: JSON.stringify(list.map((l) => ({ id: l.id, name: l.name }))) }, { to: [address] })
}

function reply(address: string, ok: boolean, message: string) {
  room.send('saveResult', { ok, message }, { to: [address] })
}

export function initServer() {
  console.log('[SERVER] Slide Maze server up')

  room.onMessage('requestLevels', async (_data, context) => {
    if (!context) return
    sendList(context.from, await loadLevels(context.from))
  })

  room.onMessage('saveLevel', async (data, context) => {
    if (!context) return
    const address = context.from
    const name = data.name.trim().slice(0, MAX_NAME_LENGTH) || 'Untitled'
    try {
      const level = parseLevel(name, decodeLevelCode(data.code))
      if (level.width > MAX_LEVEL_SIZE || level.height > MAX_LEVEL_SIZE) throw new Error(`levels can be at most ${MAX_LEVEL_SIZE}x${MAX_LEVEL_SIZE}`)
    } catch (e) {
      reply(address, false, `Not a valid level: ${(e as Error).message}`)
      return
    }
    const list = await loadLevels(address)
    const existing = list.findIndex((l) => l.name === name)
    if (existing >= 0) list[existing] = { ...list[existing], code: data.code, savedAt: Date.now() }
    else if (list.length >= MAX_SAVED_LEVELS) {
      reply(address, false, `You can keep ${MAX_SAVED_LEVELS} levels. Delete one first.`)
      return
    } else list.push({ id: newId(), name, code: data.code, savedAt: Date.now() })
    if (!(await storeLevels(address, list))) {
      reply(address, false, 'Could not save right now. Try again in a moment.')
      return
    }
    reply(address, true, existing >= 0 ? `Updated "${name}".` : `Saved "${name}".`)
    sendList(address, list)
  })

  room.onMessage('deleteLevel', async (data, context) => {
    if (!context) return
    const list = (await loadLevels(context.from)).filter((l) => l.id !== data.id)
    if (!(await storeLevels(context.from, list))) {
      reply(context.from, false, 'Could not delete right now. Try again in a moment.')
      return
    }
    sendList(context.from, list)
  })

  room.onMessage('getLevel', async (data, context) => {
    if (!context) return
    const found = (await loadLevels(context.from)).find((l) => l.id === data.id)
    if (!found) {
      reply(context.from, false, 'That level was not found.')
      return
    }
    room.send('levelData', { id: found.id, name: found.name, code: found.code }, { to: [context.from] })
  })
}
