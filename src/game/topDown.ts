// Top-down view: a fixed camera straight above the level, the avatar hidden and frozen, and the puzzle played by tapping a
// cube and then one of the arrows that appear around it (the overlay is drawn by hud/topDownOverlay.tsx).
//
// The rules are the 3D game's: a push needs the player to get to the face opposite the push (walking over the tiles
// they can stand on), and after it the player stands where the block was. The player is not drawn, so their tile is
// kept here (topDownView.player) and every push follows those rules, which is also what the solver, the hint and the
// par used for scoring assume.
//
// Clicks are UI buttons over the projected cubes rather than pointer events on 3D entities: on a phone the explorer only
// aims world clicks through the screen-centre crosshair, which a fixed camera cannot point at a chosen cube.

import { engine, Entity, InputModifier, MainCamera, Transform, UiCanvasInformation, VirtualCamera } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { DIRS, DIR_DELTA, Dir, Pt } from './grid'
import { canReachExit, push, reachable } from './logic'
import { session } from './session'
import { avatarTile, completeFromTopDown, levelGen, levelGeometry, placeAvatarOn, playView, pushEmoteActive, pushFromTopDown, topDownView } from './world'

export { topDownView }

const FOV = 60 // degrees, vertical (the VirtualCamera default)
const MARGIN_TILES = 1.6 // room around the level (the entrance / exit annexes stick out about a tile)
const HUD_TILES = 1 // extra room at the top for the top bar, which sits over the picture

/** UI state for the overlay: the selected cube (-1 = none) and a one-off message when the exit cannot be reached. */
export const topDownUi = { selected: -1, blockedExitShown: false }

let camera: Entity | null = null
let seenGen = -1
let doorDone = false

/** Turn the top-down view on or off (the Options menu entry). */
export function toggleTopDown() {
  if (topDownView.on) exitTopDown()
  else enterTopDown()
}

function enterTopDown() {
  const view = playView()
  if (!view || session.inLobby) return
  camera ??= engine.addEntity()
  Transform.createOrReplace(camera, placeCamera())
  VirtualCamera.createOrReplace(camera, { fov: FOV, defaultTransition: { transitionMode: VirtualCamera.Transition.Time(0.6) } })
  // nothing else in the scene creates MainCamera, so it may not exist yet (getMutable would throw)
  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: camera })
  // only once the camera has switched: the HUD and the controls follow this flag
  topDownView.on = true
  topDownView.player = avatarTile() ?? view.level.start
  topDownUi.selected = -1
  seenGen = levelGen
  doorDone = false
  freeze(true)
}

/** Back to the normal camera, with the avatar placed where the hidden player was. */
export function exitTopDown() {
  if (!topDownView.on) return
  topDownView.on = false
  topDownUi.selected = -1
  if (MainCamera.has(engine.CameraEntity)) MainCamera.getMutable(engine.CameraEntity).virtualCameraEntity = undefined
  if (!pushEmoteActive()) freeze(false)
  if (playView() && !session.inLobby) placeAvatarOn(topDownView.player)
}

const freeze = (on: boolean) => {
  if (on) InputModifier.createOrReplace(engine.PlayerEntity, { mode: InputModifier.Mode.Standard({ disableAll: true }) })
  else InputModifier.deleteFrom(engine.PlayerEntity)
}

/** Screen width / height (landscape on desktop, either way on a phone). */
export function screenAspect() {
  const c = UiCanvasInformation.getOrNull(engine.RootEntity)
  return c && c.width > 0 && c.height > 0 ? c.width / c.height : 16 / 9
}

/** Camera height above the floor that fits the whole level (with margins) on screen. */
function cameraHeight() {
  const view = playView()
  const { tile } = levelGeometry()
  const w = view ? view.level.width : 8
  const h = view ? view.level.height : 8
  const halfX = ((w + MARGIN_TILES * 2) * tile) / 2
  const halfZ = ((h + MARGIN_TILES * 2 + HUD_TILES) * tile) / 2
  const tanV = Math.tan(((FOV / 2) * Math.PI) / 180)
  return Math.max(halfZ / tanV, halfX / (tanV * screenAspect()))
}

