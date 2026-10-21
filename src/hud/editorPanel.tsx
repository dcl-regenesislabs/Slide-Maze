import ReactEcs, { Input, Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { canRedo, canUndo, check, copyEditorCode, cycleMode, exitEditor, flipH, flipV, growEdge, importCode, newBlank, paint, pickTool, playTest, redo, resetBlocks, resize, rotate, togglePanel, undo } from '../game/editor'
import { editor } from '../game/session'
import { showHint } from '../game/world'
import { openMyLevels, saveCurrentLevel } from '../game/levelStore'
import { Card, FS, OutlineLabel, PAL, PillButton, S, hover, isHovered } from './theme'
import { mobile } from './platform'

// Cell colours. They echo the 3D look (ice blue, slate steps, orange blocks) so the grid reads like the level.
const hex = (h: string) => Color4.create(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255, 1)
const TOOLS: { tool: string; name: string; color: Color4 }[] = [
  { tool: '.', name: 'Ice', color: hex('#b8e2f8') },
  { tool: '#', name: 'Step', color: hex('#4d6688') },
  { tool: 'W', name: 'Wall', color: hex('#2b3854') },
  { tool: 'O', name: 'Hole', color: hex('#04070f') },
  { tool: 'F', name: 'Pit', color: hex('#ffb13b') },
  { tool: 'E', name: 'Exit', color: hex('#33e0ff') },
  { tool: 'P', name: 'Plate', color: hex('#f2bf33') },
  { tool: 'S', name: 'Cube', color: hex('#4d5b6b') },
  { tool: 'B', name: 'Block', color: hex('#ff8c26') },
  { tool: '@', name: 'Start', color: hex('#4be08a') },
  { tool: 'N', name: 'Snow', color: hex('#f4fbff') },
  { tool: 'arrow', name: 'Arrow', color: hex('#33e0ff') },
  { tool: 'fan', name: 'Fan', color: hex('#8a9bb0') }
]
const ARROW_CHARS = '^>v<'
const FAN_CHARS = 'urdl'
const colorOf = (ch: string) =>
  ARROW_CHARS.includes(ch) ? hex('#33e0ff') : FAN_CHARS.includes(ch) ? hex('#8a9bb0') : (TOOLS.find((t) => t.tool === ch)?.color ?? PAL.panel)
const glyphOn = (ch: string) => (ch === '.' || ch === 'P' || ch === 'B' || ch === '@' || ch === 'N' || ch === 'F' || ch === 'E' || ARROW_CHARS.includes(ch) ? hex('#0b1830') : PAL.text)
/** What a cell shows: the tile character, with a short label for the ones that are not self-explanatory. */
const FAN_GLYPH: Record<string, string> = { u: 'F^', r: 'F>', d: 'Fv', l: 'F<' }
const cellGlyph = (ch: string) => (ch === 'N' ? '*' : ch === 'F' ? 'o' : (FAN_GLYPH[ch] ?? ch))
const isOn = (tool: string) => (tool === 'arrow' ? ARROW_CHARS.includes(editor.tool) : tool === 'fan' ? FAN_CHARS.includes(editor.tool) : editor.tool === tool)

/** One slot of the hotbar along the bottom of the screen. Selected = amber rim. */
const HotbarSlot = (props: { t: (typeof TOOLS)[number]; n: number; key?: string }) => {
  const { tool, name, color } = props.t
  const on = isOn(tool)
  const id = `tool${tool}`
  const glyph = tool === 'arrow' ? (ARROW_CHARS.includes(editor.tool) ? editor.tool : editor.lastArrow) : tool === 'fan' ? FAN_GLYPH[FAN_CHARS.includes(editor.tool) ? editor.tool : editor.lastFan] : ''
  return (
    <UiEntity
      uiTransform={{ width: S(70), height: S(82), margin: S(3), padding: Math.max(2, S(3)), borderRadius: S(12), pointerFilter: 'block' }}
      uiBackground={{ color: on ? PAL.amber : isHovered(id) ? PAL.rim : PAL.rimDim }}
      onMouseDown={() => pickTool(tool)}
      {...hover(id)}
    >
      <UiEntity
        uiTransform={{ width: '100%', height: '100%', borderRadius: S(9), flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerFilter: 'none' }}
        uiBackground={{ color: on ? PAL.panelHi : PAL.panel }}
      >
        <UiEntity uiTransform={{ width: S(40), height: S(36), borderRadius: S(7), margin: { bottom: S(4) }, justifyContent: 'center', alignItems: 'center', pointerFilter: 'none' }} uiBackground={{ color }}>
          {glyph !== '' && <Label value={glyph} fontSize={FS(16)} font="sans-serif" color={hex('#0b1830')} textAlign="middle-center" uiTransform={{ width: '100%', height: '100%' }} />}
        </UiEntity>
        <Label value={name} fontSize={FS(13)} font="sans-serif" color={on ? PAL.amber : PAL.text} textAlign="middle-center" uiTransform={{ width: '100%', height: S(20) }} />
      </UiEntity>
    </UiEntity>
  )
}

/** The hotbar: every item you can place, along the bottom of the screen, like a build-mode toolbar. */
const Hotbar = () => (
  <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: S(14), left: 0 }, width: '100%', flexDirection: 'column', alignItems: 'center', pointerFilter: 'none' }}>
    <Label
      value="Click: place    F: erase    E / 1: next / previous item    2: turn arrow or fan    3 / 4: undo / redo"
      fontSize={FS(14)}
      font="sans-serif"
      color={PAL.dim}
      textAlign="middle-center"
      uiTransform={{ width: S(900), height: S(24), margin: { bottom: S(2) } }}
    />
    <UiEntity uiTransform={{ flexDirection: 'row', justifyContent: 'center', pointerFilter: 'none' }}>
      {TOOLS.map((t, n) => (
        <HotbarSlot key={`h${t.tool}`} t={t} n={n} />
      ))}
    </UiEntity>
  </UiEntity>
)

