// Client side of "My levels": talks to the server through the messages in shared/messages.ts and keeps the list the
// HUD shows. Saving needs the server, which can take ~15 s to wake up after nobody has been in the scene for a while.

import { engine } from '@dcl/sdk/ecs'
import { isStateSyncronized } from '@dcl/sdk/network'
import { getPlayer } from '@dcl/sdk/players'
import { MAX_NAME_LENGTH, room } from '../shared/messages'
import { cleanName } from '../shared/names'
import { editorCode, importIntoEditor, setEditorStatus } from './editor'
import { editor, leaderboard, progress } from './session'
import { setCompleteHandler } from './world'

export const myLevels = {
  list: [] as { id: string; name: string }[],
  panelOpen: false,
  waitingSince: 0, // Date.now() of the last request still waiting for an answer, 0 = idle
  message: ''
}

const SERVER_TIMEOUT_MS = 10_000

function send(fn: () => void): boolean {
  if (!isStateSyncronized()) {
    myLevels.message = 'Connecting to the server... try again in a moment.'
    return false
  }
  myLevels.waitingSince = Date.now()
  myLevels.message = ''
  fn()
  return true
}

export function refreshMyLevels() {
  send(() => room.send('requestLevels', { v: 1 }))
}

export function openMyLevels() {
  myLevels.panelOpen = true
  refreshMyLevels()
}

export const closeMyLevels = () => (myLevels.panelOpen = false)

export function saveCurrentLevel() {
  const name = editor.levelName.trim().slice(0, MAX_NAME_LENGTH)
  if (!name) {
    setEditorStatus('bad', 'Give the level a name first.')
    return
  }
  if (send(() => room.send('saveLevel', { name, code: editorCode() }))) setEditorStatus('info', 'Saving...')
}

export const loadMyLevel = (id: string) => send(() => room.send('getLevel', { id }))
export const deleteMyLevel = (id: string) => send(() => room.send('deleteLevel', { id }))

// ---- Saved progress and leaderboard ----
// Results are reported to the server when a level is finished; the server scores them (score.ts), keeps the best per
// level and sends the whole record back, which fills the level menu (done / best moves / points), then sends the
// leaderboard. Reports wait here until the connection is ready.
const myName = () => getPlayer()?.name?.trim() ?? ''
const pendingReports: { level: number; moves: number; timeMs: number }[] = []
let progressRequested = false
let syncedAt = 0
// The first request puts the player on the shared board under this name, so it waits for the profile to load; past
// NAME_WAIT_MS it goes anyway (the board shows the short address, and the next refresh, which carries the name, fixes it).
const NAME_WAIT_MS = 10_000

export function reportCompletion(level: number, moves: number, timeMs: number) {
  pendingReports.push({ level, moves, timeMs })
}

function progressSystem() {
  if (!isStateSyncronized()) return
  if (!progressRequested) {
    syncedAt ||= Date.now()
    if (!myName() && Date.now() - syncedAt < NAME_WAIT_MS) return
    progressRequested = true
    room.send('requestProgress', { name: myName() })
  }
  while (pendingReports.length) {
    const r = pendingReports.shift()!
    room.send('reportComplete', { ...r, name: myName() })
  }
}

function applyProgress(json: string) {
  try {
    const saved = JSON.parse(json) as Record<string, { m: number; t: number; s?: number }>
    for (const key of Object.keys(saved)) {
      const i = parseInt(key, 10)
      if (!progress[i]) continue
      progress[i].done = true
      // keep whichever is better, so a result that is still on its way is not overwritten by an older record
      progress[i].bestMoves = progress[i].bestMoves ? Math.min(progress[i].bestMoves, saved[key].m) : saved[key].m
      progress[i].bestTimeMs = progress[i].bestTimeMs ? Math.min(progress[i].bestTimeMs, saved[key].t) : saved[key].t
      progress[i].bestScore = Math.max(progress[i].bestScore, saved[key].s ?? 0)
    }
  } catch {
    /* a bad record is ignored: progress simply stays as it is */
  }
}

function applyLeaderboard(json: string) {
  try {
    const data = JSON.parse(json) as { top: { n: string; s: number }[]; rank: number }
    leaderboard.top = data.top.map((e) => ({ name: cleanName(e.n), score: e.s }))
    leaderboard.myRank = data.rank
    leaderboard.updatedAt = Date.now()
  } catch {
    /* keep the last good board */
  }
}

/** Ask for a fresh leaderboard (e.g. when its panel opens). False while the server is not connected yet. */
export function refreshLeaderboard(): boolean {
  if (!isStateSyncronized()) return false
  room.send('requestLeaderboard', { name: myName() })
  return true
}

function timeoutSystem() {
  if (myLevels.waitingSince && Date.now() - myLevels.waitingSince > SERVER_TIMEOUT_MS) {
    myLevels.waitingSince = 0
    myLevels.message = 'The server is not answering yet. It can take about 15 seconds to wake up. Try again.'
    if (editor.status === 'Saving...') setEditorStatus('bad', myLevels.message)
  }
}

export function setupLevelStore() {
  room.onMessage('levelList', (data) => {
    myLevels.waitingSince = 0
    try {
      myLevels.list = JSON.parse(data.json)
    } catch {
      myLevels.list = []
    }
  })
  room.onMessage('progressData', (data) => applyProgress(data.json))
  room.onMessage('leaderboardData', (data) => applyLeaderboard(data.json))
  setCompleteHandler(reportCompletion)
  engine.addSystem(progressSystem, 3, 'sm-progress')
  room.onMessage('levelData', (data) => {
    myLevels.waitingSince = 0
    myLevels.panelOpen = false
    importIntoEditor(data.code, data.name)
  })
  room.onMessage('saveResult', (data) => {
    myLevels.waitingSince = 0
    setEditorStatus(data.ok ? 'ok' : 'bad', data.message)
    myLevels.message = data.ok ? '' : data.message
  })
  engine.addSystem(timeoutSystem, 3, 'sm-store-timeout')
}
