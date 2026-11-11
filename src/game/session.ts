import { LEVELS } from './levels'

// What the HUD reads. The world writes it, the HUD only reads it (and calls the actions exported from world.ts).
// A plain mutable object is enough: React-ECS re-renders every frame.

export interface Session {
  inLobby: boolean // true until a level (or the editor) is opened
  levelIndex: number
  name: string
  code: string // level code of the loaded level
  moves: number
  startedAt: number // Date.now() of the first push, 0 = not started yet
  finishedAt: number // Date.now() when the last plate was covered (the clock stops here), 0 = not yet
  completedAt: number // Date.now() when the level was finished (through the exit door, if it has one), 0 = not yet
  unlocked: boolean // every plate is covered: the exit door (if any) is open and the blocks are frozen
  hasDoor: boolean // the loaded level has an exit door
  solved: boolean // the level is finished (a level with a door finishes when the player walks through it)
  codeOpen: boolean
  menuOpen: boolean // the level-select menu
  copiedAt: number // Date.now() of the last successful copy, for the "Copied!" flash
  advancing: boolean // the level is finished and the next one is about to load
  toastText: string // a short message shown across levels (e.g. the result of the level you just finished)
  toastUntil: number
  hintText: string // the message shown with a hint
  hintUntil: number // Date.now() until which the hint message is shown
  runScore: number // points for the run just finished (official levels only), 0 = none
  runNewBest: boolean // that run beat this level's best score
}

export const session: Session = {
  inLobby: true,
  levelIndex: 0,
  name: '',
  code: '',
  moves: 0,
  startedAt: 0,
  finishedAt: 0,
  completedAt: 0,
  unlocked: false,
  hasDoor: false,
  solved: false,
  codeOpen: false,
  menuOpen: false,
  copiedAt: 0,
  advancing: false,
  toastText: '',
  toastUntil: 0,
  hintText: '',
  hintUntil: 0,
  runScore: 0,
  runNewBest: false
}

// Per-level progress, filled from the server's saved record (see levelStore.ts).
export interface LevelProgress {
  done: boolean
  bestMoves: number // 0 = none yet
  bestTimeMs: number
  bestScore: number // best points for this level (scored by the server, see score.ts), 0 = none yet
}
export const progress: LevelProgress[] = LEVELS.map(() => ({ done: false, bestMoves: 0, bestTimeMs: 0, bestScore: 0 }))

/** The leaderboard as last sent by the server: the top players and this player's place (your total is summed locally). */
export const leaderboard = {
  top: [] as { name: string; score: number }[],
  myRank: 0, // 1-based place on the board, 0 = not on it (yet)
  updatedAt: 0 // Date.now() of the last update, 0 = nothing received yet
}

/** While building, every level is open so any of them can be tested. Set to false to enforce the locked state. */
export const DEV_UNLOCK_ALL = true

export const isUnlocked = (i: number) => DEV_UNLOCK_ALL || i === 0 || progress[i - 1].done

// ---- Level editor state (the panel lives in hud/editorPanel.tsx, the actions in game/editor.ts) ----

/** Dev switch. Later this becomes a wallet allowlist so players never see the editor. */
export const EDITOR_ENABLED = false

export type EditorTool = '.' | '#' | 'O' | 'P' | 'S' | 'B' | '@' | 'N' | 'F' | 'E' | '^' | '>' | 'v' | '<' | 'u' | 'r' | 'd' | 'l'

export interface EditorState {
  open: boolean
  rows: string[] // the level being edited, as ASCII (see grid.ts for the legend)
  tool: EditorTool
  mode: 'paint' | 'rect' // paint one tile, or fill a rectangle between two clicks
  anchor: { x: number; y: number } | null // first corner of a rectangle in progress
  panelOpen: boolean // the big "Level tools" panel (the hotbar and toolbar are always shown while editing)
  hover: { x: number; y: number } | null // the cell under the cursor in the 3D view
  lastArrow: EditorTool // the arrow / fan direction the palette will pick next
  lastFan: EditorTool
  sourceIndex: number // which real level to return to on Exit
  fromLobby: boolean // the editor was opened from the lobby, so Exit goes back there
  status: string
  statusKind: 'info' | 'ok' | 'bad'
  importText: string
  levelName: string // name used when saving to My levels
}

export const editor: EditorState = {
  open: false,
  rows: [],
  tool: '#',
  mode: 'paint',
  anchor: null,
  panelOpen: false,
  hover: null,
  lastArrow: '^',
  lastFan: 'u',
  sourceIndex: 0,
  fromLobby: false,
  status: '',
  statusKind: 'info',
  importText: '',
  levelName: ''
}

export function elapsedMs(now = Date.now()): number {
  if (!session.startedAt) return 0
  return (session.finishedAt || now) - session.startedAt
}