/** Slim toolbar at the top left: the actions you use all the time while building. */
const Toolbar = () => {
  const statusColor = editor.statusKind === 'ok' ? PAL.good : editor.statusKind === 'bad' ? hex('#ff8a7a') : PAL.dim
  const b = (id: string, label: string, onClick: () => void, accent = false, w = 74) => (
    <PillButton id={id} label={label} width={S(w)} height={S(38)} accent={accent} onClick={onClick} margin={{ right: S(4), bottom: S(4) }} />
  )
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: S(16), left: S(16) }, width: S(440), flexDirection: 'column', pointerFilter: 'none' }}>
      <Card width="100%" height={S(222)} pad={S(8)} block justify="flex-start" align="flex-start">
        <UiEntity uiTransform={{ flexDirection: 'row', flexWrap: 'wrap', width: '100%', pointerFilter: 'none' }}>
          {b('ed-undo', canUndo() ? 'Undo' : 'Undo -', undo)}
          {b('ed-redo', canRedo() ? 'Redo' : 'Redo -', redo)}
          {b('ed-mode', editor.mode === 'paint' ? 'Paint' : editor.mode === 'fill' ? 'Fill' : editor.anchor ? '2nd corner' : 'Rect', cycleMode, editor.mode !== 'paint', editor.anchor ? 104 : 74)}
          {b('ed-hint', 'Hint', showHint)}
          {b('ed-check', 'Check', check, true)}
          {b('ed-play', 'Play', playTest, true)}
          {b('ed-reset', 'Reset', resetBlocks)}
          {b('ed-tools', editor.panelOpen ? 'Tools <' : 'Tools >', togglePanel)}
          {b('ed-exit', 'Exit', exitEditor)}
        </UiEntity>
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', width: '100%', margin: { bottom: S(2) }, pointerFilter: 'none' }}>
          <Label value={`Size ${editor.rows[0].length} x ${editor.rows.length}`} fontSize={FS(14)} font="sans-serif" color={PAL.text} textAlign="middle-left" uiTransform={{ width: S(110), height: S(34) }} />
          {(['N', 'S', 'W', 'E'] as const).map((e) => (
            <UiEntity key={`g${e}`} uiTransform={{ flexDirection: 'row', margin: { right: S(6) }, pointerFilter: 'none' }}>
              <PillButton id={`grow${e}`} label={`+${e}`} width={S(46)} height={S(32)} accent onClick={() => growEdge(e, 1)} margin={{ right: S(2) }} />
              <PillButton id={`shrink${e}`} label={`-${e}`} width={S(40)} height={S(32)} onClick={() => growEdge(e, -1)} />
            </UiEntity>
          ))}
        </UiEntity>
        <Label value={editor.status} fontSize={FS(14)} font="sans-serif" color={statusColor} textAlign="middle-left" textWrap="wrap" uiTransform={{ width: '100%', height: S(46) }} />
      </Card>
    </UiEntity>
  )
}

const Cell = (props: { x: number; y: number; size: number; key?: string }) => {
  const ch = editor.rows[props.y][props.x]
  const id = `cell${props.x}_${props.y}`
  const hov = isHovered(id)
  return (
    <UiEntity
      uiTransform={{ width: props.size, height: props.size, margin: 1, borderRadius: Math.max(2, Math.round(props.size * 0.12)), justifyContent: 'center', alignItems: 'center', borderWidth: hov ? 2 : 0, borderColor: PAL.amber, pointerFilter: 'block' }}
      uiBackground={{ color: colorOf(ch) }}
      onMouseDown={() => paint(props.x, props.y)}
      {...hover(id)}
    >
      {ch !== '.' && (
        <Label value={cellGlyph(ch)} fontSize={Math.max(12, Math.round(props.size * 0.42))} font="sans-serif" color={glyphOn(ch)} textAlign="middle-center" uiTransform={{ width: '100%', height: '100%' }} />
      )}
    </UiEntity>
  )
}

