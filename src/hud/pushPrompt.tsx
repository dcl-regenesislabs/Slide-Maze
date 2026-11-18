import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { FS, OutlineLabel, PAL, S } from './theme'
import { Img } from './sprites'
import { mobile } from './platform'
import { pushPrompt } from '../game/world'

// Shown at the bottom of the screen while the avatar stands against a block it can push.
// Desktop: one baked "[E] to push" pill (hud/prompt_e_push.png).
// Phone: "Tap to push" next to the block icon (the icon of the action button that appears then, see hud/index.ts),
// only until the first push: after that the button alone is enough.

/** The phone's "Tap to push" hint is retired after the first push (set by the HUD system in hud/index.ts). */
export const phoneHint = { done: false }

export const PushPrompt = () => {
  // hidden while a push is winding up, sliding or cooling down (the button stays, see hud/index.ts)
  if (pushPrompt.block < 0 || pushPrompt.busy) return null
  if (mobile() && phoneHint.done) return null
  const h = S(56)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: S(mobile() ? 150 : 110), left: 0 },
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'center',
        pointerFilter: 'none'
      }}
    >
      {mobile() ? (
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', pointerFilter: 'none' }}>
          <Img file="tutorial/block.png" h={S(46)} margin={{ right: S(10) }} />
          <OutlineLabel value="Tap to push" fontSize={FS(26)} color={PAL.amber} width={S(170)} height={S(46)} align="middle-left" />
        </UiEntity>
      ) : (
        <Img file="hud/prompt_e_push.png" h={h} />
      )}
    </UiEntity>
  )
}
