import ReactEcs, { Input, Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { canRedo, canUndo, check, copyEditorCode, cycleMode, exitEditor, flipH, flipV, importCode, newBlank, paint, pickTool, playTest, redo, resetBlocks, resize, rotate, undo } from '../game/editor'
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

const ToolButton = (props: { t: (typeof TOOLS)[number]; key?: string }) => {
  const { tool, name, color } = props.t
  const on = isOn(tool)
  const id = `tool${tool}`
  return (
    <UiEntity
      uiTransform={{ width: S(60), height: S(46), margin: S(2), padding: Math.max(2, S(3)), borderRadius: S(10), pointerFilter: 'block' }}
      uiBackground={{ color: on ? PAL.amber : isHovered(id) ? PAL.rim : PAL.rimDim }}
      onMouseDown={() => pickTool(tool)}
      {...hover(id)}
    >
      <UiEntity
        uiTransform={{ width: '100%', height: '100%', borderRadius: S(8), flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerFilter: 'none' }}
        uiBackground={{ color: PAL.panelHi }}
      >
        <UiEntity uiTransform={{ width: S(30), height: S(18), borderRadius: S(4), justifyContent: 'center', alignItems: 'center', pointerFilter: 'none' }} uiBackground={{ color }}>
          {(tool === 'arrow' || tool === 'fan') && (
            <Label value={tool === 'arrow' ? (ARROW_CHARS.includes(editor.tool) ? editor.tool : editor.lastArrow) : FAN_GLYPH[FAN_CHARS.includes(editor.tool) ? editor.tool : editor.lastFan]} fontSize={FS(12)} font="sans-serif" color={hex('#0b1830')} textAlign="middle-center" uiTransform={{ width: '100%', height: '100%' }} />
          )}
        </UiEntity>
        <Label value={name} fontSize={FS(12)} font="sans-serif" color={on ? PAL.amber : PAL.text} textAlign="middle-center" uiTransform={{ width: '100%', height: S(18) }} />
      </UiEntity>
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

export const EditorPanel = () => {
  const rows = editor.rows.length
  const cols = editor.rows[0].length
  // keep the whole grid on screen: the virtual canvas is 1080 tall on desktop
  const cell = Math.min(S(40), Math.floor((1080 - S(770)) / rows))
  const gridW = cols * (cell + 2)
  const gridH = rows * (cell + 2)
  const width = Math.max(S(390), gridW + S(40))
  const statusColor = editor.statusKind === 'ok' ? PAL.good : editor.statusKind === 'bad' ? hex('#ff8a7a') : PAL.dim
  const height = S(650) + gridH
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: S(84), left: S(16) }, width, height, pointerFilter: 'none' }}>
      <Card width="100%" height="100%" pad={S(12)} block justify="flex-start">
        <OutlineLabel value="LEVEL EDITOR" fontSize={FS(24)} color={PAL.amber} width="100%" height={S(32)} />
        <Label
          value="Click the grid, or aim at a tile in the world and click. E / F: tool. 1: rotate. 2: reset blocks. 3 / 4: undo / redo."
          fontSize={FS(12)}
          font="sans-serif"
          color={PAL.dim}
          textAlign="middle-center"
          textWrap="wrap"
          uiTransform={{ width: '100%', height: S(34) }}
        />
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', pointerFilter: 'none' }}>
          {TOOLS.map((t) => (
            <ToolButton key={`b${t.tool}`} t={t} />
          ))}
        </UiEntity>
        <UiEntity uiTransform={{ width: gridW, height: gridH, margin: { top: S(6), bottom: S(6) }, flexDirection: 'column', pointerFilter: 'none' }}>
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
          <PillButton id="ed-mode" label={editor.mode === 'paint' ? 'Mode: Paint' : editor.mode === 'fill' ? 'Mode: Fill' : editor.anchor ? 'Rect: 2nd corner' : 'Mode: Rect'} width={S(140)} height={S(34)} accent={editor.mode !== 'paint'} onClick={cycleMode} margin={{ right: S(6) }} />
          <PillButton id="ed-fliph" label="Flip H" width={S(76)} height={S(34)} onClick={flipH} margin={{ right: S(6) }} />
          <PillButton id="ed-flipv" label="Flip V" width={S(76)} height={S(34)} onClick={flipV} margin={{ right: S(6) }} />
          <PillButton id="ed-rot" label="Rotate" width={S(80)} height={S(34)} onClick={rotate} />
        </UiEntity>
        <UiEntity uiTransform={{ flexDirection: 'row', margin: { bottom: S(6) }, pointerFilter: 'none' }}>
          <PillButton id="ed-undo" label={canUndo() ? 'Undo' : 'Undo -'} width={S(100)} height={S(34)} onClick={undo} margin={{ right: S(6) }} />
          <PillButton id="ed-redo" label={canRedo() ? 'Redo' : 'Redo -'} width={S(100)} height={S(34)} onClick={redo} margin={{ right: S(6) }} />
          <PillButton id="ed-hint" label="Hint" width={S(100)} height={S(34)} onClick={showHint} />
        </UiEntity>
        <UiEntity uiTransform={{ flexDirection: 'row', margin: { bottom: S(6) }, pointerFilter: 'none' }}>
          <PillButton id="ed-check" label="Check" width={S(100)} height={S(40)} accent onClick={check} margin={{ right: S(6) }} />
          <PillButton id="ed-play" label="Play" width={S(100)} height={S(40)} accent onClick={playTest} margin={{ right: S(6) }} />
          <PillButton id="ed-copy" label="Copy code" width={S(130)} height={S(40)} onClick={copyEditorCode} />
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
        <Label
          value={editor.status}
          fontSize={FS(15)}
          font="sans-serif"
          color={statusColor}
          textAlign="middle-center"
          textWrap="wrap"
          uiTransform={{ width: '100%', height: S(44) }}
        />
        <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(4) }, pointerFilter: 'none' }}>
          <PillButton id="ed-reset" label="Reset" width={S(96)} height={S(38)} onClick={resetBlocks} margin={{ right: S(6) }} />
          <PillButton id="ed-new" label="New" width={S(86)} height={S(38)} onClick={() => newBlank(7, 7)} margin={{ right: S(6) }} />
          <PillButton id="ed-exit" label="Exit" width={S(86)} height={S(38)} onClick={exitEditor} />
        </UiEntity>
      </Card>
    </UiEntity>
  )
}

/** The editor needs a mouse and a big screen; it is not offered on phones. */
export const editorAvailable = () => !mobile()
