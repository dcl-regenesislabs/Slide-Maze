import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { FS, OutlineLabel, PAL, S } from './theme'
import { Img } from './sprites'
import { mobile } from './platform'
import { pushEffort, pushPrompt } from '../game/world'

// Shown at the bottom of the screen while the avatar stands against a block it can push.
// Desktop: one baked "[E] to push" pill (hud/prompt_e_push.png).
// Phone: "Tap to push" next to the block icon (the icon of the action button that appears then, see hud/index.ts),
// only until the first push: after that the button alone is enough.

let phoneHintDone = false

export const PushPrompt = () => {
  if (pushEffort.active) phoneHintDone = true
  if (pushPrompt.block < 0) return null
  if (mobile() && phoneHintDone) return null
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
