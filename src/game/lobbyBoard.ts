// The lobby leaderboard: one baked image (panel + LEADERBOARD title, leaderboard_panel.png) on a fixed plane, standing
// where the Hub's 'LEADERBOARD Sign' was and facing the lobby centre, with the top 10 written in TextShapes over the
// panel's empty inset. The Hub sign's placeholder text and billboard are dropped; only its position is used.
//
// While the player is in the lobby the ranking is asked for every REFRESH_MS; the rows are rebuilt only when what they
// show changes.

import { Billboard, engine, Entity, Material, MeshRenderer, TextAlignMode, TextShape, Transform } from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { LOBBY_CENTRE } from './lobby'
import { refreshLeaderboard } from './levelStore'
import { leaderboard, session } from './session'

const SIGN_NAME = 'LEADERBOARD Sign'
const PANEL = 'assets/images/revamp/buttons_labeled/leaderboard_panel.png' // 1024 x 1280
const REFRESH_MS = 30_000
const RETRY_MS = 3_000 // until the first answer arrives (the room may still be connecting)
const ROWS = 10

// ---- Placement (metres), sized in the lobby with a dev tuner ----
const boardTune = {
  width: 7.25,
  height: 10,
  up: 2.3, // above the Hub sign's position
  side: 0, // to the reader's right
  forward: 0.3, // out from the sign towards the lobby, clear of the entrance door model
  text: 4 // TextShape font size of the rows
}

// The empty inset of leaderboard_panel.png, in its pixels (1024 x 1280): where the rows go.
const INSET = { x0: 96, x1: 928, y0: 308, y1: 1184 }
const IMG_W = 1024
const IMG_H = 1280

const INK = Color3.create(0.043, 0.082, 0.188)
const WHITE = Color4.create(1, 1, 1, 1)
const DIM = Color4.create(0.81, 0.95, 1, 1)
const AMBER = Color4.create(1, 0.76, 0.24, 1)
const PODIUM = [Color4.create(1, 0.8, 0.2, 1), Color4.create(0.85, 0.9, 0.96, 1), Color4.create(0.93, 0.6, 0.35, 1)] // gold, silver, bronze
const NAME_MAX = 14 // longer names are cut with an ellipsis so they never reach the points column

// Places nobody has reached yet: a dim dashed line, so the board always shows its ten places while it fills up.
const EMPTY_NAME = '- - - - - - - -'
const EMPTY_SCORE = '- - -'
const EMPTY = Color4.create(0.81, 0.95, 1, 0.35)

const pts = (n: number) => `${Math.round(n)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const short = (s: string) => (s.length > NAME_MAX ? s.slice(0, NAME_MAX - 1) + '…' : s)

type Row = { name: string; score: number; mine: boolean }
/** The players on the board, best first (at most ROWS; the places after them are drawn empty). */
const rows = (): Row[] => leaderboard.top.slice(0, ROWS).map((e, i) => ({ ...e, mine: i + 1 === leaderboard.myRank }))

export function setupLobbyBoard() {
  let anchor: Entity | null = null
  let panel: Entity | null = null
  let content: Entity | null = null
  let shown = ''
  let triedAt = 0
  engine.addSystem(() => {
    if (!anchor) {
      const sign = engine.getEntityOrNullByName(SIGN_NAME)
      if (!sign || !Transform.has(sign)) return
      anchor = sign
      TextShape.deleteFrom(sign)
      Billboard.deleteFrom(sign)
      // stand still, facing the lobby: the readable side of the board is its local -Z
      const t = Transform.getMutable(sign)
      const towardReader = Vector3.normalize(Vector3.create(LOBBY_CENTRE.x - t.position.x, 0, LOBBY_CENTRE.z - t.position.z))
      t.rotation = Quaternion.lookRotation(Vector3.scale(towardReader, -1))
      panel = buildPanel(sign)
    }
    const pt = Transform.getMutable(panel!)
    pt.position = Vector3.create(boardTune.side, boardTune.up, -boardTune.forward)
    pt.scale = Vector3.create(boardTune.width, boardTune.height, 1)

    if (session.inLobby) {
      const now = Date.now()
      if (now - triedAt > (leaderboard.updatedAt ? REFRESH_MS : RETRY_MS)) {
        triedAt = now
        refreshLeaderboard()
      }
    }

    const list = rows()
    const snap = JSON.stringify(list)
    if (snap === shown) return
    shown = snap
    if (content) engine.removeEntityWithChildren(content)
    content = engine.addEntity()
    // not a child of the panel: its scale would stretch the text
    Transform.create(content, { parent: anchor, position: Vector3.create(boardTune.side, boardTune.up, -boardTune.forward - 0.03) })
    buildRows(content, list)
  })
}

function buildPanel(anchor: Entity) {
  const e = engine.addEntity()
  Transform.create(e, { parent: anchor })
  // uv per corner, same order as the UI's sprite uvs: front face, then the back face mirrored so it never reads backwards
  MeshRenderer.setPlane(e, [0, 0, 0, 1, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0])
  // unlit: exactly the UI's colours whatever the lobby light (a lit + emissive material came out washed out);
  // the image's edges are hard, so an alpha cut-out is enough for its transparent corners
  Material.setBasicMaterial(e, { texture: Material.Texture.Common({ src: PANEL }), alphaTest: 0.5 })
  return e
}

/**
 * A text anchored at (x, y): left-aligned text starts there, right-aligned ends there, centred is centred on it. No box
 * width is given, since explorers do not agree on how a box shifts the text; anchoring on the point works on all of them.
 */
function label(parent: Entity, value: string, x: number, y: number, color: Color4, align: TextAlignMode) {
  const e = engine.addEntity()
  Transform.create(e, { parent, position: Vector3.create(x, y, 0) })
  TextShape.create(e, {
    text: value,
    fontSize: boardTune.text,
    textColor: color,
    outlineColor: INK,
    outlineWidth: 0.2,
    textAlign: align,
    textWrapping: false
  })
}

function buildRows(parent: Entity, list: Row[]) {
  const W = boardTune.width
  const H = boardTune.height
  // the inset in board metres (centre of the image = 0, 0)
  const x0 = (INSET.x0 / IMG_W - 0.5) * W
  const x1 = (INSET.x1 / IMG_W - 0.5) * W
  const top = (0.5 - INSET.y0 / IMG_H) * H
  const bottom = (0.5 - INSET.y1 / IMG_H) * H
  const padX = (x1 - x0) * 0.06
  const padY = (top - bottom) * 0.04
  const rowH = (top - bottom - padY * 2) / ROWS
  const left = x0 + padX
  const right = x1 - padX
  const rankW = (right - left) * 0.11 // room for "10." before the name starts

  for (let i = 0; i < ROWS; i++) {
    const y = top - padY - rowH * (i + 0.5)
    const r = list[i]
    const rankColor = !r ? EMPTY : i < 3 ? PODIUM[i] : DIM
    label(parent, `${i + 1}.`, left, y, rankColor, TextAlignMode.TAM_MIDDLE_LEFT)
    if (!r) {
      label(parent, EMPTY_NAME, left + rankW, y, EMPTY, TextAlignMode.TAM_MIDDLE_LEFT)
      label(parent, EMPTY_SCORE, right, y, EMPTY, TextAlignMode.TAM_MIDDLE_RIGHT)
      continue
    }
    label(parent, short(r.name), left + rankW, y, r.mine ? AMBER : WHITE, TextAlignMode.TAM_MIDDLE_LEFT)
    label(parent, pts(r.score), right, y, r.mine ? AMBER : rankColor, TextAlignMode.TAM_MIDDLE_RIGHT)
  }
}