const SizeRow = (props: { label: string; value: number; onMinus: () => void; onPlus: () => void; idBase: string }) => (
  <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { left: S(6), right: S(6) }, pointerFilter: 'none' }}>
    <Label value={`${props.label} ${props.value}`} fontSize={FS(16)} font="sans-serif" color={PAL.text} textAlign="middle-center" uiTransform={{ width: S(54), height: S(34) }} />
    <PillButton id={`${props.idBase}-`} label="-" width={S(40)} height={S(34)} onClick={props.onMinus} margin={{ right: S(4) }} />
    <PillButton id={`${props.idBase}+`} label="+" width={S(40)} height={S(34)} onClick={props.onPlus} />
  </UiEntity>
)

/** Everything you need less often: the grid as a map, resizing, flip and rotate, saving, importing and exporting. */
const ToolsPanel = () => {
  const rows = editor.rows.length
  const cols = editor.rows[0].length
  const cell = Math.min(S(40), Math.floor((1080 - S(640)) / rows))
  const gridW = cols * (cell + 2)
  const gridH = rows * (cell + 2)
  const width = Math.max(S(390), gridW + S(40))
  const height = S(360) + gridH
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: S(250), left: S(16) }, width, height, pointerFilter: 'none' }}>
      <Card width="100%" height="100%" pad={S(12)} block justify="flex-start">
        <OutlineLabel value="LEVEL TOOLS" fontSize={FS(22)} color={PAL.amber} width="100%" height={S(30)} />
        <UiEntity uiTransform={{ width: gridW, height: gridH, margin: { top: S(4), bottom: S(6) }, flexDirection: 'column', pointerFilter: 'none' }}>
          {editor.rows.map((row, y) => (
            <UiEntity key={`r${y}`} uiTransform={{ flexDirection: 'row', width: gridW, height: cell + 2, pointerFilter: 'none' }}>
              {row.split('').map((_, x) => (
                <Cell key={`c${x}_${y}`} x={x} y={y} size={cell} />
              ))}
            </UiEntity>
          ))}
        </UiEntity>
        <UiEntity uiTransform={{ flexDirection: 'row', justifyContent: 'center', margin: { bottom: S(6) }, pointerFilter: 'none' }}>
          <SizeRow label="W" value={cols} idBase="w" onMinus={() => resize(-1, 0)} onPlus={() => resize(1, 0)} />
          <SizeRow label="H" value={rows} idBase="h" onMinus={() => resize(0, -1)} onPlus={() => resize(0, 1)} />
        </UiEntity>
        <UiEntity uiTransform={{ flexDirection: 'row', margin: { bottom: S(6) }, pointerFilter: 'none' }}>
          <PillButton id="ed-fliph" label="Flip H" width={S(86)} height={S(34)} onClick={flipH} margin={{ right: S(6) }} />
          <PillButton id="ed-flipv" label="Flip V" width={S(86)} height={S(34)} onClick={flipV} margin={{ right: S(6) }} />
          <PillButton id="ed-rot" label="Rotate" width={S(90)} height={S(34)} onClick={rotate} margin={{ right: S(6) }} />
          <PillButton id="ed-new" label="New" width={S(70)} height={S(34)} onClick={() => newBlank(7, 7)} />
        </UiEntity>
        <Input
          placeholder="Level name (to save)"
          value={editor.levelName}
          onChange={(v) => {
            editor.levelName = v
          }}
          fontSize={FS(15)}
          color={PAL.text}
          placeholderColor={PAL.dim}
          uiTransform={{ width: '100%', height: S(34), margin: { bottom: S(6) } }}
          uiBackground={{ color: PAL.outline }}
        />
        <UiEntity uiTransform={{ flexDirection: 'row', margin: { bottom: S(6) }, pointerFilter: 'none' }}>
          <PillButton id="ed-save" label="Save to my levels" width={S(190)} height={S(38)} accent onClick={saveCurrentLevel} margin={{ right: S(6) }} />
          <PillButton id="ed-mine" label="My levels" width={S(120)} height={S(38)} onClick={openMyLevels} />
        </UiEntity>
        <Input
          placeholder="Paste a level code, press Enter"
          onChange={(v) => {
            editor.importText = v
          }}
          onSubmit={(v) => importCode(v)}
          fontSize={FS(15)}
          color={PAL.text}
          placeholderColor={PAL.dim}
          uiTransform={{ width: '100%', height: S(34), margin: { bottom: S(6) } }}
          uiBackground={{ color: PAL.outline }}
        />
        <PillButton id="ed-copy" label="Copy level code" width={S(180)} height={S(38)} onClick={copyEditorCode} />
      </Card>
    </UiEntity>
  )
}

/** The whole editor interface: toolbar (top left), hotbar (bottom), and the optional Level tools panel. */
export const EditorUI = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%', pointerFilter: 'none' }}>
    <Toolbar />
    <Hotbar />
    {editor.panelOpen && <ToolsPanel />}
  </UiEntity>
)

/** The editor needs a mouse and a big screen; it is not offered on phones. */
export const editorAvailable = () => !mobile()
