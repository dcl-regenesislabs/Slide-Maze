// Client side of "My levels": talks to the server through the messages in shared/messages.ts and keeps the list the
// HUD shows. Saving needs the server, which can take ~15 s to wake up after nobody has been in the scene for a while.

import { engine } from '@dcl/sdk/ecs'
import { isStateSyncronized } from '@dcl/sdk/network'
import { MAX_NAME_LENGTH, room } from '../shared/messages'
import { editorCode, importIntoEditor, setEditorStatus } from './editor'
import { editor, progress } from './session'
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

// ---- Saved progress ----
// Results are reported to the server when a level is finished; the server keeps the best per level and sends the whole
// record back, which fills the level menu (done / best moves). Reports wait here until the connection is ready.
const pendingReports: { level: number; moves: number; timeMs: number }[] = []
let progressRequested = false

export function reportCompletion(level: number, moves: number, timeMs: number) {
  pendingReports.push({ level, moves, timeMs })
}

function progressSystem() {
  if (!isStateSyncronized()) return
  if (!progressRequested) {
    progressRequested = true
    room.send('requestProgress', { v: 1 })
  }
  while (pendingReports.length) {
    const r = pendingReports.shift()!
    room.send('reportComplete', r)
  }
}

function applyProgress(json: string) {
  try {
    const saved = JSON.parse(json) as Record<string, { m: number; t: number }>
    for (const key of Object.keys(saved)) {
      const i = parseInt(key, 10)
      if (!progress[i]) continue
      progress[i].done = true
      // keep whichever is better, so a result that is still on its way is not overwritten by an older record
      progress[i].bestMoves = progress[i].bestMoves ? Math.min(progress[i].bestMoves, saved[key].m) : saved[key].m
      progress[i].bestTimeMs = progress[i].bestTimeMs ? Math.min(progress[i].bestTimeMs, saved[key].t) : saved[key].t
    }
  } catch {
    /* a bad record is ignored: progress simply stays as it is */
  }
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
