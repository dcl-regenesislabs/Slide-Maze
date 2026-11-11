import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { SPRITE_SIZE } from './spriteSizes'

// "Arcade helado" (option C) sprites live in assets/images/revamp. Every framed sprite was exported the same way:
// the face (the part that is the button / panel) plus a 6 px transparent margin around it and a solid ink drop shadow
// under it, all at 2x (toast at 1.9x). Components here lay out the FACE only, so a sprite drops into the same box the
// old flat UI used, and the margin + shadow hang outside it.
//
// Nine-slice backgrounds are not implemented on the mobile client (it tiles instead of stretching), so stretchable
// sprites are cut by hand into up to nine pieces with `uvs` + 'stretch', which renders the same on desktop and phone.

export const REV = 'assets/images/revamp/'
const PAD = 6

export type Geo = { scale: number; sh: number }
export const BTN: Geo = { scale: 2, sh: 7 }
export const PANEL: Geo = { scale: 2, sh: 10 }
export const TILE: Geo = { scale: 2, sh: 6 }
export const TOAST: Geo = { scale: 1.9, sh: 8 }

/** Face size of a framed sprite, in design (1x) units. */
export function faceOf(file: string, g: Geo): { w: number; h: number } {
  const [pw, ph] = SPRITE_SIZE[file] ?? [100, 100]
  return { w: pw / g.scale - PAD * 2, h: ph / g.scale - PAD * 2 - g.sh }
}

/** Pixel size of any sprite (digits, captions, icons...). */
export const sizeOf = (file: string): [number, number] => SPRITE_SIZE[file] ?? [100, 100]

const HIDDEN = Color4.create(1, 1, 1, 0)

const bg = (file: string, uvs?: number[]) => ({
  textureMode: 'stretch' as const,
  texture: { src: REV + file },
  ...(uvs ? { uvs } : {})
})

/**
 * A framed sprite drawn at a fixed face size. `w` x `h` is the layout box (the face); the image's margin and shadow
 * overhang it. Children are centred on the face.
 */
export const FramedSprite = (props: {
  file: string
  geo: Geo
  w: number
  h: number
  // Every state frame of this sprite (normal / hover / pressed...), in a fixed order. They are all kept mounted and
  // only the active one is opaque, so the client never has to load a texture on hover (that showed a blank flash).
  states?: string[]
  margin?: { top?: number; left?: number; right?: number; bottom?: number }
  dy?: number // nudges children down (pressed state)
  block?: boolean
  onMouseDown?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  dir?: 'row' | 'column'
  children?: any
}) => {
  const face = faceOf(props.file, props.geo)
  const ux = props.w / face.w
  const uy = props.h / face.h
  return (
    <UiEntity
      uiTransform={{
        width: props.w,
        height: props.h,
        margin: props.margin,
        flexDirection: props.dir ?? 'column',
        justifyContent: 'center',
        alignItems: 'center',
        pointerFilter: props.block ? 'block' : 'none'
      }}
      onMouseDown={props.onMouseDown}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
    >
      {(props.states ?? [props.file]).map((f) => (
        <UiEntity
          key={f}
          uiTransform={{
            positionType: 'absolute',
            position: { top: -Math.round(PAD * uy), left: -Math.round(PAD * ux) },
            width: Math.round((face.w + PAD * 2) * ux),
            height: Math.round((face.h + PAD * 2 + props.geo.sh) * uy),
            pointerFilter: 'none'
          }}
          uiBackground={{ ...bg(f), color: f === props.file ? Color4.White() : HIDDEN }}
        />
      ))}
      {props.dy ? (
        <UiEntity uiTransform={{ width: '100%', height: '100%', position: { top: props.dy }, flexDirection: props.dir ?? 'column', justifyContent: 'center', alignItems: 'center', pointerFilter: 'none' }}>
          {props.children}
        </UiEntity>
      ) : (
        props.children
      )}
    </UiEntity>
  )
}

/**
 * Hand-made nine-slice that fills its parent (absolute, overhanging by the sprite margin and shadow).
 * l/r/t/b are the fixed caps in design units, measured on the image including its margin; 0 = no cap on that side.
 * `u` is UI units per design unit, i.e. how big the corners are drawn.
 */
