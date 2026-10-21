// Runs on the headless server only. Stores each player's saved levels (as level codes) in Player Storage.
// Every code is decoded and parsed here before it is stored, so storage only ever holds valid levels.

import { Storage } from '@dcl/sdk/server'
import { parseLevel } from '../game/grid'
import { decodeLevelCode } from '../game/levelCode'
import { LEVELS } from '../game/levels'
import { solve } from '../game/solver'
import { MAX_LEVEL_SIZE, MAX_NAME_LENGTH, MAX_SAVED_LEVELS, room } from '../shared/messages'

interface SavedLevel {
  id: string
  name: string
  code: string
  savedAt: number
}

const KEY = 'levels'
const PROGRESS_KEY = 'progress'

type Progress = Record<string, { m: number; t: number }>

const minPushes: number[] = [] // fewest possible pushes per level, from the solver (computed once, on first use)
const fewestPushes = (i: number) => (minPushes[i] ??= solve(LEVELS[i]).pushes)
// A push takes at least the wind-up (0.6 s) before the block moves, so a result faster than this cannot be real.
const MIN_MS_PER_PUSH = 600

async function loadProgress(address: string): Promise<Progress> {
  const raw = await Storage.player.get<string>(address, PROGRESS_KEY)
  if (!raw) return {}
  try {
    const p = JSON.parse(raw)
    return p && typeof p === 'object' ? p : {}
  } catch {
    return {}
  }
}

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

  room.onMessage('requestProgress', async (_data, context) => {
    if (!context) return
    room.send('progressData', { json: JSON.stringify(await loadProgress(context.from)) }, { to: [context.from] })
  })

  // Clients report their own results, so check what can be checked: a real level, at least the optimal number of
  // pushes, and not faster than the wind-up allows. This stops casual cheating, not a determined one.
  room.onMessage('reportComplete', async (data, context) => {
    if (!context) return
    const address = context.from
    const i = data.level
    if (!Number.isInteger(i) || i < 0 || i >= LEVELS.length) return
    if (data.moves < fewestPushes(i) || data.timeMs < data.moves * MIN_MS_PER_PUSH) {
      console.log(`[SERVER] rejected result from ${address} for level ${i}: ${data.moves} moves in ${data.timeMs} ms`)
      return
    }
    const progress = await loadProgress(address)
    const old = progress[String(i)]
    progress[String(i)] = { m: old ? Math.min(old.m, data.moves) : data.moves, t: old ? Math.min(old.t, data.timeMs) : data.timeMs }
    if (!(await Storage.player.set(address, PROGRESS_KEY, JSON.stringify(progress)))) {
      console.log(`[SERVER] could not save progress for ${address}`)
    }
    room.send('progressData', { json: JSON.stringify(progress) }, { to: [address] })
  })

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
