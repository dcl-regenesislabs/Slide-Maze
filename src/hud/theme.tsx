import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { mobile } from './platform'

// Slide Maze look: a frozen cave. Deep navy panels, pale-ice rims, one warm amber accent (the same orange family as
// the movable blocks, so "orange = interactive" holds in the world and in the UI). Every colour and size lives here
// so the whole HUD can be re-skinned from one place.
const hex = (h: string, a = 1) =>
  Color4.create(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255, a)

export const PAL = {
  panel: hex('#0b1830', 0.92),
  panelHi: hex('#16305a', 0.96),
  rim: hex('#8fd8ff'),
  rimDim: hex('#4a7ea8'),
  text: hex('#eaf7ff'),
  dim: hex('#9cc4e0'),
  outline: hex('#050d1c'),
  amber: hex('#ffb13b'),
  amberDark: hex('#c9791a'),
  good: hex('#5dffa0'),
  goodDark: hex('#1c8a54'),
  bad: hex('#ff6b5e'),
  badDark: hex('#a8281f')
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

/** A rounded card with a coloured rim: the outer entity's padding is the rim, the fill sits inside. */
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
  const r = props.radius ?? S(16)
  const b = props.border ?? Math.max(2, S(3))
  return (
    <UiEntity
      uiTransform={{
        width: props.width,
        height: props.height,
        margin: props.margin,
        padding: b,
        borderRadius: r,
        pointerFilter: props.block ? 'block' : 'none'
      }}
      uiBackground={{ color: props.rim ?? PAL.rim }}
    >
      <UiEntity
        uiTransform={{
          width: '100%',
          height: '100%',
          borderRadius: Math.max(2, r - b),
          flexDirection: props.dir ?? 'column',
          alignItems: props.align ?? 'center',
          justifyContent: props.justify ?? 'center',
          padding: props.pad ?? 0,
          pointerFilter: props.block ? 'block' : 'none'
        }}
        uiBackground={{ color: props.fill ?? PAL.panel }}
      >
        {props.children}
      </UiEntity>
    </UiEntity>
  )
}

const OFF = [
  { left: -2, top: 0 },
  { left: 2, top: 0 },
  { left: 0, top: -2 },
  { left: 0, top: 2 }
]

/** Text with a dark outline so it stays readable over the 3D world. */
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
  return (
    <UiEntity uiTransform={{ width: props.width, height: props.height, pointerFilter: 'none' }}>
      {OFF.map((o, i) => (
        <Label
          key={`o${i}`}
          value={props.value}
          fontSize={props.fontSize}
          color={PAL.outline}
          font={font}
          textAlign={align}
          uiTransform={{ width: '100%', height: props.height, positionType: 'absolute', position: o }}
        />
      ))}
      <Label
        value={props.value}
        fontSize={props.fontSize}
        color={props.color ?? PAL.text}
        font={font}
        textAlign={align}
        uiTransform={{ width: '100%', height: props.height }}
      />
    </UiEntity>
  )
}

/** Pill button with hover and press feedback. `accent` makes it the primary (amber) action. */
export const PillButton = (props: {
  id: string
  label: string
  width: number
  height: number
  accent?: boolean
  danger?: boolean // red: close / cancel
  onClick: () => void
  margin?: { top?: number; left?: number; right?: number; bottom?: number }
}) => {
  const hov = !!hovered[props.id]
  const k = popFactor(props.id, 0.08)
  const w = Math.round(props.width * k)
  const h = Math.round(props.height * k)
  const rim = props.danger ? PAL.bad : props.accent ? PAL.amber : PAL.rimDim
  const fill = props.danger ? PAL.badDark : props.accent ? PAL.amberDark : PAL.panelHi
  const border = Math.max(2, S(3))
  return (
    <UiEntity
      uiTransform={{
        width: w,
        height: h,
        margin: props.margin,
        padding: border,
        borderRadius: h / 2,
        pointerFilter: 'block'
      }}
      uiBackground={{ color: hov ? lighten(rim, 0.15) : rim }}
      onMouseDown={() => {
        popPress(props.id)
        props.onClick()
      }}
      {...hover(props.id)}
    >
      <UiEntity
        uiTransform={{
          width: '100%',
          height: '100%',
          borderRadius: h / 2 - border,
          justifyContent: 'center',
          alignItems: 'center',
          pointerFilter: 'none'
        }}
        uiBackground={{ color: hov ? lighten(fill, 0.08) : fill }}
      >
        <Label
          value={props.label}
          fontSize={FS(20)}
          font="sans-serif"
          color={PAL.text}
          textAlign="middle-center"
          textWrap="nowrap"
          uiTransform={{ width: w - border * 2, height: h - border * 2 }}
        />
      </UiEntity>
    </UiEntity>
  )
}