export const NineBg = (props: { file: string; geo: Geo; l: number; r: number; t: number; b: number; u: number }) => {
  const [pw, ph] = sizeOf(props.file)
  const DW = pw / props.geo.scale
  const DH = ph / props.geo.scale
  const u = props.u
  const cols = [
    [0, props.l],
    [props.l, DW - props.r],
    [DW - props.r, DW]
  ].filter(([a, b]) => b - a > 0.01)
  const rows = [
    [0, props.t],
    [props.t, DH - props.b],
    [DH - props.b, DH]
  ].filter(([a, b]) => b - a > 0.01)
  const isMidCol = (c: number[]) => c[0] === props.l && c[1] === DW - props.r
  const isMidRow = (r: number[]) => r[0] === props.t && r[1] === DH - props.b
  // Seam guards (Bevy does not snap UI to pixels, so butt-joined pieces showed hairlines): caps are whole units,
  // every piece after the first overlaps the previous one by 1 unit, and inner UV edges are pulled in half a texel.
  const capPx = (a: number, b: number) => Math.max(1, Math.round((b - a) * u))
  const tx = 0.5 / pw
  const ty = 0.5 / ph
  const inU = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: {
          top: -Math.round(PAD * u),
          left: -Math.round(PAD * u),
          right: -Math.round(PAD * u),
          bottom: -Math.round((PAD + props.geo.sh) * u)
        },
        flexDirection: 'column',
        pointerFilter: 'none'
      }}
    >
      {rows.map((r, ri) => (
        <UiEntity
          key={`r${ri}`}
          uiTransform={{
            width: '100%',
            ...(isMidRow(r) ? { flexGrow: 1, flexShrink: 1, height: 0 } : { height: capPx(r[0], r[1]), flexShrink: 0 }),
            margin: { top: ri === 0 ? 0 : -1 },
            flexDirection: 'row',
            pointerFilter: 'none'
          }}
        >
          {cols.map((c, ci) => {
            const x0 = inU(c[0] / DW + (c[0] > 0 ? tx : 0))
            const x1 = inU(c[1] / DW - (c[1] < DW ? tx : 0))
            const v0 = inU(1 - r[1] / DH + (r[1] < DH ? ty : 0))
            const v1 = inU(1 - r[0] / DH - (r[0] > 0 ? ty : 0))
            return (
              <UiEntity
                key={`c${ci}`}
                uiTransform={{
                  height: '100%',
                  ...(isMidCol(c) ? { flexGrow: 1, flexShrink: 1, width: 0 } : { width: capPx(c[0], c[1]), flexShrink: 0 }),
                  margin: { left: ci === 0 ? 0 : -1 },
                  pointerFilter: 'none'
                }}
                uiBackground={bg(props.file, [x0, v0, x0, v1, x1, v1, x1, v0])}
              />
            )
          })}
        </UiEntity>
      ))}
    </UiEntity>
  )
}

/** Plain image at a given height, keeping its aspect ratio (captions, titles, tags, icons). */
export const Img = (props: { key?: string; file: string; h: number; w?: number; margin?: { top?: number; left?: number; right?: number; bottom?: number } }) => {
  const [pw, ph] = sizeOf(props.file)
  return (
    <UiEntity
      uiTransform={{ width: props.w ?? Math.round((props.h * pw) / ph), height: props.h, margin: props.margin, flexShrink: 0, pointerFilter: 'none' }}
      uiBackground={bg(props.file)}
    />
  )
}

const DIGIT_FILE: Record<string, string> = { ':': 'colon', '.': 'dot', '/': 'slash' }
/** Number / time drawn with the game's digit sprites. `h` is the sprite height; glyphs are tucked together. */
/** `gap` is the extra room a space adds, as a share of the digit height (0.3 by default; small for thousands). */
export const Digits = (props: { text: string; h: number; gap?: number; margin?: { top?: number; bottom?: number } }) => {
  const tuck = Math.round(props.h * 0.085)
  const chars = props.text.split('').filter((c) => c === ' ' || /[0-9:./]/.test(c))
  return (
    <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: props.h, margin: props.margin, pointerFilter: 'none' }}>
      {chars.map((c, i) =>
        c === ' ' ? null : (
          <Img
            key={`d${i}`}
            file={`digits/digit_${DIGIT_FILE[c] ?? c}.png`}
            h={props.h}
            margin={{ left: (i === 0 ? 0 : -tuck) + (chars[i - 1] === ' ' ? Math.round(props.h * (props.gap ?? 0.3)) : 0) }}
          />
        )
      )}
    </UiEntity>
  )
}

/** The little ice sparkles on panel corners. */
export const Sparkles = (props: { width: number; size: number }) => (
  <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: props.width, height: 1, pointerFilter: 'none' }}>
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: -props.size * 0.5, left: -props.size * 0.55 }, width: props.size, height: props.size }} uiBackground={bg('fx/sparkle_big.png')} />
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { top: -props.size * 0.5, left: props.width - props.size * 0.4 }, width: props.size * 0.6, height: props.size * 0.6 }}
      uiBackground={bg('fx/sparkle_small.png')}
    />
  </UiEntity>
)
