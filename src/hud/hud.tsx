import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { copyLevelCode, hasNextLevel, loadLevel, nextLevel, restartLevel, returnToLobby, showHint, toggleCode, toggleMenu } from '../game/world'
import { LEVELS } from '../game/levels'
import { music, setMusicVolume, setSfxVolume, sfx, soundPanel, toggleMusicMute, toggleMute } from '../game/sfx'
import { openEditor } from '../game/editor'
import { closeMyLevels, deleteMyLevel, loadMyLevel, myLevels, openMyLevels } from '../game/levelStore'
import { EDITOR_ENABLED, editor, elapsedMs, isUnlocked, progress, session } from '../game/session'
import { starsFor } from '../game/score'
import { EditorUI, editorAvailable } from './editorPanel'
import { Color4 } from '@dcl/sdk/math'
import { Card, FS, INK, OutlineLabel, PAL, PillButton, S, btnState, hover, isHovered, popFactor, popPress, press } from './theme'
import { BTN, Digits, FramedSprite, Img, NineBg, REV, Sparkles, TILE, sizeOf } from './sprites'
import { UiTextureWarmer } from './textureWarmer'
import { TopDownOverlay } from './topDownOverlay'
import { toggleTopDown, topDownView } from '../game/topDown'

const hexBad = Color4.create(1, 0.54, 0.48, 1)

const COMPLETE_DELAY_MS = 700 // let the plate glow land before the panel covers the screen

function fmtTime(ms: number): string {
  const t = Math.floor(ms / 100)
  const s = Math.floor(t / 10)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${t % 10}`
}

/** Whole-image HUD background: picks the exported slab closest in shape (no nine-slice, so no seams). */
const HudSlab = (props: { w: number; h: number }) => {
  const aspect = props.w / props.h
  const file = aspect < 1.95 ? 'hud/hud_stat_s.png' : aspect < 3.1 ? 'hud/hud_stat_m.png' : 'hud/hud_stat_l.png'
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: props.w, height: props.h, pointerFilter: 'none' }}>
      <FramedSprite file={file} geo={BTN} w={props.w} h={props.h} />
    </UiEntity>
  )
}

/**
 * HUD slab (hud/hud_stat_*.png). The caption is a baked sprite (MOVES / TIME / LEVEL n) or outlined text; the value is
 * drawn with the digit sprites when it is a number or a time, otherwise with outlined text (level names).
 */
const StatPill = (props: { caption: string; captionFile?: string; captionNum?: string; value: string; digits?: boolean; gap?: number; width: number; id?: string }) => {
  const k = props.id ? popFactor(props.id) : 1
  const h = S(56)
  const capH = Math.round(h * 0.3)
  const valH = Math.round(h * 0.56)
  return (
    <UiEntity
      uiTransform={{
        width: Math.round(props.width * k),
        height: h,
        margin: { left: S(6), right: S(6) },
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerFilter: 'none'
      }}
    >
      <HudSlab w={Math.round(props.width * k)} h={h} />
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', height: capH, margin: { top: -Math.round(h * 0.06) }, pointerFilter: 'none' }}>
        {props.captionFile ? (
          <Img file={props.captionFile} h={capH} />
        ) : (
          <OutlineLabel value={props.caption} fontSize={FS(12)} color={PAL.dim} width={props.width - S(12)} height={capH} />
        )}
        {props.captionNum ? <Digits text={props.captionNum} h={Math.round(capH * 0.95)} /> : null}
      </UiEntity>
      {props.digits ? (
        <Digits text={props.value} h={valH} gap={props.gap} margin={{ top: -Math.round(h * 0.04) }} />
      ) : (
        <OutlineLabel value={props.value} fontSize={FS(22)} color={PAL.text} width={props.width - S(16)} height={valH} />
      )}
    </UiEntity>
  )
}

/** Points over all official levels: the sum of each level's best (the leaderboard total, kept locally so it updates the
 * moment a level is finished, before the server answers). */
const totalPoints = () => progress.reduce((sum, p) => sum + p.bestScore, 0)
/** Thousands split by a thin gap, since the digit sprites have no comma: 12340 -> "12 340". */
const spacedDigits = (n: number) => `${n}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

let lastMoves = 0
let lastPoints = -1
const TopBar = () => {
  if (session.moves !== lastMoves) {
    lastMoves = session.moves
    popPress('moves')
  }
  const points = totalPoints()
  if (points !== lastPoints) {
    if (lastPoints >= 0) popPress('points')
    lastPoints = points
  }
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: S(10), left: 0 },
        width: '100%',
        height: S(60),
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        pointerFilter: 'none'
      }}
    >
      <StatPill id="moves" caption="MOVES" captionFile="hud/label_moves.png" value={`${session.moves}`} digits width={S(100)} />
      {session.levelIndex < 0 ? (
        <StatPill caption="CUSTOM LEVEL" value={session.name} width={S(220)} />
      ) : (
        <StatPill caption="LEVEL" captionFile="hud/label_level.png" captionNum={` ${session.levelIndex + 1}`} value={session.name} width={S(220)} />
      )}
      <StatPill caption="TIME" captionFile="hud/label_time.png" value={fmtTime(elapsedMs())} digits width={S(120)} />
      <StatPill id="points" caption="POINTS" value={spacedDigits(points)} digits gap={0.06} width={S(130)} />
    </UiEntity>
  )
}

