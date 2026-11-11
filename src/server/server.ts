// Runs on the headless server only. Stores each player's saved levels (as level codes) and progress in Player Storage,
// scores finished levels (score.ts) and keeps the leaderboard in Scene Storage.
// Every code is decoded and parsed here before it is stored, so storage only ever holds valid levels.

import { Storage } from '@dcl/sdk/server'
import { parseLevel } from '../game/grid'
import { decodeLevelCode } from '../game/levelCode'
import { LEVELS } from '../game/levels'
import { levelPar, levelScore } from '../game/score'
import { LEADERBOARD_SENT, LEADERBOARD_SIZE, MAX_LEVEL_SIZE, MAX_NAME_LENGTH, MAX_SAVED_LEVELS, room } from '../shared/messages'

interface SavedLevel {
  id: string
  name: string
  code: string
  savedAt: number
}

const KEY = 'levels'
const PROGRESS_KEY = 'progress'

type Progress = Record<string, { m: number; t: number; s?: number }> // s: best points (absent in records saved before scoring)

const fewestPushes = levelPar // fewest possible pushes per level, from the solver (computed once, on first use)
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

/** Best points per level; records saved before scoring get points from their best moves and time. */
function withScores(progress: Progress): Progress {
  for (const key of Object.keys(progress)) {
    const i = parseInt(key, 10)
    const p = progress[key]
    if (p.s === undefined && i >= 0 && i < LEVELS.length) p.s = levelScore(fewestPushes(i), p.m, p.t)
  }
  return progress
}

const totalScore = (progress: Progress) => Object.values(progress).reduce((sum, p) => sum + (p.s ?? 0), 0)

// ---- Leaderboard ----
// One Scene Storage key holds the top LEADERBOARD_SIZE players, best first. Every change goes through `boardQueue`, so two
// players finishing at the same moment cannot overwrite each other's update.
const BOARD_KEY = 'leaderboard'
type BoardEntry = { a: string; n: string; s: number } // address, display name, total points
let boardQueue: Promise<unknown> = Promise.resolve()

/** The stored board, or null when it could not be read (then nothing must be written over it). */
async function loadBoard(): Promise<BoardEntry[] | null> {
  try {
    const list = await Storage.get<BoardEntry[]>(BOARD_KEY)
    return Array.isArray(list) ? list : []
  } catch (e) {
    console.log(`[SERVER] could not read the leaderboard: ${(e as Error).message}`)
    return null
  }
}

const cleanName = (name: string, address: string) => name.trim().slice(0, 24) || `${address.slice(0, 6)}...${address.slice(-4)}`

/** Puts a player's total on the board (or updates it) and keeps it sorted and trimmed. Null if the board is unreadable. */
function updateBoard(address: string, name: string, total: number): Promise<BoardEntry[] | null> {
  const run = boardQueue.then(async () => {
    const stored = await loadBoard()
    if (!stored) return null
    const board = stored.filter((e) => e.a !== address)
    if (total > 0) board.push({ a: address, n: cleanName(name, address), s: total })
    board.sort((x, y) => y.s - x.s)
    board.length = Math.min(board.length, LEADERBOARD_SIZE)
    if (!(await Storage.set(BOARD_KEY, board))) console.log('[SERVER] could not save the leaderboard')
    return board
  })
  boardQueue = run.catch(() => undefined)
  return run
}

function sendBoard(address: string, maybeBoard: BoardEntry[] | null, total: number) {
  const board = maybeBoard ?? []
  const rank = board.findIndex((e) => e.a === address) + 1
  const json = JSON.stringify({ top: board.slice(0, LEADERBOARD_SENT).map((e) => ({ n: e.n, s: e.s })), me: total, rank })
  room.send('leaderboardData', { json }, { to: [address] })
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

  // Sent once when a player connects: their progress, and their place on the board (which also brings players who
  // finished levels before scoring existed onto it).
  room.onMessage('requestProgress', async (data, context) => {
    if (!context) return
    const address = context.from
    const progress = withScores(await loadProgress(address))
    room.send('progressData', { json: JSON.stringify(progress) }, { to: [address] })
    const total = totalScore(progress)
    sendBoard(address, total > 0 ? await updateBoard(address, data.name, total) : await loadBoard(), total)
  })

  room.onMessage('requestLeaderboard', async (_data, context) => {
    if (!context) return
    const address = context.from
    sendBoard(address, await loadBoard(), totalScore(withScores(await loadProgress(address))))
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
    const progress = withScores(await loadProgress(address))
    const old = progress[String(i)]
    // the score is for this run as a whole, so the best score is kept on its own (the best moves and best time may
    // come from different runs)
    const score = levelScore(fewestPushes(i), data.moves, data.timeMs)
    progress[String(i)] = {
      m: old ? Math.min(old.m, data.moves) : data.moves,
      t: old ? Math.min(old.t, data.timeMs) : data.timeMs,
      s: Math.max(old?.s ?? 0, score)
    }
    if (!(await Storage.player.set(address, PROGRESS_KEY, JSON.stringify(progress)))) {
      console.log(`[SERVER] could not save progress for ${address}`)
    }
    room.send('progressData', { json: JSON.stringify(progress) }, { to: [address] })
    const total = totalScore(progress)
    sendBoard(address, await updateBoard(address, data.name, total), total)
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
