import { ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { Hud } from './hud'
import { resolvePlatform } from './platform'

export function setupHud() {
  resolvePlatform()
  // No canvas options: the SDK picks 1920x1080 (desktop) / 1600x720 (phone) and applies the device safe-area inset.
  ReactEcsRenderer.setUiRenderer(Hud)
}