// Everything but the Options button is tucked away until it is tapped, so the corner stays clear of the phone's
// native controls (joystick, jump) and the 3D view.
export const options = { open: false }
const act = (fn: () => void) => () => {
  options.open = false
  fn()
}

const VOLUME_STEPS = [0, 25, 50, 75, 100]

/** One row of the sound panel: a title with its mute button, then the volume steps. */
const VolumeSection = (props: { id: string; title: string; width: number; volume: number; muted: boolean; onVolume: (v: number) => void; onMute: () => void }) => {
  const muted = props.muted || props.volume <= 0
  const pct = props.volume * 100
  const active = VOLUME_STEPS.reduce((best, v) => (Math.abs(v - pct) < Math.abs(best - pct) ? v : best))
  const gap = S(8)
  const stepW = Math.round((props.width - gap * (VOLUME_STEPS.length - 1)) / VOLUME_STEPS.length)
  return (
    <UiEntity uiTransform={{ width: props.width, flexDirection: 'column', margin: { top: S(14) }, pointerFilter: 'none' }}>
      <UiEntity uiTransform={{ width: '100%', height: S(42), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', pointerFilter: 'none' }}>
        <OutlineLabel value={props.title} fontSize={FS(22)} color={PAL.text} width={S(180)} height={S(30)} />
        <PillButton id={`${props.id}-mute`} label={muted ? 'Unmute' : 'Mute'} width={S(120)} height={S(38)} danger={muted} onClick={props.onMute} />
      </UiEntity>
      <UiEntity uiTransform={{ width: '100%', height: S(46), flexDirection: 'row', margin: { top: S(6) }, pointerFilter: 'none' }}>
        {VOLUME_STEPS.map((v, i) => (
          <PillButton
            id={`${props.id}-${v}`}
            label={`${v}%`}
            width={stepW}
            height={S(42)}
            accent={!muted && v === active}
            onClick={() => props.onVolume(v / 100)}
            margin={{ left: i === 0 ? 0 : gap }}
          />
        ))}
      </UiEntity>
    </UiEntity>
  )
}

const SoundPanel = () => {
  const w = S(520)
  const h = S(380)
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', pointerFilter: 'none' }}
    >
      <Card width={w} height={h} dir="column" align="center" block>
        <OutlineLabel value="Sound" fontSize={FS(28)} color={PAL.amber} width="100%" height={S(40)} />
        <VolumeSection id="music" title="Music" width={w - S(48)} volume={music.volume} muted={music.muted} onVolume={setMusicVolume} onMute={toggleMusicMute} />
        <VolumeSection id="sfx" title="Effects" width={w - S(48)} volume={sfx.volume} muted={sfx.muted} onVolume={setSfxVolume} onMute={toggleMute} />
        <PillButton id="close-sound" danger label="Close" width={S(140)} height={S(44)} margin={{ top: S(16) }} onClick={() => (soundPanel.open = false)} />
      </Card>
    </UiEntity>
  )
}

// `image`: a whole-button picture made outside the sprite kit (no frame margins, one state), e.g. the Sounds button.
type MenuEntry = { id: string; file?: string; icon?: string; image?: { file: string; all: string[] }; label: string; onClick: () => void }

/** One row of the Options menu: a baked sprite (icon + label) or, for entries without one, a blank pill + icon + text. */
const MenuItem = (props: { item: MenuEntry; w: number; h: number; margin?: { bottom?: number }; key?: string }) => {
  const { item } = props
  const state = btnState(item.id)
  const st = state === 'disabled' ? 'normal' : state
  const events = {
    onMouseDown: () => {
      press(item.id)
      item.onClick()
    },
    ...hover(item.id)
  }
  if (item.image) {
    // its outline starts at the image's edge, so the image spans the item's width; it has no hover / pressed frames, so a
    // press nudges it down instead. Every variant stays mounted (only the current one opaque) so a swap never flashes.
    const [iw, ih] = sizeOf(item.image.file)
    const h = Math.round((props.w * ih) / iw)
    const dy = st === 'pressed' ? Math.round(props.h * 0.06) : 0
    return (
      <UiEntity uiTransform={{ width: props.w, height: props.h, margin: props.margin, pointerFilter: 'block' }} {...events}>
        {item.image.all.map((f) => (
          <UiEntity
            key={f}
            uiTransform={{ positionType: 'absolute', position: { top: dy, left: 0 }, width: props.w, height: h, pointerFilter: 'none' }}
            uiBackground={{ texture: { src: REV + f }, textureMode: 'stretch', color: f === item.image!.file ? Color4.White() : Color4.create(1, 1, 1, 0) }}
          />
        ))}
      </UiEntity>
    )
  }
  if (item.file) {
    const states = ['normal', 'hover', 'pressed'].map((s) => `${item.file}_${s}.png`)
    return <FramedSprite file={`${item.file}_${st}.png`} states={states} geo={BTN} w={props.w} h={props.h} margin={props.margin} block {...events} />
  }
  const u = props.h / 63
  return (
    <UiEntity uiTransform={{ width: props.w, height: props.h, margin: props.margin, pointerFilter: 'block' }} {...events}>
      <NineBg file={`menu/menuitem_default_${st}.png`} geo={BTN} l={38} r={38} t={0} b={0} u={u} />
      <UiEntity
        uiTransform={{ width: '100%', height: props.h, position: { top: st === 'pressed' ? Math.round(4 * u) : -Math.round(u) }, flexDirection: 'row', alignItems: 'center', padding: { left: Math.round(64 * u) }, pointerFilter: 'none' }}
      >
        {item.icon ? (
          // in the icon slot the baked items use, left of the label
          <UiEntity
            uiTransform={{ positionType: 'absolute', position: { left: Math.round(22 * u) }, width: Math.round(30 * u), height: Math.round(30 * u), pointerFilter: 'none' }}
            uiBackground={{ texture: { src: item.icon }, textureMode: 'stretch' }}
          />
        ) : null}
        <OutlineLabel value={item.label} fontSize={Math.round(props.h * 0.42)} align="middle-left" width="100%" height={props.h} />
      </UiEntity>
    </UiEntity>
  )
}

const SideButtons = () => {
  const h = S(42)
  const m = { bottom: S(8) }
  const itemW = S(170)
  const itemH = Math.round((itemW * 63) / 280)
  const gap = S(9)
  // No Close entry (tapping Options again closes it) and no Editor entry (on hold for now).
  const items: MenuEntry[] = [
    { id: 'menu', file: 'menu_labeled/menu_levels', label: 'Levels', onClick: act(toggleMenu) }
  ]
  if (!session.inLobby) items.push({ id: 'lobby', file: 'menu_labeled/menu_lobby', label: 'Lobby', onClick: act(returnToLobby) })
  if (!session.inLobby && !session.unlocked) items.push({ id: 'hint', file: 'menu_labeled/menu_hint', label: 'Hint', onClick: act(showHint) })
  if (!session.inLobby) items.push({ id: 'restart', file: 'menu_labeled/menu_restart', label: 'Restart', onClick: act(restartLevel) })
  if (!session.inLobby) items.push({ id: 'code', file: 'menu_labeled/menu_level_code', label: 'Level code', onClick: act(toggleCode) })
  if (!session.inLobby) items.push({ id: 'topdown', file: topDownView.on ? 'menu_labeled/menu_3d_view' : 'menu_labeled/menu_top_down_view', label: topDownView.on ? '3D view' : 'Top-down view', onClick: act(toggleTopDown) })
  // the sound controls live in the menu (a round button beside Options overlapped the top bar on phones)
  items.push({ id: 'sound', file: sfx.muted ? 'menu_labeled/menu_sounds_off' : 'menu_labeled/menu_sounds_on', label: 'Sounds', onClick: act(() => (soundPanel.open = !soundPanel.open)) })
  const pad = S(12)
  const panelW = itemW + pad * 2
  const panelH = pad * 2 + items.length * itemH + (items.length - 1) * gap + S(4)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        // Options is centred on the top bar's row (the bar is S(60) tall at S(10) from the top)
        position: { top: S(10) + Math.round((S(60) - h) / 2), right: S(12) },
        flexDirection: 'column',
        alignItems: 'flex-end',
        pointerFilter: 'none'
      }}
    >
      {EDITOR_ENABLED && editorAvailable() && !session.inLobby && session.levelIndex < 0 ? (
        <PillButton id="back-to-editor" label="Back to editor" width={S(190)} height={h} accent onClick={act(openEditor)} margin={m} />
      ) : null}
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', pointerFilter: 'none' }}>
        <PillButton
          id="options"
          label="Options"
          sprite={options.open ? 'buttons_labeled/btn_options_open' : 'buttons_labeled/btn_options'}
          width={S(150)}
          height={h}
          accent
          onClick={() => (options.open = !options.open)}
          margin={m}
        />
      </UiEntity>
      {options.open ? (
        <UiEntity uiTransform={{ width: panelW, height: panelH, margin: { top: S(6) }, pointerFilter: 'none' }}>
          <Card width={panelW} height={panelH} pad={pad} justify="flex-start" block>
            {items.map((it, i) => (
              <MenuItem key={it.id} item={it} w={itemW} h={itemH} margin={{ bottom: i === items.length - 1 ? 0 : gap }} />
            ))}
          </Card>
          <Sparkles width={panelW} size={S(26)} />
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

// The code is shown in full, in a monospace font, split into lines we choose so it never wraps mid-token.
function chunk(text: string, perLine: number): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += perLine) out.push(text.slice(i, i + perLine))
  return out
}

