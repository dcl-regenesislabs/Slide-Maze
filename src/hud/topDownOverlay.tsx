import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import { DIR_DELTA, Dir } from '../game/grid'
import { session } from '../game/session'
import { legalDirs, screenAspect, tapArrow, tapBlock, tileScreenHeight, toScreen, topDownUi, topDownView } from '../game/topDown'
import { levelGeometry, playView } from '../game/world'
import { REV } from './sprites'
import { hover, isHovered, press, isPressed } from './theme'

// The top-down view's controls, drawn over the 3D picture: a button over every cube (a thin ring; amber when selected)
// and, around the selected one, an arrow on each side it can be pushed. Positions come from projecting the cubes through
// the fixed camera (topDown.ts), in screen percentages so they hold on any screen size.
//
// It has its own renderer over the WHOLE screen (screenInset 'none'): toScreen() projects onto the full viewport, while
// the main HUD is laid out in the device safe area, which on a phone with a notch is a smaller, differently shaped box.
// It sits behind the HUD (lower zIndex) so the top bar and the Options menu stay on top of the rings.
export const TOP_DOWN_OVERLAY_Z = 1
export function setupTopDownOverlay() {
  ReactEcsRenderer.addUiRenderer(engine.addEntity(), () => <TopDownOverlay />, { screenInset: 'none', zIndex: TOP_DOWN_OVERLAY_Z })
}

const RING = Color4.create(1, 1, 1, 0.55)
const RING_HOVER = Color4.create(1, 1, 1, 0.95)
const SELECTED = Color4.create(1, 0.76, 0.24, 1)
const CLEAR = Color4.create(0, 0, 0, 0)

// the chevron sprite points down; up is the same sprite flipped (uvs: bottom-left, top-left, top-right, bottom-right)
const CHEVRON: Record<Dir, { file: string; uvs?: number[] }> = {
  S: { file: 'icons/icon_chevron.png' },
  N: { file: 'icons/icon_chevron.png', uvs: [0, 1, 0, 0, 1, 0, 1, 1] },
  E: { file: 'icons/icon_chevron_right.png' },
  W: { file: 'icons/icon_chevron_left.png' }
}

/** A box centred on a screen point, sized as a share of the screen height (so it stays square on any screen). */
const boxAt = (left: number, top: number, hPct: number) => {
  const wPct = hPct / screenAspect()
  return {
    positionType: 'absolute' as const,
    position: { left: `${left - wPct / 2}%` as const, top: `${top - hPct / 2}%` as const },
    width: `${wPct}%` as const,
    height: `${hPct}%` as const
  }
}

export const TopDownOverlay = () => {
  if (!topDownView.on || session.inLobby || session.solved || session.menuOpen) return null
  const view = playView()
  if (!view) return null
  const { tile, blockSize } = levelGeometry()
  const tileH = tileScreenHeight()
  const selected = topDownUi.selected
  const dirs = selected >= 0 ? legalDirs(selected) : []
  const sel = selected >= 0 ? view.blocks[selected] : null
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }}>
      {view.blocks.map((b, i) => {
        const at = toScreen(b)
        if (!at) return null
        const id = `td-block-${i}`
        const mine = i === selected
        const ring = mine ? SELECTED : isHovered(id) ? RING_HOVER : RING
        return (
          <UiEntity
            key={id}
            uiTransform={{ ...boxAt(at.left, at.top, tileH * (blockSize / tile)), borderWidth: mine ? 5 : 3, borderColor: ring, borderRadius: 10, pointerFilter: 'block' }}
            uiBackground={{ color: mine ? Color4.create(1, 0.76, 0.24, 0.18) : CLEAR }}
            onMouseDown={() => tapBlock(i)}
            {...hover(id)}
          />
        )
      })}
      {sel
        ? dirs.map((d) => {
            const delta = DIR_DELTA[d]
            // the arrow sits on the next tile that way (grid rows grow south, world z grows north)
            const at = toScreen({ x: sel.x + delta.x * tile, y: sel.y, z: sel.z - delta.y * tile })
            if (!at) return null
            const id = `td-arrow-${d}`
            const k = isPressed(id) ? 0.88 : isHovered(id) ? 1.08 : 1
            const ch = CHEVRON[d]
            return (
              <UiEntity
                key={id}
                uiTransform={{ ...boxAt(at.left, at.top, tileH * 0.62 * k), justifyContent: 'center', alignItems: 'center', pointerFilter: 'block' }}
                uiBackground={{ texture: { src: REV + 'level_tiles/tile_current_bg.png' }, textureMode: 'stretch' }}
                onMouseDown={() => {
                  press(id)
                  tapArrow(d)
                }}
                {...hover(id)}
              >
                <UiEntity
                  uiTransform={{ width: '62%', height: '62%', margin: { bottom: '8%' }, pointerFilter: 'none' }}
                  uiBackground={{ texture: { src: REV + ch.file }, textureMode: 'stretch', ...(ch.uvs ? { uvs: ch.uvs } : {}) }}
                />
              </UiEntity>
            )
          })
        : null}
    </UiEntity>
  )
}
