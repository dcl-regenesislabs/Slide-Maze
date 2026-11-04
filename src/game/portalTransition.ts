import { engine } from '@dcl/sdk/ecs'

export const portalTransition = { active: false, alpha: 0 }
let phase: 'out' | 'waiting' | 'hold' | 'in' = 'out'
let elapsed = 0
let action: () => void | Promise<unknown>

export function beginPortalTransition(next: () => void | Promise<unknown>) {
  if (portalTransition.active) return
  action = next
  phase = 'out'
  elapsed = 0
  portalTransition.alpha = 0
  portalTransition.active = true
}

export function setupPortalTransition() {
  engine.addSystem((dt) => {
    if (!portalTransition.active) return
    elapsed += dt
    if (phase === 'out') {
      portalTransition.alpha = Math.min(1, elapsed / 0.4)
      if (portalTransition.alpha === 1) {
        // Keep one full frame black before changing the world.
        phase = 'waiting'
        elapsed = 0
      }
    } else if (phase === 'waiting' && elapsed > 0) {
      phase = 'hold'
      elapsed = -Infinity
      void Promise.resolve().then(action).catch((error) => {
        console.error('Portal transition failed', error)
      }).then(() => { elapsed = 0 })
    } else if (phase === 'hold' && elapsed >= 0.35) {
      phase = 'in'
      elapsed = 0
    } else if (phase === 'in') {
      portalTransition.alpha = Math.max(0, 1 - elapsed / 0.5)
      if (portalTransition.alpha === 0) portalTransition.active = false
    }
  }, 7, 'sm-portal-transition')
}