const CodePanel = () => {
  const width = S(760)
  const font = FS(24)
  const charW = font * 0.62 // monospace advance, with a little slack
  const perLine = Math.max(10, Math.floor((width - S(60)) / charW))
  const lines = chunk(session.code, perLine)
  const codeH = lines.length * Math.round(font * 1.35)
  const copied = Date.now() - session.copiedAt < 1500
  const height = S(190) + codeH
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: '50%', left: '50%' },
        margin: { top: -Math.round(height / 2), left: -Math.round(width / 2) },
        width,
        height,
        pointerFilter: 'none'
      }}
    >
      <Card width="100%" height="100%" pad={S(18)} block>
        <OutlineLabel value="LEVEL CODE" fontSize={FS(26)} color={PAL.amber} width="100%" height={S(36)} />
        <Label
          value="Copy this and send it to review or tweak the level"
          fontSize={FS(16)}
          font="sans-serif"
          color={PAL.dim}
          textAlign="middle-center"
          uiTransform={{ width: '100%', height: S(26) }}
        />
        <UiEntity
          uiTransform={{
            width: '100%',
            height: codeH + S(20),
            margin: { top: S(8), bottom: S(10) },
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: S(10),
            pointerFilter: 'none'
          }}
          uiBackground={{ color: PAL.outline }}
        >
          <Label
            value={lines.join('\n')}
            fontSize={font}
            font="monospace"
            color={PAL.good}
            textAlign="middle-center"
            uiTransform={{ width: '100%', height: codeH }}
          />
        </UiEntity>
        <UiEntity uiTransform={{ flexDirection: 'row', height: S(50), pointerFilter: 'none' }}>
          <PillButton
            id="copy"
            label={copied ? 'Copied!' : 'Copy code'}
            width={S(180)}
            height={S(46)}
            accent
            onClick={copyLevelCode}
            margin={{ right: S(12) }}
          />
          <PillButton id="close-code" danger label="Close" width={S(140)} height={S(46)} onClick={toggleCode} />
        </UiEntity>
      </Card>
    </UiEntity>
  )
}

