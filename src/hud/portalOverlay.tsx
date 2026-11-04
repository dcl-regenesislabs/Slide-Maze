import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import { portalTransition, setupPortalTransition } from '../game/portalTransition'

export function setupPortalOverlay() {
  setupPortalTransition()
  ReactEcsRenderer.addUiRenderer(engine.addEntity(), () => (
    <UiEntity
      uiTransform={{ width: '100%', height: '100%', display: portalTransition.active ? 'flex' : 'none', pointerFilter: 'block' }}
      uiBackground={{ color: Color4.create(0, 0, 0, portalTransition.alpha) }}
    />
  ), { screenInset: 'none', zIndex: 100 })
}
