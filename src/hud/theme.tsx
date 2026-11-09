import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { BTN, FramedSprite, NineBg, PANEL, faceOf } from './sprites'
import { Color4 } from '@dcl/sdk/math'
import { mobile } from './platform'

// Slide Maze look (pre-revamp notes): a frozen cave. Deep navy panels, pale-ice rims, one warm amber accent (the same orange family as
// the movable blocks, so "orange = interactive" holds in the world and in the UI). Every colour and size lives here
// so the whole HUD can be re-skinned from one place.
const hex = (h: string, a = 1) =>
  Color4.create(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255, a)

// Option C "Arcade helado": saturated blues, chunky ink outlines, amber accent. Panels and buttons are sprites
// (see sprites.tsx); these colours are for text and the few flat bits that remain.
export const INK = hex('#0b1530')
export const PAL = {
  panel: hex('#2a4da6', 0.96),
  panelHi: hex('#3f80e6'),
  rim: hex('#8fd8ff'),
  rimDim: hex('#4a7ea8'),
  text: hex('#ffffff'),
  dim: hex('#cff3ff'),
  outline: INK,
  amber: hex('#ffc23d'),
  amberDark: hex('#ff7a1a'),
  good: hex('#74f5ae'),
  goodDark: hex('#20b868'),
  bad: hex('#ff8080'),
  badDark: hex('#e0344a')
}

// ---- Scaling ----
// Phones get a shorter canvas (720 vs 1080) and need thumb-sized targets, so everything is drawn bigger there.
export const S = (n: number): number => Math.round(n * (mobile() ? 1.5 : 1.15))
/** Smallest readable text. */
export const FS = (n: number): number => Math.max(S(n), mobile() ? 20 : 14)

// ---- Tactile pop: a quick swell when something changes or is pressed ----
const POP_MS = 260
const popAt: Record<string, number> = {}
export const popPress = (id: string) => {
  popAt[id] = Date.now()
}
export const popFactor = (id: string, amount = 0.12) => {
  const t = popAt[id]
  if (t === undefined) return 1
  const k = (Date.now() - t) / POP_MS
  return k >= 1 ? 1 : 1 + amount * Math.sin(k * Math.PI)
}

const hovered: Record<string, boolean> = {}
export const isHovered = (id: string) => !!hovered[id]
export const hover = (id: string) => ({
  onMouseEnter: () => {
    hovered[id] = true
  },
  onMouseLeave: () => {
    hovered[id] = false
  }
})

export const lighten = (c: Color4, k: number) =>
  Color4.create(Math.min(1, c.r + k), Math.min(1, c.g + k), Math.min(1, c.b + k), c.a)

type Size = number | `${number}%`

/** How big a panel's corners are drawn: the sprite's 30 px radius maps to the old S(16) radius. */
const panelUnit = () => S(16) / 30

/**
 * Panel: the blue "Arcade helado" slab (panels/panel_9slice.png, cut into nine pieces so it stretches on phones too).
 * Same props as before; `fill` / `rim` are accepted for compatibility but every panel uses the one sprite.
 */
export const Card = (props: {
  width: Size
  height: Size
  fill?: Color4
  rim?: Color4
  radius?: number
  border?: number
  pad?: number
  dir?: 'row' | 'column'
  align?: 'center' | 'flex-start' | 'flex-end'
  justify?: 'center' | 'flex-start' | 'flex-end' | 'space-between'
  block?: boolean // true = the card catches clicks so they don't reach the world behind it
  margin?: { top?: number; left?: number; right?: number; bottom?: number }
  children?: any
}) => {
  const u = panelUnit()
  return (
    <UiEntity
      uiTransform={{ width: props.width, height: props.height, margin: props.margin, pointerFilter: props.block ? 'block' : 'none' }}
    >
      <NineBg file="panels/panel_9slice.png" geo={PANEL} l={40} r={40} t={40} b={52} u={u} />
      <UiEntity
        uiTransform={{
          width: '100%',
          height: '100%',
          flexDirection: props.dir ?? 'column',
          alignItems: props.align ?? 'center',
          justifyContent: props.justify ?? 'center',
          padding: props.pad ?? 0,
          pointerFilter: 'none'
        }}
      >
        {props.children}
      </UiEntity>
    </UiEntity>
  )
}

// The SDK has no text outline, so it is faked with ink copies of the text around the glyphs. Eight copies (sides +
// corners) leave the diagonals √2 thicker and gaps between copies on big text, which reads as a jagged edge. Instead,
// spread the copies evenly on a circle of radius o, close enough (about 1.5 px apart) that the edge stays smooth.
const ringCache: Record<number, { left: number; top: number }[]> = {}
function outlineRing(o: number) {
  if (ringCache[o]) return ringCache[o]
  // sample one eighth of the circle and mirror it, so rounding to whole pixels stays symmetric
  const steps = Math.max(1, Math.ceil((o * Math.PI) / 4 / 1.5))
  const seen: Record<string, boolean> = {}
  const pts: { left: number; top: number }[] = []
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 4)
    const x = Math.round(Math.cos(a) * o)
    const y = Math.round(Math.sin(a) * o)
    for (const [l, t] of [[x, y], [y, x]]) {
      for (const [sl, st] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const k = `${l * sl},${t * st}`
        if (seen[k]) continue
        seen[k] = true
        pts.push({ left: l * sl, top: t * st })
      }
    }
  }
  pts.push({ left: 0, top: o + 1 }) // a thin drop shadow just under the outline
  return (ringCache[o] = pts)
}