const CompletePanel = () => {
  const width = S(640)
  const height = S(300) + (session.levelIndex >= 0 && session.runScore > 0 ? S(48) : 0)
  const custom = session.levelIndex < 0
  const best = custom ? null : progress[session.levelIndex]
  const newBest = !best || session.moves === best.bestMoves
  const scored = !custom && session.runScore > 0
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: '50%', left: '50%' },
        margin: { top: -Math.round(height / 2), left: -Math.round(width / 2) },
        width,
        height,
        pointerFilter: 'none'
      }}
    >
      <Card width="100%" height="100%" pad={S(20)} rim={PAL.good} block>
        <OutlineLabel value="LEVEL COMPLETE!" fontSize={FS(34)} color={PAL.good} width="100%" height={S(48)} />
        <Label
          value={`Moves  <b>${session.moves}</b>${best && !newBest ? `   (best ${best.bestMoves})` : ''}`}
          fontSize={FS(22)}
          font="sans-serif"
          color={PAL.text}
          textAlign="middle-center"
          uiTransform={{ width: '100%', height: S(34), margin: { top: S(10) } }}
        />
        <Label
          value={`Time  <b>${fmtTime(session.finishedAt - session.startedAt)}</b>${best ? `   (best ${fmtTime(best.bestTimeMs)})` : ''}`}
          fontSize={FS(22)}
          font="sans-serif"
          color={PAL.text}
          textAlign="middle-center"
          uiTransform={{ width: '100%', height: S(34), margin: { bottom: scored ? S(4) : S(18) } }}
        />
        {scored ? (
          <OutlineLabel
            value={`+${fmtPts(session.runScore)} pts${session.runNewBest ? '   New best!' : ''}`}
            fontSize={FS(24)}
            color={PAL.amber}
            width="100%"
            height={S(36)}
          />
        ) : null}
        {scored ? <UiEntity uiTransform={{ height: S(12), pointerFilter: 'none' }} /> : null}
        <UiEntity uiTransform={{ flexDirection: 'row', height: S(50), pointerFilter: 'none' }}>
          {custom ? (
            <PillButton id="back-edit" label="Back to editor" width={S(200)} height={S(46)} accent onClick={openEditor} margin={{ right: S(12) }} />
          ) : null}
          {hasNextLevel() ? (
            <PillButton id="next" label="Next level" width={S(190)} height={S(46)} accent onClick={nextLevel} margin={{ right: S(12) }} />
          ) : null}
          <PillButton id="again" label="Play again" width={S(170)} height={S(46)} accent={!hasNextLevel() && !custom} onClick={restartLevel} margin={{ right: S(12) }} />
          <PillButton id="lobby2" label="Lobby" width={S(120)} height={S(46)} onClick={returnToLobby} />
        </UiEntity>
      </Card>
    </UiEntity>
  )
}

