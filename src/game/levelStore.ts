// Client side of "My levels": talks to the server through the messages in shared/messages.ts and keeps the list the
// HUD shows. Saving needs the server, which can take ~15 s to wake up after nobody has been in the scene for a while.

import { engine } from '@dcl/sdk/ecs'
import { isStateSyncronized } from '@dcl/sdk/network'
import { MAX_NAME_LENGTH, room } from '../shared/messages'
import { editorCode, importIntoEditor, setEditorStatus } from './editor'
import { editor } from './session'

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
