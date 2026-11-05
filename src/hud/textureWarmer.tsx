import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { SPRITE_SIZE } from './spriteSizes'
import { REV } from './sprites'

// Same pattern as Marsh Colony's UiTextureWarmer (Lean, 91e0f2b): keep
// real UiBackground references mounted so later panels use the UI texture cache.
// Derive paths from the shared sprite catalogue, including hover/pressed states.
// Example mockups are never drawn by the HUD and do not need to be loaded, nor are the Close / Editor menu entries
// (removed from the Options menu for now).
const UNUSED = ['menu_labeled/menu_close_', 'menu_labeled/menu_editor_']
const UI_TEXTURES = Object.keys(SPRITE_SIZE)
  .filter((file) => !file.split('/').pop()!.startsWith('example_'))
  .filter((file) => !UNUSED.some((prefix) => file.startsWith(prefix)))
  .map((file) => REV + file)

const INVISIBLE = { r: 1, g: 1, b: 1, a: 0 }

// Keep the same plain { src } texture options as sprites.tsx. Hidden display
// nodes may skip loading; transparent 1x1 nodes remain mounted without input.
export function UiTextureWarmer() {
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: 1, height: 1, pointerFilter: 'none' }}
    >
      {UI_TEXTURES.map((src) => (
        <UiEntity
          key={src}
          uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: 1, height: 1, pointerFilter: 'none' }}
          uiBackground={{ textureMode: 'stretch', texture: { src }, color: INVISIBLE }}
        />
      ))}
    </UiEntity>
  )
}
