import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { SPRITE_SIZE } from './spriteSizes'
import { REV } from './sprites'

// Keeps every HUD sprite referenced by a live UiBackground from boot, so a panel or button state shown later finds its
// texture already decoded and cached instead of flashing blank while it loads.
//
// Each one is a 1x1, fully transparent node referenced exactly like the real UI does (plain `texture: { src }`, no
// wrapMode / filterMode), or the explorer's cache key would differ. display: 'none' is avoided because not every
// explorer loads textures for hidden nodes. The example_* mockups are never shown, so they are left out.

const INVISIBLE = Color4.create(1, 1, 1, 0)
const FILES = Object.keys(SPRITE_SIZE).filter((f) => !f.split('/').pop()!.startsWith('example_'))

/** Mounted once at the HUD root, outside every conditional branch, so it never unmounts. */
export const UiTextureWarmer = () => (
  <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: 1, height: 1, pointerFilter: 'none' }}>
    {FILES.map((f) => (
      <UiEntity
        key={f}
        uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: 1, height: 1, pointerFilter: 'none' }}
        uiBackground={{ texture: { src: REV + f }, color: INVISIBLE }}
      />
    ))}
  </UiEntity>
)