const MyLevelRow = (props: { id: string; name: string; key?: string }) => (
  <UiEntity uiTransform={{ width: '100%', height: S(50), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', margin: { bottom: S(6) }, pointerFilter: 'none' }}>
    <Label value={props.name} fontSize={FS(20)} font="sans-serif" color={PAL.text} textAlign="middle-left" uiTransform={{ width: S(300), height: S(40) }} />
    <UiEntity uiTransform={{ flexDirection: 'row', pointerFilter: 'none' }}>
      <PillButton id={`load-${props.id}`} label="Edit" width={S(90)} height={S(42)} accent onClick={() => loadMyLevel(props.id)} margin={{ right: S(8) }} />
      <PillButton id={`del-${props.id}`} label="Delete" width={S(100)} height={S(42)} onClick={() => deleteMyLevel(props.id)} />
    </UiEntity>
  </UiEntity>
)

const MyLevelsPanel = () => {
  const width = S(560)
  const rows = Math.max(1, myLevels.list.length)
  const height = S(200) + rows * S(56)
  const waiting = myLevels.waitingSince > 0
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: '50%', left: '50%' },
        margin: { top: -Math.round(height / 2), left: -Math.round(width / 2) },
        width,
        height,
        pointerFilter: 'none'
      }}
    >
      <Card width="100%" height="100%" pad={S(18)} block justify="flex-start">
        <OutlineLabel value="MY LEVELS" fontSize={FS(26)} color={PAL.amber} width="100%" height={S(40)} />
        <Label
          value={waiting ? 'Talking to the server...' : myLevels.message || (myLevels.list.length ? 'Pick a level to keep editing.' : 'No saved levels yet. Build one in the editor and press Save.')}
          fontSize={FS(15)}
          font="sans-serif"
          color={myLevels.message ? hexBad : PAL.dim}
          textAlign="middle-center"
          textWrap="wrap"
          uiTransform={{ width: '100%', height: S(40), margin: { bottom: S(8) } }}
        />
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', pointerFilter: 'none' }}>
          {myLevels.list.map((l) => (
            <MyLevelRow key={`m${l.id}`} id={l.id} name={l.name} />
          ))}
        </UiEntity>
        <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(8) }, pointerFilter: 'none' }}>
          <PillButton id="mine-refresh" label="Refresh" width={S(140)} height={S(44)} onClick={openMyLevels} margin={{ right: S(10) }} />
          <PillButton id="mine-close" danger label="Close" width={S(140)} height={S(44)} onClick={closeMyLevels} />
        </UiEntity>
      </Card>
    </UiEntity>
  )
}

