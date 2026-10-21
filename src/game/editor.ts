// In-game level editor: actions only (the panel is hud/editorPanel.tsx, the state is `editor` in session.ts).
// The level is edited as ASCII rows. Every valid edit rebuilds the real level in the world, so you can walk around
// and push blocks in it while you edit. Levels leave the editor as a level code (copy it and send it for review).

import { engine, InputAction, inputSystem, PointerEventType } from '@dcl/sdk/ecs'
import { copyToClipboard } from '~system/RestrictedActions'
import { activeLevel, buildCustom, loadLevel, restartLevel, returnToLobby, setCellClickHandler, teleportToStart } from './world'
import { Level, parseLevel } from './grid'
import { fillRect, flipHorizontal, flipVertical, floodFill, rotateRight } from './editorOps'
import { decodeLevelCode, encodeLevelCode } from './levelCode'
import { solve } from './solver'
import { editor, EditorTool, session } from './session'

// Undo / redo: a snapshot of the rows is taken before every change.
const MAX_HISTORY = 100
const past: string[][] = []
const future: string[][] = []

function snapshot() {
  past.push(editor.rows.slice())
  if (past.length > MAX_HISTORY) past.shift()
  future.length = 0
}

export const canUndo = () => past.length > 0
export const canRedo = () => future.length > 0

export function undo() {
  const prev = past.pop()
  if (!prev) return
  future.push(editor.rows.slice())
  editor.rows = prev
  say('info', 'Undone.')
  refresh()
}

export function redo() {
  const next = future.pop()
  if (!next) return
  past.push(editor.rows.slice())
  editor.rows = next
  say('info', 'Redone.')
  refresh()
}

const MIN_SIZE = 5
const MAX_SIZE = 31 // 31 tiles = 93 m, inside the 128 m scene with room to walk around it

function say(kind: 'info' | 'ok' | 'bad', text: string) {
  editor.statusKind = kind
  editor.status = text
}

export const setEditorStatus = say

/** Parse the working rows. Returns the level, or the reason it is not playable yet. */
function tryParse(): { level: Level } | { error: string } {
  try {
    return { level: parseLevel('Custom', editor.rows) }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/** Apply the working rows to the world if they form a valid level; otherwise say what is missing. */
function refresh() {
  const res = tryParse()
  if ('error' in res) {
    say('bad', res.error)
    return
  }
  buildCustom(res.level)
  if (editor.statusKind === 'bad') say('info', '')
}

/** Put every block back where the level starts them (after test pushes) without touching the avatar. */
export function resetBlocks() {
  refresh()
}

const PALETTE_ORDER = ['.', '#', 'W', 'O', 'F', 'E', 'P', 'S', 'B', '@', 'N', 'arrow', 'fan']
const paletteId = (t: EditorTool) => ('^>v<'.includes(t) ? 'arrow' : 'urdl'.includes(t) ? 'fan' : t)

function editorInputSystem() {
  if (!editor.open) return
  // E / F step through the tools, 1 turns the selected arrow or fan, 2 resets the blocks
  const step = inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN) ? 1 : inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN) ? -1 : 0
  if (step) {
    const i = PALETTE_ORDER.indexOf(paletteId(editor.tool))
    pickTool(PALETTE_ORDER[(i + step + PALETTE_ORDER.length) % PALETTE_ORDER.length])
  }
  if (inputSystem.isTriggered(InputAction.IA_ACTION_3, PointerEventType.PET_DOWN) && paletteId(editor.tool) !== editor.tool) {
    pickTool(paletteId(editor.tool))
  }
  if (inputSystem.isTriggered(InputAction.IA_ACTION_4, PointerEventType.PET_DOWN)) resetBlocks()
  if (inputSystem.isTriggered(InputAction.IA_ACTION_5, PointerEventType.PET_DOWN)) undo()
  if (inputSystem.isTriggered(InputAction.IA_ACTION_6, PointerEventType.PET_DOWN)) redo()
}

export function setupEditor() {
  setCellClickHandler(paint)
  engine.addSystem(editorInputSystem, 4, 'sm-editor-input')
}

export function openEditor() {
  const lvl = activeLevel()
  const fromLobby = session.inLobby
  // a custom level (levelIndex -1) means we are already mid-edit: keep where the editor was first opened from
  if (session.inLobby || session.levelIndex >= 0) {
    editor.fromLobby = fromLobby
    if (session.levelIndex >= 0) editor.sourceIndex = session.levelIndex
  }
  editor.rows = lvl.rows.slice()
  past.length = 0 // a fresh editing session starts with no history
  future.length = 0
  editor.open = true
  editor.mode = 'paint'
  editor.anchor = null
  session.menuOpen = false
  session.codeOpen = false
  say('info', 'Pick a tile, then click the grid.')
  refresh()
  if (fromLobby) teleportToStart() // the level floats above the lobby, so go up to it
}

/** Leave the editor and go back to the real level it came from. */
export function exitEditor() {
  editor.open = false
  if (editor.fromLobby) returnToLobby()
  else loadLevel(editor.sourceIndex)
}

/** Close the panel and play the level as it is now, from its start. */
export function playTest() {
  const res = tryParse()
  if ('error' in res) {
    say('bad', res.error)
    return
  }
  editor.open = false
  buildCustom(res.level)
  restartLevel()
}

const ARROWS: EditorTool[] = ['^', '>', 'v', '<']
const FANS: EditorTool[] = ['u', 'r', 'd', 'l']

export function setTool(tool: EditorTool) {
  editor.tool = tool
}

