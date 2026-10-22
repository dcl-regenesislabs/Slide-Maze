import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { copyLevelCode, hasNextLevel, loadLevel, nextLevel, restartLevel, returnToLobby, showHint, toggleCode, toggleMenu } from '../game/world'
import { LEVELS } from '../game/levels'
import { openEditor } from '../game/editor'
import { closeMyLevels, deleteMyLevel, loadMyLevel, myLevels, openMyLevels } from '../game/levelStore'
import { EDITOR_ENABLED, editor, elapsedMs, isUnlocked, progress, session } from '../game/session'
import { EditorUI, editorAvailable } from './editorPanel'
import { Color4 } from '@dcl/sdk/math'
import { Card, FS, OutlineLabel, PAL, PillButton, S, hover, isHovered, popFactor, popPress } from './theme'

const hexBad = Color4.create(1, 0.54, 0.48, 1)

const COMPLETE_DELAY_MS = 700 // let the plate glow land before the panel covers the screen

function fmtTime(ms: number): string {
  const t = Math.floor(ms / 100)
  const s = Math.floor(t / 10)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${t % 10}`
}

const StatPill = (props: { caption: string; value: string; width: number; id?: string }) => {
  const k = props.id ? popFactor(props.id) : 1
  return (
    <Card width={Math.round(props.width * k)} height={S(56)} margin={{ left: S(4), right: S(4) }}>
      <Label
        value={props.caption}
        fontSize={FS(12)}
        font="sans-serif"
        color={PAL.dim}
        textAlign="middle-center"
        uiTransform={{ width: '100%', height: S(16) }}
      />
      <Label
        value={props.value}
        fontSize={FS(24)}
        font="sans-serif"
        color={PAL.text}
        textAlign="middle-center"
        uiTransform={{ width: '100%', height: S(30) }}
      />
    </Card>
  )
}

let lastMoves = 0
const TopBar = () => {
  if (session.moves !== lastMoves) {
    lastMoves = session.moves
    popPress('moves')
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
      <StatPill id="moves" caption="MOVES" value={`${session.moves}`} width={S(100)} />
      <StatPill caption={session.levelIndex < 0 ? 'CUSTOM LEVEL' : `LEVEL ${session.levelIndex + 1}`} value={session.name} width={S(220)} />
      <StatPill caption="TIME" value={fmtTime(elapsedMs())} width={S(120)} />
    </UiEntity>
  )
}

// Everything but the Options button is tucked away until it is tapped, so the corner stays clear of the phone's
// native controls (joystick, jump) and the 3D view.
let optionsOpen = false
const act = (fn: () => void) => () => {
  optionsOpen = false
  fn()
}

const SideButtons = () => {
  const w = S(150)
  const h = S(42)
  const m = { bottom: S(6) }
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: S(10), right: S(12) },
        width: w,
        flexDirection: 'column',
        alignItems: 'flex-end',
        pointerFilter: 'none'
      }}
    >
      <PillButton id="options" label={optionsOpen ? 'Close' : 'Options'} width={w} height={h} accent={!optionsOpen} danger={optionsOpen} onClick={() => (optionsOpen = !optionsOpen)} margin={m} />
      {optionsOpen ? <PillButton id="menu" label="Levels" width={w} height={h} onClick={act(toggleMenu)} margin={m} /> : null}
      {optionsOpen && !session.inLobby ? <PillButton id="lobby" label="Lobby" width={w} height={h} onClick={act(returnToLobby)} margin={m} /> : null}
      {optionsOpen && !session.inLobby && !session.unlocked ? <PillButton id="hint" label="Hint" width={w} height={h} onClick={act(showHint)} margin={m} /> : null}
      {optionsOpen && !session.inLobby ? <PillButton id="restart" label="Restart" width={w} height={h} onClick={act(restartLevel)} margin={m} /> : null}
      {optionsOpen && !session.inLobby ? <PillButton id="code" label="Level code" width={w} height={h} onClick={act(toggleCode)} margin={m} /> : null}
      {optionsOpen && EDITOR_ENABLED && editorAvailable() ? <PillButton id="edit" label="Editor" width={w} height={h} onClick={act(openEditor)} margin={m} /> : null}
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
  const height = S(300)
  const custom = session.levelIndex < 0
  const best = custom ? null : progress[session.levelIndex]
  const newBest = !best || session.moves === best.bestMoves
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
          uiTransform={{ width: '100%', height: S(34), margin: { bottom: S(18) } }}
        />
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

const LevelTile = (props: { index: number; key?: string }) => {
  const i = props.index
  const id = `lv${i}`
  const open = isUnlocked(i)
  const pr = progress[i]
  const current = i === session.levelIndex
  const k = popFactor(id, 0.08)
  const size = Math.round(S(58) * k)
  const rim = !open ? PAL.rimDim : pr.done ? PAL.good : current ? PAL.amber : PAL.rim
  const sub = !open ? 'locked' : pr.done ? `${pr.bestMoves} moves` : 'new'
  return (
    <UiEntity
      key={id}
      uiTransform={{ width: size, height: size, margin: S(4), padding: Math.max(2, S(2)), borderRadius: S(10), pointerFilter: 'block' }}
      uiBackground={{ color: open && isHovered(id) ? PAL.amber : rim }}
      onMouseDown={() => {
        if (!open) return
        popPress(id)
        loadLevel(i)
      }}
      {...hover(id)}
    >
      <UiEntity
        uiTransform={{ width: '100%', height: '100%', borderRadius: S(8), flexDirection: 'column', justifyContent: 'center', alignItems: 'center', pointerFilter: 'none' }}
        uiBackground={{ color: open ? PAL.panelHi : PAL.panel }}
      >
        <Label value={`${i + 1}`} fontSize={FS(22)} font="sans-serif" color={open ? PAL.text : PAL.dim} textAlign="middle-center" uiTransform={{ width: '100%', height: S(26) }} />
        <Label value={sub} fontSize={FS(10)} font="sans-serif" color={pr.done ? PAL.good : PAL.dim} textAlign="middle-center" uiTransform={{ width: '100%', height: S(14) }} />
      </UiEntity>
    </UiEntity>
  )
}

// Dragging a list on a touch screen starts on top of a tile, which swallows the gesture, so the menu is paged with
// Prev / Next buttons instead of scrolling.
const ROWS = 3
const PER_PAGE = COLS * ROWS
let menuPage = 0

const LevelMenu = () => {
  const tile = S(58) + S(8)
  const pages = Math.max(1, Math.ceil(LEVELS.length / PER_PAGE))
  menuPage = Math.max(0, Math.min(menuPage, pages - 1))
  const first = menuPage * PER_PAGE
  const shown = LEVELS.slice(first, first + PER_PAGE)
  const width = COLS * tile + S(48)
  const listH = ROWS * tile + S(4)
  const height = S(172) + listH
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
        <OutlineLabel value="SELECT LEVEL" fontSize={FS(22)} color={PAL.amber} width="100%" height={S(34)} />
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
            <PillButton id="pg-prev" label="< Prev" width={S(100)} height={S(38)} onClick={() => (menuPage = Math.max(0, menuPage - 1))} />
            <Label value={`${menuPage + 1} / ${pages}`} fontSize={FS(18)} font="sans-serif" color={PAL.text} textAlign="middle-center" uiTransform={{ width: S(80), height: S(38) }} />
            <PillButton id="pg-next" label="Next >" width={S(100)} height={S(38)} onClick={() => (menuPage = Math.min(pages - 1, menuPage + 1))} />
          </UiEntity>
        ) : null}
        <UiEntity uiTransform={{ flexDirection: 'row', pointerFilter: 'none' }}>
          {EDITOR_ENABLED && editorAvailable() ? <PillButton id="menu-mine" label="My levels" width={S(140)} height={S(40)} accent onClick={openMyLevels} margin={{ right: S(10) }} /> : null}
          <PillButton id="close-menu" label="Close" danger width={S(110)} height={S(40)} onClick={toggleMenu} />
        </UiEntity>
      </Card>
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

const ToastBanner = () => (
  <UiEntity uiTransform={{ positionType: 'absolute', position: { top: S(84), left: 0 }, width: '100%', height: S(56), justifyContent: 'center', alignItems: 'center', pointerFilter: 'none' }}>
    <Card width={S(560)} height={S(52)} rim={PAL.good}>
      <OutlineLabel value={session.toastText} fontSize={FS(20)} color={PAL.good} width="100%" height={S(32)} />
    </Card>
  </UiEntity>
)

/** Shown between covering the last plate and walking through the exit door. */
const ExitBanner = () => (
  <UiEntity uiTransform={{ positionType: 'absolute', position: { top: S(84), left: 0 }, width: '100%', height: S(52), justifyContent: 'center', alignItems: 'center', pointerFilter: 'none' }}>
    <Card width={S(420)} height={S(48)} rim={PAL.good}>
      <OutlineLabel value="Exit unlocked! Head for the door" fontSize={FS(20)} color={PAL.good} width="100%" height={S(32)} />
    </Card>
  </UiEntity>
)

const PlayButton = () => (
  <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: S(40), left: 0 }, width: '100%', height: S(64), justifyContent: 'center', alignItems: 'center', pointerFilter: 'none' }}>
    <PillButton id="play" label="PLAY" width={S(220)} height={S(60)} accent onClick={() => loadLevel(0)} />
  </UiEntity>
)

export const Hud = () => {
  const showComplete = session.solved && Date.now() - session.finishedAt > COMPLETE_DELAY_MS
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', pointerFilter: 'none' }}>
      {!session.inLobby && <TopBar />}
      {session.unlocked && session.hasDoor && !session.solved && !editor.open && <ExitBanner />}
      {Date.now() < session.toastUntil && !session.inLobby && !editor.open && <ToastBanner />}
      {!editor.open && <SideButtons />}
      {session.inLobby && !editor.open && !session.menuOpen && !myLevels.panelOpen && <PlayButton />}
      {session.codeOpen && <CodePanel />}
      {session.menuOpen && <LevelMenu />}
      {Date.now() < session.hintUntil && !session.inLobby && <HintBanner />}
      {editor.open && <EditorUI />}
      {myLevels.panelOpen && <MyLevelsPanel />}
      {showComplete && !session.advancing && !editor.open && !session.codeOpen && !session.menuOpen && <CompletePanel />}
    </UiEntity>
  )
}