const COLS = 5

/** Level tile: blue (open), amber (the level you are on) or locked, with hover / pressed frames. */
const LevelTile = (props: { index: number; key?: string }) => {
  const i = props.index
  const id = `lv${i}`
  const open = isUnlocked(i)
  const pr = progress[i]
  const current = i === session.levelIndex
  const k = popFactor(id, 0.08)
  const size = Math.round(S(58) * k)
  const state = open ? btnState(id) : 'normal'
  const base = current ? 'level_tiles/tile_current_bg' : 'level_tiles/tile_bg'
  const file = !open ? 'level_tiles/tile_locked.png' : state === 'normal' ? `${base}.png` : `${base}_${state}.png`
  const sub = current ? (
    <Img file="level_tiles/tag_play.png" h={Math.round(size * 0.24)} />
  ) : pr.done ? (
    // stars for the best score (an older record with no score yet still shows as done, with one star)
    <Img
      file={`level_tiles/stars_${Math.max(1, starsFor(i, pr.bestScore))}.png`}
      h={Math.round(size * 0.2)}
      margin={{ top: Math.round(size * 0.02) }}
    />
  ) : (
    <Img file="level_tiles/tag_new.png" h={Math.round(size * 0.24)} />
  )
  return (
    <FramedSprite
      file={file}
      states={open ? [`${base}.png`, `${base}_hover.png`, `${base}_pressed.png`] : undefined}
      geo={TILE}
      w={size}
      h={size}
      margin={{ left: S(4), right: S(4), top: S(4), bottom: S(6) }}
      dy={state === 'pressed' ? Math.round((3 * size) / 96) : 0}
      block
      onMouseDown={() => {
        if (!open) return
        press(id)
        popPress(id)
        loadLevel(i)
      }}
      {...hover(id)}
    >
      {open ? <Digits text={`${i + 1}`} h={Math.round(size * 0.52)} margin={{ top: Math.round(size * 0.02), bottom: -Math.round(size * 0.06) }} /> : null}
      {open ? sub : null}
    </FramedSprite>
  )
}