/** Straight down over the level centre, north at the top of the screen; shifted north so the top bar does not cover it. */
function placeCamera() {
  const { origin, floorTop, tile } = levelGeometry()
  return {
    position: Vector3.create(origin.x, floorTop + cameraHeight(), origin.z + (HUD_TILES * tile) / 2),
    rotation: Quaternion.fromEulerDegrees(90, 0, 0)
  }
}

/**
 * Where a world point shows on screen, as percentages of the screen (left, top), or null if it is behind the camera.
 * Used by the overlay to put its buttons over the cubes.
 */
export function toScreen(p: Vector3): { left: number; top: number } | null {
  if (!camera) return null
  const cam = Transform.get(camera).position
  const depth = cam.y - p.y
  if (depth <= 0.01) return null
  const tanV = Math.tan(((FOV / 2) * Math.PI) / 180)
  const nx = (p.x - cam.x) / depth / (tanV * screenAspect())
  const ny = (p.z - cam.z) / depth / tanV // north (+z) is up on screen
  return { left: ((nx + 1) / 2) * 100, top: ((1 - ny) / 2) * 100 }
}

/** How big one tile looks on screen, as a share of the screen height (for sizing the overlay). */
export function tileScreenHeight(): number {
  if (!camera) return 0
  const { floorTop, blockSize, tile } = levelGeometry()
  const depth = Transform.get(camera).position.y - (floorTop + blockSize / 2)
  const tanV = Math.tan(((FOV / 2) * Math.PI) / 180)
  return (tile / depth / tanV / 2) * 100
}

/** The ways cube `i` can be pushed right now: the player can reach the opposite face and the cube would move. */
export function legalDirs(i: number): Dir[] {
  const view = playView()
  if (!view || view.busy || !view.state.blocks[i]) return []
  const { level, state } = view
  const reach = reachable(state, topDownView.player).set
  const b = state.blocks[i]
  return DIRS.filter((d) => {
    const from: Pt = { x: b.x - DIR_DELTA[d].x, y: b.y - DIR_DELTA[d].y }
    if (from.x < 0 || from.y < 0 || from.x >= level.width || from.y >= level.height) return false
    return reach.has(from.y * level.width + from.x) && push(state, i, d).moved
  })
}

/** Tap on a cube: select it (or let go of it if it was already selected). */
export function tapBlock(i: number) {
  topDownUi.selected = topDownUi.selected === i ? -1 : i
}

/** Tap on an arrow: push the selected cube that way and let go of it. The player ends up where the cube was. */
export function tapArrow(dir: Dir) {
  const view = playView()
  const i = topDownUi.selected
  if (!view || i < 0 || !legalDirs(i).includes(dir)) return
  const was = { ...view.state.blocks[i] }
  if (!pushFromTopDown(i, dir)) return
  topDownView.player = was
  topDownUi.selected = -1 // each push is select + arrow: tap the cube again for the next one
}

function topDownSystem() {
  if (!topDownView.on) return
  const view = playView()
  if (session.inLobby || !view) {
    exitTopDown()
    return
  }
  // a new level (next, restart, or a fall that reset this one): the player is back at the start
  if (levelGen !== seenGen) {
    seenGen = levelGen
    topDownView.player = view.level.start
    topDownUi.selected = -1
    topDownUi.blockedExitShown = false
    doorDone = false
  }
  if (topDownUi.selected >= view.blocks.length) topDownUi.selected = -1 // the cube was used up filling a pit
  // the camera follows the level size and the screen shape (a phone turned round)
  if (camera) {
    const want = placeCamera()
    const t = Transform.getMutable(camera)
    if (Math.abs(t.position.y - want.position.y) > 0.01 || Math.abs(t.position.z - want.position.z) > 0.01) t.position = want.position
  }
  // the hidden avatar stays frozen (the push emote clears the input modifier when it ends)
  if (!InputModifier.has(engine.PlayerEntity)) freeze(true)

  // every plate covered in a level with a door: once the door is open, walk the hidden player out if they can get there
  if (session.unlocked && !session.solved && view.door >= 1 && !doorDone) {
    doorDone = true
    if (canReachExit(view.state, topDownView.player)) completeFromTopDown()
    else if (!topDownUi.blockedExitShown) {
      topDownUi.blockedExitShown = true
      session.toastText = 'The way to the exit is blocked. Restart the level.'
      session.toastUntil = Date.now() + 5000
    }
  }
}

export function setupTopDown() {
  engine.addSystem(topDownSystem, 4, 'sm-top-down')
}