/** Ink outline all around plus a solid drop shadow, like the sprite lettering. */
export const OutlineLabel = (props: {
  value: string
  fontSize: number
  color?: Color4
  width: Size
  height: number
  align?: 'middle-left' | 'middle-center' | 'middle-right'
  font?: 'sans-serif' | 'monospace'
}) => {
  const align = props.align ?? 'middle-center'
  const font = props.font ?? 'sans-serif'
  // thin: 1 px on normal text, 2 px only on big titles. Thicker ink fills in small letters and looks muddy.
  const o = Math.max(1, Math.round(props.fontSize / 20))
  const offs = outlineRing(o)
  return (
    <UiEntity uiTransform={{ width: props.width, height: props.height, pointerFilter: 'none' }}>
      {offs.map((p, i) => (
        <Label
          key={`o${i}`}
          value={props.value}
          fontSize={props.fontSize}
          color={INK}
          font={font}
          textAlign={align}
          textWrap="nowrap"
          uiTransform={{ width: '100%', height: props.height, positionType: 'absolute', position: p }}
        />
      ))}
      <Label
        value={props.value}
        fontSize={props.fontSize}
        color={props.color ?? PAL.text}
        font={font}
        textAlign={align}
        textWrap="nowrap"
        uiTransform={{ width: '100%', height: props.height, positionType: 'absolute', position: { left: 0, top: 0 } }}
      />
    </UiEntity>
  )
}

// ---- Buttons ----
const PRESS_MS = 140
const pressAt: Record<string, number> = {}
/** Marks a sprite as pressed for a moment (shows its _pressed frame). */
export const press = (id: string) => {
  pressAt[id] = Date.now()
}
export const isPressed = (id: string) => Date.now() - (pressAt[id] ?? 0) < PRESS_MS
export type BtnState = 'normal' | 'hover' | 'pressed' | 'disabled'
export const btnState = (id: string, disabled?: boolean): BtnState =>
  disabled ? 'disabled' : isPressed(id) ? 'pressed' : hovered[id] ? 'hover' : 'normal'

// Buttons whose label is baked into a sprite (Lilita One lettering, optically centred). Key: `${kind}|${label}`.
const BAKED: Record<string, string> = {
  'primary|PLAY': 'buttons_labeled/btn_play',
  'primary|Options': 'buttons_labeled/btn_options',
  'danger|Close': 'buttons_labeled/btn_close',
  'secondary|< Prev': 'buttons_labeled/btn_prev',
  'secondary|Next >': 'buttons_labeled/btn_next',
  'primary|My levels': 'buttons_labeled/btn_my_levels'
}
const HAS_DISABLED = ['buttons_labeled/btn_prev', 'buttons_labeled/btn_next']

/**
 * Chunky pill button with normal / hover / pressed sprites. Labels that have a baked sprite use it (its width follows
 * the sprite's aspect at the requested height); any other label is drawn on a blank pill, centred on the face.
 */
export const PillButton = (props: {
  id: string
  label: string
  width: number
  height: number
  accent?: boolean
  danger?: boolean // red: close / cancel
  disabled?: boolean
  sprite?: string // force a baked sprite base, e.g. 'buttons_labeled/btn_options_open'
  fontSize?: number
  onClick: () => void
  margin?: { top?: number; left?: number; right?: number; bottom?: number }
}) => {
  const kind = props.danger ? 'danger' : props.accent ? 'primary' : 'secondary'
  const state = btnState(props.id, props.disabled)
  const h = props.height
  const events = {
    onMouseDown: () => {
      if (props.disabled) return
      pressAt[props.id] = Date.now()
      popPress(props.id)
      props.onClick()
    },
    ...hover(props.id)
  }
  const baked = props.sprite ?? BAKED[`${kind}|${props.label}`]
  if (baked) {
    const st = state === 'disabled' && !HAS_DISABLED.includes(baked) ? 'normal' : state
    const file = `${baked}_${st}.png`
    const face = faceOf(file, BTN)
    const states = ['normal', 'hover', 'pressed', ...(HAS_DISABLED.includes(baked) ? ['disabled'] : [])].map((s) => `${baked}_${s}.png`)
    return <FramedSprite file={file} states={states} geo={BTN} w={Math.round((h * face.w) / face.h)} h={h} margin={props.margin} block {...events} />
  }
  const u = h / 66
  const st = state === 'disabled' ? 'disabled' : state
  const file = st === 'disabled' ? 'buttons/btn_secondary_disabled.png' : `buttons/btn_${kind}_${st}.png`
  const fs = props.fontSize ?? Math.min(FS(20), Math.round(h * 0.5))
  const dy = state === 'pressed' ? Math.round(4 * u) : 0
  return (
    <UiEntity
      uiTransform={{ width: props.width, height: h, margin: props.margin, justifyContent: 'center', alignItems: 'center', pointerFilter: 'block' }}
      {...events}
    >
      <NineBg file={file} geo={BTN} l={39} r={39} t={0} b={0} u={u} />
      <UiEntity uiTransform={{ width: '100%', height: h, position: { top: dy - Math.round(u) }, justifyContent: 'center', alignItems: 'center', pointerFilter: 'none' }}>
        <OutlineLabel value={props.label} fontSize={fs} color={state === 'disabled' ? PAL.dim : PAL.text} width="100%" height={h} />
      </UiEntity>
    </UiEntity>
  )
}