// ---- Points ----
/** 12345 -> "12,345" (toLocaleString is not reliable in the scene runtime). */
const fmtPts = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

// Dragging a list on a touch screen starts on top of a tile, which swallows the gesture, so the menu is paged with
// Prev / Next buttons instead of scrolling.
const ROWS = 3
const PER_PAGE = COLS * ROWS
let menuPage = 0

const LevelMenu = () => {
  const tile = S(58) + S(8)
  const vtile = S(58) + S(10)
  const pages = Math.max(1, Math.ceil(LEVELS.length / PER_PAGE))
  menuPage = Math.max(0, Math.min(menuPage, pages - 1))
  const first = menuPage * PER_PAGE
  const shown = LEVELS.slice(first, first + PER_PAGE)
  const width = COLS * tile + S(48)
  const listH = ROWS * vtile + S(4)
  const height = S(196) + listH
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: '50%', left: '50%' },
        margin: { top: -Math.round(height / 2), left: -Math.round(width / 2) },
        width,
        height,
        pointerFilter: 'none'
      }}
    >
      <Card width="100%" height="100%" pad={S(14)} block>
        <Img file="text/title_select_level.png" h={S(34)} margin={{ bottom: S(4) }} />
        <UiEntity
          uiTransform={{
            width: COLS * tile + S(16),
            height: listH,
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignContent: 'flex-start',
            margin: { top: S(4), bottom: S(6) },
            pointerFilter: 'none'
          }}
        >
          {shown.map((_, n) => (
            <LevelTile key={`t${first + n}`} index={first + n} />
          ))}
        </UiEntity>
        {pages > 1 ? (
          <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { bottom: S(6) }, pointerFilter: 'none' }}>
            <PillButton id="pg-prev" label="< Prev" width={S(100)} height={S(38)} disabled={menuPage === 0} onClick={() => (menuPage = Math.max(0, menuPage - 1))} />
            <UiEntity uiTransform={{ width: S(80), height: S(38), justifyContent: 'center', alignItems: 'center', pointerFilter: 'none' }}>
              <Digits text={`${menuPage + 1}/${pages}`} h={S(34)} />
            </UiEntity>
            <PillButton id="pg-next" label="Next >" width={S(100)} height={S(38)} disabled={menuPage >= pages - 1} onClick={() => (menuPage = Math.min(pages - 1, menuPage + 1))} />
          </UiEntity>
        ) : null}
        <UiEntity uiTransform={{ flexDirection: 'row', pointerFilter: 'none' }}>
          {EDITOR_ENABLED && editorAvailable() ? <PillButton id="menu-mine" label="My levels" width={S(140)} height={S(40)} accent onClick={openMyLevels} margin={{ right: S(10) }} /> : null}
          <PillButton id="close-menu" label="Close" danger width={S(110)} height={S(40)} onClick={toggleMenu} />
        </UiEntity>
      </Card>
      <Sparkles width={width} size={S(30)} />
    </UiEntity>
  )
}

