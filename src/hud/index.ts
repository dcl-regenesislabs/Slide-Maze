import { TOP_DOWN_OVERLAY_Z, setupTopDownOverlay } from './topDownOverlay'
import { CameraModeArea, CameraType, engine, InputAction, SkyboxTime, Transform, TouchScreenControls } from '@dcl/sdk/ecs'
import { ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { Hud, completeShowing, options } from './hud'
import { topDownView } from '../game/topDown'
import { pushEffort, pushPrompt } from '../game/world'
import { editor, session } from '../game/session'
import { soundPanel } from '../game/sfx'
import { markTutorialSeen, myLevels, tutorial } from '../game/levelStore'
import { openWelcome, welcome } from './welcome'
import { phoneHint } from './pushPrompt'
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
  // Jump also goes while the Options menu or any full panel (level select, level code, My levels, sound) is open, so
  // it does not sit over them.
  let aiming: boolean | null = null
  let erasing: boolean | null = null
  let jumpHidden: boolean | null = null
  let joystickHidden: boolean | null = null
  let pushShown: boolean | null = null
  const eraserIcon = { tex: { $case: 'texture' as const, texture: { src: 'assets/images/icon-eraser.png' } } }
  const pushIcon = { tex: { $case: 'texture' as const, texture: { src: 'assets/images/revamp/tutorial/block_button.png' } } } // tight square crop, so the cube fills the button
  // How to play opens on a player's first arrival (the server says whether they have seen it; if it has not answered in
  // WELCOME_FALLBACK_MS, show it anyway). It is also in the Options menu.
  const WELCOME_FALLBACK_MS = 10000
  const startedAt = Date.now()
  let welcomeDecided = false
  let wasInLobby = session.inLobby
  engine.addSystem(() => {
    // --- UI state the HUD render reads (kept out of the render itself) ---
    if (!welcomeDecided && (tutorial.known || Date.now() - startedAt > WELCOME_FALLBACK_MS)) {
      welcomeDecided = true
      if (!tutorial.seen && session.inLobby && !editor.open) openWelcome()
    }
    // the panel belongs to the lobby: starting a level (or opening the editor) puts it away, and counts as seen
    if (welcome.open && ((wasInLobby && !session.inLobby) || editor.open)) {
      welcome.open = false
      markTutorialSeen()
    }
    wasInLobby = session.inLobby
    // The Options menu lives in SideButtons, which unmounts in the editor; drop a stale open flag there so it cannot
    // keep Jump hidden after the editor is opened from the lobby terminal.
    if (editor.open) options.open = false
    // Level Complete stands alone: Options and the sound panel close under it
    const complete = completeShowing()
    if (complete) {
      options.open = false
      soundPanel.open = false
    }
    // the phone's "Tap to push" hint is retired by the first push
    if (pushEffort.active) phoneHint.done = true
    const panelOpen = options.open || session.menuOpen || session.codeOpen || myLevels.panelOpen || soundPanel.open || welcome.open || complete
    session.uiOpen = panelOpen // world.ts: E does not push under a panel

    // --- phone touch controls ---
    const want = editor.open || session.inLobby
    // the top-down view has no avatar to move: no joystick, no jump
    const hideJump = panelOpen || topDownView.on
    // E pushes the block the avatar stands against (world.ts); on a phone its button shows only then
    const canPush = pushPrompt.block >= 0 && !hideJump
    if (want === aiming && editor.open === erasing && hideJump === jumpHidden && topDownView.on === joystickHidden && canPush === pushShown) return
    pushShown = canPush
    joystickHidden = topDownView.on
    aiming = want
    erasing = editor.open
    jumpHidden = hideJump
    // Hand = IA_POINTER (place), eraser = IA_SECONDARY (the same action as F on desktop). The joystick and Jump stay.
    TouchScreenControls.createOrReplace(engine.RootEntity, {
      touchInputs: [
        { inputAction: InputAction.IA_POINTER, hide: !want },
        { inputAction: InputAction.IA_SECONDARY, hide: !editor.open, icon: eraserIcon },
        { inputAction: InputAction.IA_JUMP, hide: hideJump },
        { inputAction: InputAction.IA_PRIMARY, hide: !canPush, icon: pushIcon },
        { inputAction: InputAction.IA_ACTION_3, hide: true },
        { inputAction: InputAction.IA_ACTION_4, hide: true },
        { inputAction: InputAction.IA_ACTION_5, hide: true },
        { inputAction: InputAction.IA_ACTION_6, hide: true }
      ],
      hideJoystick: topDownView.on,
      hideCrosshair: !want
    })
  })
  // The level select hides the toast and hint banners; hold their timers while it is open so they are not used up
  // behind it.
  // Measured on the same wall clock as the deadlines, so a long stay in the menu does not drift.
  let heldAt = 0
  engine.addSystem(() => {
    const now = Date.now()
    if (session.menuOpen && heldAt) {
      const ms = now - heldAt
      if (session.toastUntil > heldAt) session.toastUntil += ms
      if (session.hintUntil > heldAt) session.hintUntil += ms
    }
    heldAt = session.menuOpen ? now : 0
  })
  // No canvas options: the SDK picks 1920x1080 (desktop) / 1600x720 (phone) and applies the device safe-area inset.
  // zIndex only orders it above the top-down overlay, which has its own full-screen renderer.
  ReactEcsRenderer.setUiRenderer(Hud, { zIndex: TOP_DOWN_OVERLAY_Z + 1 })
  setupTopDownOverlay()
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
