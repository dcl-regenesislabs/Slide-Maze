import { CameraModeArea, CameraType, engine, InputAction, SkyboxTime, Transform, TouchScreenControls } from '@dcl/sdk/ecs'
import { ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { Hud } from './hud'
import { editor, session } from '../game/session'
import { Vector3 } from '@dcl/sdk/math'
import { mobile, resolvePlatform } from './platform'

export function setupHud() {
  resolvePlatform()
  // Phones: keep the joystick (the only way to walk) and the central Jump button, drop every other native control so
  // they stop covering the HUD. No-op on desktop.
  TouchScreenControls.hideCrosshair()
  TouchScreenControls.hide([
    InputAction.IA_POINTER,
    InputAction.IA_PRIMARY,
    InputAction.IA_SECONDARY,
    InputAction.IA_ACTION_3,
    InputAction.IA_ACTION_4,
    InputAction.IA_ACTION_5,
    InputAction.IA_ACTION_6
  ])
  // The interact (hand) button and the crosshair come back wherever the player has to aim and tap: in the editor (to place
  // tiles) and in the lobby (level terminal). They stay hidden while playing a level.
  let aiming: boolean | null = null
  let erasing: boolean | null = null
  const eraserIcon = { tex: { $case: 'texture' as const, texture: { src: 'assets/images/icon-eraser.png' } } }
  engine.addSystem(() => {
    const want = editor.open || session.inLobby
    if (want === aiming && editor.open === erasing) return
    aiming = want
    erasing = editor.open
    // Hand = IA_POINTER (place), eraser = IA_SECONDARY (the same action as F on desktop). The joystick and Jump stay.
    TouchScreenControls.createOrReplace(engine.RootEntity, {
      touchInputs: [
        { inputAction: InputAction.IA_POINTER, hide: !want },
        { inputAction: InputAction.IA_SECONDARY, hide: !editor.open, icon: eraserIcon },
        { inputAction: InputAction.IA_PRIMARY, hide: true },
        { inputAction: InputAction.IA_ACTION_3, hide: true },
        { inputAction: InputAction.IA_ACTION_4, hide: true },
        { inputAction: InputAction.IA_ACTION_5, hide: true },
        { inputAction: InputAction.IA_ACTION_6, hide: true }
      ],
      hideJoystick: false,
      hideCrosshair: !want
    })
  })
  // No canvas options: the SDK picks 1920x1080 (desktop) / 1600x720 (phone) and applies the device safe-area inset.
  ReactEcsRenderer.setUiRenderer(Hud)
  // Phones play in a fixed morning sky (09:00). Applied once, as soon as the platform lookup answers.
  let skySet = false
  engine.addSystem(() => {
    if (skySet || !mobile()) return
    skySet = true
    SkyboxTime.createOrReplace(engine.RootEntity, { fixedTime: 32400 })
    // ...and the camera stays third person: a box over the whole 8x8-parcel scene (128 m) forces it.
    const cam = engine.addEntity()
    Transform.create(cam, { position: Vector3.create(64, 60, 64) })
    CameraModeArea.create(cam, { area: Vector3.create(128, 120, 128), mode: CameraType.CT_THIRD_PERSON })
  })
}
