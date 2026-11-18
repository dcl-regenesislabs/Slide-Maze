import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { Card, FS, OutlineLabel, PAL, PillButton, S } from './theme'
import { Digits, Img, REV, Sparkles } from './sprites'
import { mobile } from './platform'

// "How to play": shown when the player arrives at the scene. Explains the goal next to a small looping animation of a
// block sliding across the ice onto its plate, with a one-move counter. Closed with the Close button (or by starting a
// level, see Hud).

export const welcome = { open: true, openedAt: Date.now() }
export const closeWelcome = () => (welcome.open = false)

// tutorial/board.png geometry, in its own pixels: 7 x 5 cells (5 x 3 of ice inside a ring of stone)
const BOARD_W = 528
const BOARD_H = 398
const CELL = 72
const EDGE = 12 // transparent margin around the board
const BLOCK_W = 80
const BLOCK_H = 90
const GLOW = 144
const ROW = 2 // the block's row (the middle one)
const FROM = 1 // first ice column
const TO = 5 // last ice column, where the plate is (the stone ring stops the block there)

// timeline of one loop, in seconds
const PUSH_AT = 1.0 // the arrow nudges the block, then it starts sliding
const ARRIVE_AT = 1.75
const FADE_AT = 3.7
const LOOP = 4.4

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const WHITE = (a: number) => Color4.create(1, 1, 1, a)

const BoardAnim = (props: { width: number }) => {
  const k = props.width / BOARD_W
  const height = Math.round(BOARD_H * k)
  const t = ((Date.now() - welcome.openedAt) / 1000) % LOOP

  // block: waits, slides with a little run-up (it is ice: no slowing down), stops dead against the stone
  const u = clamp01((t - PUSH_AT) / (ARRIVE_AT - PUSH_AT))
  const col = FROM + (TO - FROM) * Math.pow(u, 1.5)
  const arrived = t >= ARRIVE_AT
  const bump = arrived ? Math.max(0, 1 - (t - ARRIVE_AT) / 0.18) : 0 // short squash on impact
  const fadeOut = 1 - clamp01((t - FADE_AT) / 0.35)
  const fadeIn = clamp01(t / 0.3)
  const blockAlpha = Math.min(fadeOut, fadeIn)

  const cellX = (c: number) => (EDGE + c * CELL) * k
  const cellY = (r: number) => (EDGE + r * CELL) * k
  const bw = BLOCK_W * k * (1 + bump * 0.08)
  const bh = BLOCK_H * k * (1 - bump * 0.08)
  const bx = cellX(col) + (CELL * k - bw) / 2
  const by = cellY(ROW) + (CELL * k - bh) / 2 + 4 * k

  // the push arrow pulses behind the block until it goes
  const pushing = t < PUSH_AT
  const nudge = Math.sin(t * 9) * 5 * k
  const arrow = CELL * 0.8 * k

  const glow = arrived ? clamp01((t - ARRIVE_AT) / 0.3) * fadeOut : 0
  const g = GLOW * k * (1 + 0.06 * Math.sin(t * 6))
  const check = arrived ? clamp01((t - ARRIVE_AT - 0.15) / 0.2) * fadeOut : 0
  const cs = CELL * 0.6 * k * (0.7 + 0.3 * check)

  return (
    <UiEntity uiTransform={{ width: props.width, height, flexShrink: 0, pointerFilter: 'none' }} uiBackground={{ texture: { src: REV + 'tutorial/board.png' }, textureMode: 'stretch' }}>
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { left: cellX(TO) + (CELL * k - g) / 2, top: cellY(ROW) + (CELL * k - g) / 2 }, width: g, height: g, pointerFilter: 'none' }}
        uiBackground={{ texture: { src: REV + 'tutorial/plate_glow.png' }, textureMode: 'stretch', color: WHITE(glow) }}
      />
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { left: cellX(FROM - 1) + (CELL * k - arrow) / 2 + (pushing ? nudge : 0), top: cellY(ROW) + (CELL * k - arrow) / 2 }, width: arrow, height: arrow, pointerFilter: 'none' }}
        uiBackground={{ texture: { src: REV + 'icons/icon_chevron_right.png' }, textureMode: 'stretch', color: WHITE(pushing ? fadeIn : 0) }}
      />
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { left: bx, top: by }, width: bw, height: bh, pointerFilter: 'none' }}
        uiBackground={{ texture: { src: REV + 'tutorial/block.png' }, textureMode: 'stretch', color: WHITE(blockAlpha) }}
      />
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { left: cellX(TO) + (CELL * k - cs) / 2, top: cellY(ROW - 1) + (CELL * k - cs) / 2 + 6 * k }, width: cs, height: cs, pointerFilter: 'none' }}
        uiBackground={{ texture: { src: REV + 'icons/icon_check.png' }, textureMode: 'stretch', color: WHITE(check) }}
      />
    </UiEntity>
  )
}