const HintBanner = () => (
  <UiEntity uiTransform={{ positionType: 'absolute', position: { top: S(140), left: 0 }, width: '100%', height: S(56), justifyContent: 'center', alignItems: 'center', pointerFilter: 'none' }}>
    <Card width={S(640)} height={S(52)} rim={PAL.amber}>
      <OutlineLabel value={session.hintText} fontSize={FS(18)} color={PAL.text} width="100%" height={S(30)} />
    </Card>
  </UiEntity>
)

// ---- Notices ----
// Status messages (exit unlocked, level result) are drawn as a flat, see-through strip with a thin rim and no bevel or
// drop shadow, so they read as a notification and not as a button: playtesters kept tapping the old green pill.
const NOTICE_IN_MS = 220
const noticeSeen: Record<string, { first: number; last: number }> = {}
/** 0 -> 1 over NOTICE_IN_MS from the frame a notice first shows (restarts if it was gone for a moment). */
const noticeIn = (id: string) => {
  const now = Date.now()
  const seen = noticeSeen[id]
  if (!seen || now - seen.last > 250) noticeSeen[id] = { first: now, last: now }
  else seen.last = now
  return Math.min(1, (now - noticeSeen[id].first) / NOTICE_IN_MS)
}
const NOTICE_BG = Color4.create(INK.r, INK.g, INK.b, 0.78)

const Notice = (props: { id: string; text: string; icon?: string; rim: Color4; width: number }) => {
  const h = S(46)
  const k = noticeIn(props.id)
  const ease = 1 - (1 - k) * (1 - k)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: S(84) - Math.round((1 - ease) * S(24)), left: 0 },
        width: '100%',
        height: h,
        justifyContent: 'center',
        alignItems: 'center',
        opacity: ease,
        pointerFilter: 'none'
      }}
    >
      <UiEntity
        uiTransform={{
          width: props.width,
          height: h,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          padding: { left: S(16), right: S(16) },
          borderRadius: S(10),
          borderWidth: Math.max(2, S(2)),
          borderColor: props.rim,
          pointerFilter: 'none'
        }}
        uiBackground={{ color: NOTICE_BG }}
      >
        {props.icon ? <Img file={props.icon} h={Math.round(h * 0.56)} margin={{ right: S(10) }} /> : null}
        <Label
          value={props.text}
          fontSize={FS(18)}
          font="sans-serif"
          color={PAL.text}
          textAlign="middle-center"
          uiTransform={{ height: h, pointerFilter: 'none' }}
        />
      </UiEntity>
    </UiEntity>
  )
}

const ToastBanner = () => <Notice id="toast" text={session.toastText} rim={PAL.good} width={S(560)} />

/** Shown between covering the last plate and walking through the exit door. */
const ExitBanner = () => (
  <Notice id="exit" text="Exit unlocked! Head for the door" icon="icons/icon_door.png" rim={PAL.good} width={S(400)} />
)

export const Hud = () => {
  const showComplete = session.solved && Date.now() - session.completedAt > COMPLETE_DELAY_MS
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', pointerFilter: 'none' }}>
      <UiTextureWarmer />
      {/* The level select covers the play HUD: the top bar and its banners hide while it is open. */}
      {!session.inLobby && !session.menuOpen && <TopBar />}
      <TopDownOverlay />
      {session.unlocked && session.hasDoor && !session.solved && !editor.open && !session.menuOpen && !topDownView.on && <ExitBanner />}
      {Date.now() < session.toastUntil && !editor.open && !session.menuOpen && <ToastBanner />}
      {!editor.open && <SideButtons />}
      {session.codeOpen && <CodePanel />}
      {soundPanel.open && <SoundPanel />}
      {session.menuOpen && <LevelMenu />}
      {Date.now() < session.hintUntil && !session.inLobby && !session.menuOpen && <HintBanner />}
      {editor.open && <EditorUI />}
      {myLevels.panelOpen && <MyLevelsPanel />}
      {showComplete && !session.advancing && !editor.open && !session.codeOpen && !session.menuOpen && <CompletePanel />}
    </UiEntity>
  )
}