/** Palette click. Arrow and Fan are families: clicking one that is already selected turns it a quarter. */
export function pickTool(id: string) {
  const family = id === 'arrow' ? ARROWS : id === 'fan' ? FANS : null
  if (!family) {
    editor.tool = id as EditorTool
    return
  }
  const i = family.indexOf(editor.tool)
  const next = i >= 0 ? family[(i + 1) % 4] : id === 'arrow' ? editor.lastArrow : editor.lastFan
  if (id === 'arrow') editor.lastArrow = next
  else editor.lastFan = next
  editor.tool = next
}

const MODES: ('paint' | 'fill' | 'rect')[] = ['paint', 'fill', 'rect']

export function cycleMode() {
  editor.mode = MODES[(MODES.indexOf(editor.mode) + 1) % MODES.length]
  editor.anchor = null
  say('info', editor.mode === 'paint' ? 'Paint: one tile per click.' : editor.mode === 'fill' ? 'Fill: click a tile to fill the whole connected region.' : 'Rectangle: click two opposite corners.')
}

/** Apply a whole-grid operation (flip, rotate) as one undoable step. */
function transform(fn: (rows: string[]) => string[]) {
  snapshot()
  editor.rows = fn(editor.rows)
  refresh()
}
export const flipH = () => transform(flipHorizontal)
export const flipV = () => transform(flipVertical)
export const rotate = () => transform(rotateRight)

export function paint(x: number, y: number) {
  // the player start is unique, so it is always painted one tile at a time
  if (editor.mode === 'rect' && editor.tool !== '@') {
    if (!editor.anchor) {
      editor.anchor = { x, y }
      say('info', 'Click the opposite corner.')
      return
    }
    snapshot()
    editor.rows = fillRect(editor.rows, editor.anchor.x, editor.anchor.y, x, y, editor.tool)
    editor.anchor = null
    refresh()
    return
  }
  if (editor.mode === 'fill' && editor.tool !== '@') {
    if (editor.rows[y][x] === editor.tool) return
    snapshot()
    editor.rows = floodFill(editor.rows, x, y, editor.tool)
    refresh()
    return
  }
  if (editor.rows[y][x] === editor.tool) return // nothing to change, nothing to undo
  snapshot()
  const rows = editor.rows.map((r) => r.split(''))
  if (editor.tool === '@') {
    // there is only one player start
    for (const r of rows) for (let i = 0; i < r.length; i++) if (r[i] === '@') r[i] = '.'
  }
  rows[y][x] = editor.tool
  editor.rows = rows.map((r) => r.join(''))
  refresh()
}

/** Blank level of the given size with a ring of steps (#) around it. */
export function newBlank(w = 7, h = 7) {
  w = Math.max(MIN_SIZE, Math.min(MAX_SIZE, w))
  h = Math.max(MIN_SIZE, Math.min(MAX_SIZE, h))
  snapshot()
  editor.rows = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : '.')).join('')
  )
  say('info', 'Blank level. Needs a start (@), a plate (P) and a block (B).')
  refresh()
}

/** Grow or shrink the grid. The inside is kept where it fits and the outer ring is redrawn as steps. */
export function resize(dw: number, dh: number) {
  const oldH = editor.rows.length
  const oldW = editor.rows[0].length
  const w = Math.max(MIN_SIZE, Math.min(MAX_SIZE, oldW + dw))
  const h = Math.max(MIN_SIZE, Math.min(MAX_SIZE, oldH + dh))
  if (w === oldW && h === oldH) return
  snapshot()
  editor.rows = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return '#'
      return x < oldW - 1 && y < oldH - 1 ? editor.rows[y][x] : '.'
    }).join('')
  )
  refresh()
}

/** Open the editor on a level that came from somewhere else (a saved level). */
export function importIntoEditor(code: string, name: string) {
  try {
    const rows = decodeLevelCode(code)
    snapshot()
    editor.rows = rows
  } catch (e) {
    say('bad', (e as Error).message)
    return
  }
  editor.levelName = name
  editor.open = true
  session.menuOpen = false
  session.codeOpen = false
  say('ok', `Loaded "${name}".`)
  refresh()
}

export function importCode(text: string) {
  try {
    const rows = decodeLevelCode(text)
    snapshot()
    editor.rows = rows
    say('ok', 'Level code loaded.')
    refresh()
  } catch (e) {
    say('bad', (e as Error).message)
  }
}

/** Runs the real solver on the working level. Also reports whether it can only be solved by pushing from the ledge. */
export function check() {
  const res = tryParse()
  if ('error' in res) {
    say('bad', res.error)
    return
  }
  const sol = solve(res.level, 150_000)
  if (!sol.solvable) {
    say('bad', sol.truncated ? 'Too big to check here. Send the code to review it.' : 'NOT SOLVABLE. No sequence of pushes covers every plate.')
    return
  }
  // Same level with the steps turned into full walls: if it is unsolvable there, the ledge is required.
  const noLedge = solve(parseLevel('c', editor.rows.map((r) => r.replace(/#/g, 'W'))), 150_000)
  const ledge = noLedge.solvable ? '' : ' (needs pushing from the ledge)'
  say('ok', `Solvable in ${sol.pushes} pushes${ledge}.`)
}

export const editorCode = () => encodeLevelCode(editor.rows)

/** Copy the level code of the working level (works even while the level is not valid yet). */
export function copyEditorCode() {
  copyToClipboard({ text: editorCode() }).then(
    () => {
      session.copiedAt = Date.now()
      say('ok', 'Level code copied. Paste it to share or review.')
    },
    () => say('bad', 'Could not copy. Select the code from the Level code panel instead.')
  )
}