// On a phone the panel is drawn smaller, so it clears the native touch buttons at the screen edges.
const PHONE_SCALE = 0.78
const U = (n: number) => Math.round(S(n) * (mobile() ? PHONE_SCALE : 1))
const F = (n: number) => Math.round(FS(n) * (mobile() ? PHONE_SCALE : 1))

const Line = (props: { text: string; width: number }) => (
  <Label
    value={props.text}
    fontSize={F(19)}
    font="sans-serif"
    color={PAL.text}
    textAlign="middle-left"
    textWrap="wrap"
    uiTransform={{ width: props.width, height: U(52), margin: { bottom: U(4) } }}
  />
)

export const WelcomePanel = () => {
  const pad = U(22)
  const boardW = U(330)
  const gap = U(22)
  const textW = U(330)
  const width = pad * 2 + boardW + gap + textW
  const height = U(330)
  const t = ((Date.now() - welcome.openedAt) / 1000) % LOOP
  const moves = t >= PUSH_AT && t < FADE_AT + 0.35 ? '1' : '0'
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: '50%', left: '50%' },
        margin: { top: -Math.round(height / 2), left: -Math.round(width / 2) },
        width,
        height,
        pointerFilter: 'none'
      }}
    >
      <Card width="100%" height="100%" pad={pad} dir="row" block>
        <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center', margin: { right: gap }, pointerFilter: 'none' }}>
          <BoardAnim width={boardW} />
          <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { top: U(8) }, pointerFilter: 'none' }}>
            <Img file="hud/label_moves.png" h={U(22)} margin={{ right: U(8) }} />
            <Digits text={moves} h={U(30)} />
          </UiEntity>
        </UiEntity>
        <UiEntity uiTransform={{ width: textW, flexDirection: 'column', alignItems: 'flex-start', pointerFilter: 'none' }}>
          <OutlineLabel value="HOW TO PLAY" fontSize={F(34)} color={PAL.amber} width={textW} height={U(50)} align="middle-left" />
          <UiEntity uiTransform={{ height: U(8), pointerFilter: 'none' }} />
          <Line width={textW} text={mobile() ? 'Stand by the <b>orange block</b> and tap the <b>block button</b>.' : 'Stand by the <b>orange block</b> and press <b>E</b> to push it.'} />
          <Line width={textW} text="On the ice it keeps sliding until it hits something." />
          <Line width={textW} text="Get it onto the <b>glowing plate</b> in as <b>few moves</b> as you can!" />
          <UiEntity uiTransform={{ width: textW, justifyContent: 'center', margin: { top: U(10) }, pointerFilter: 'none' }}>
            <PillButton id="welcome-close" label="Close" danger width={U(120)} height={U(44)} onClick={closeWelcome} />
          </UiEntity>
        </UiEntity>
      </Card>
      <Sparkles width={width} size={U(30)} />
    </UiEntity>
  )
}
