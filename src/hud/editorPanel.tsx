import ReactEcs, { Input, Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { canRedo, canUndo, check, copyEditorCode, cycleMode, exitEditor, flipH, flipV, growEdge, importCode, newBlank, paint, pickTool, playTest, redo, resetBlocks, rotate, rotateTool, setMode, stepTool, togglePanel, undo } from '../game/editor'
import { editor } from '../game/session'
import { showHint } from '../game/world'
import { openMyLevels, saveCurrentLevel } from '../game/levelStore'
import { Card, FS, OutlineLabel, PAL, PillButton, S, hover, isHovered, popFactor, popPress } from './theme'
import { mobile } from './platform'

// Cell colours. They echo the 3D look (ice blue, slate steps, orange blocks) so the grid reads like the level.
const hex = (h: string) => Color4.create(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255, 1)
const TOOLS: { tool: string; name: string; color: Color4 }[] = [
  { tool: '.', name: 'Ice', color: hex('#b8e2f8') },
  { tool: '#', name: 'Step', color: hex('#4d6688') },
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
      uiTransform={{ width: S(62), height: S(74), margin: S(2), padding: Math.max(2, S(3)), borderRadius: S(12), pointerFilter: 'block' }}
      uiBackground={{ color: on ? PAL.amber : isHovered(id) ? PAL.rim : PAL.rimDim }}
      onMouseDown={() => pickTool(tool)}
      {...hover(id)}
    >
      <UiEntity
        uiTransform={{ width: '100%', height: '100%', borderRadius: S(9), flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerFilter: 'none' }}
        uiBackground={{ color: on ? PAL.panelHi : PAL.panel }}
      >
        <UiEntity uiTransform={{ width: S(36), height: S(32), borderRadius: S(7), margin: { bottom: S(3) }, justifyContent: 'center', alignItems: 'center', pointerFilter: 'none' }} uiBackground={{ color }}>
          {glyph !== '' && <Label value={glyph} fontSize={FS(16)} font="sans-serif" color={hex('#0b1830')} textAlign="middle-center" uiTransform={{ width: '100%', height: '100%' }} />}
        </UiEntity>
        <Label value={name} fontSize={FS(12)} font="sans-serif" color={on ? PAL.amber : PAL.text} textAlign="middle-center" uiTransform={{ width: '100%', height: S(18) }} />
      </UiEntity>
    </UiEntity>
  )
}

/** The hotbar: every item you can place, along the bottom of the screen, like a build-mode toolbar. */
const Hotbar = () => (
  <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: S(10), left: 0 }, width: '100%', flexDirection: 'column', alignItems: 'center', pointerFilter: 'none' }}>
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

/**
 * Resize pad: the level as a small map with a "+" and "-" button on each side. The button sits on the edge it changes,
 * so there is nothing to decode: top pair adds / removes a row at the top, left pair a column on the left, and so on.
 * Tapping a cell of the map also paints it.
 */
const ResizePad = (props: { cell: number; bw: number; bh: number }) => {
  const rows = editor.rows.length
  const cols = editor.rows[0].length
  const { cell, bw, bh } = props
  const gridW = cols * (cell + 2)
  const gridH = rows * (cell + 2)
  const pair = (e: 'N' | 'S' | 'W' | 'E', dir: 'row' | 'column') => (
    <UiEntity uiTransform={{ flexDirection: dir, alignItems: 'center', margin: dir === 'row' ? { top: 3, bottom: 3 } : { left: 3, right: 3 }, pointerFilter: 'none' }}>
      <PillButton id={`grow${e}`} label="+" width={bw} height={bh} accent onClick={() => growEdge(e, 1)} margin={dir === 'row' ? { right: 4 } : { bottom: 4 }} />
      <PillButton id={`shrink${e}`} label="-" width={bw} height={bh} onClick={() => growEdge(e, -1)} />
    </UiEntity>
  )
  return (
    <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center', pointerFilter: 'none' }}>
      {pair('N', 'row')}
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', pointerFilter: 'none' }}>
        {pair('W', 'column')}
        <UiEntity uiTransform={{ width: gridW, height: gridH, flexDirection: 'column', pointerFilter: 'none' }}>
          {editor.rows.map((row, y) => (
            <UiEntity key={`r${y}`} uiTransform={{ flexDirection: 'row', width: gridW, height: cell + 2, pointerFilter: 'none' }}>
              {row.split('').map((_, x) => (
                <Cell key={`c${x}_${y}`} x={x} y={y} size={cell} />
              ))}
            </UiEntity>
          ))}
        </UiEntity>
        {pair('E', 'column')}
      </UiEntity>
      {pair('S', 'row')}
    </UiEntity>
  )
}

let fileOpen = false
let dockCollapsed = false
let mapOpen = false
const DOCK_W = 350

const rowStyle = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, justifyContent: 'center' as const, width: '100%' as const, pointerFilter: 'none' as const }
const pill = (id: string, label: string, onClick: () => void, o: { accent?: boolean; danger?: boolean; w?: number } = {}) => (
  <PillButton id={id} label={label} width={S(o.w ?? 74)} height={S(36)} accent={o.accent} danger={o.danger} onClick={onClick} margin={{ right: S(4), bottom: S(4) }} />
)

/** Desktop, optional: the level as a 2D map to paint on and resize, in its own panel beside the main one. */
const MapPanel = () => {
  const rows = editor.rows.length
  const cols = editor.rows[0].length
  // the phone canvas is 720 high and the tile card sits along the bottom, so the map gets less room there
  const avail = mobile() ? 720 - 170 - S(10) : 1080 - S(30)
  const overhead = S(230)
  const cell = Math.max(6, Math.min(S(34), Math.floor((avail - overhead) / Math.max(rows, cols)) - 2))
  const gridW = cols * (cell + 2)
  const gridH = rows * (cell + 2)
  const width = Math.max(S(300), gridW + S(40) + 2 * (S(40) + S(12)))
  const height = overhead + gridH
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: S(10), right: mobile() ? S(12) + 2 * S(132) + S(16) : S(12 + DOCK_W + 8) }, width, height, pointerFilter: 'none' }}>
      <Card width="100%" height="100%" pad={S(10)} block justify="flex-start">
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', pointerFilter: 'none' }}>
          <OutlineLabel value="MAP EDITOR" fontSize={FS(20)} color={PAL.amber} width={S(180)} height={S(32)} align="middle-left" />
          <PillButton id="map-hide" label="Hide" width={S(76)} height={S(34)} danger onClick={() => (mapOpen = false)} />
        </UiEntity>
        <ResizePad cell={cell} bw={S(40)} bh={S(32)} />
        <Label value={`${cols} x ${rows}   (+ / - on a side grows or shrinks that edge)`} fontSize={FS(13)} font="sans-serif" color={PAL.dim} textAlign="middle-center" uiTransform={{ width: '100%', height: S(24) }} />
        <UiEntity uiTransform={rowStyle}>
          {pill('ed-fliph', 'Flip H', flipH)}
          {pill('ed-flipv', 'Flip V', flipV)}
          {pill('ed-rot', 'Rotate', rotate)}
          {pill('ed-new', 'New', () => newBlank(7, 7))}
        </UiEntity>
      </Card>
    </UiEntity>
  )
}

/** Desktop: the main editor panel on the right. Collapses to one small button. */
const Dock = () => {
  if (dockCollapsed) {
    return (
      <UiEntity uiTransform={{ positionType: 'absolute', position: { top: S(10), right: S(12) }, pointerFilter: 'none' }}>
        <PillButton id="ed-expand" label="Editor +" width={S(140)} height={S(42)} accent onClick={() => (dockCollapsed = false)} />
      </UiEntity>
    )
  }
  const height = S(300) + (fileOpen ? S(130) : 0)
  const statusColor = editor.statusKind === 'ok' ? PAL.good : editor.statusKind === 'bad' ? hex('#ff8a7a') : PAL.dim
  const seg = (m: 'paint' | 'rect', label: string) => (
    <PillButton id={`ed-m-${m}`} label={label} width={S(86)} height={S(34)} accent={editor.mode === m && editor.tool !== '.'} onClick={() => setMode(m)} margin={{ right: S(4) }} />
  )
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', pointerFilter: 'none' }}>
      {mapOpen && <MapPanel />}
      <UiEntity uiTransform={{ positionType: 'absolute', position: { top: S(10), right: S(12) }, width: S(DOCK_W), height, pointerFilter: 'none' }}>
        <Card width="100%" height="100%" pad={S(10)} block justify="flex-start">
          <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', pointerFilter: 'none' }}>
            <OutlineLabel value="LEVEL EDITOR" fontSize={FS(20)} color={PAL.amber} width={S(200)} height={S(32)} align="middle-left" />
            <PillButton id="ed-collapse" label="Hide -" width={S(90)} height={S(34)} onClick={() => (dockCollapsed = true)} />
          </UiEntity>
          <UiEntity uiTransform={{ ...rowStyle, margin: { top: S(4) } }}>
            {pill('ed-play', 'Play', playTest, { accent: true })}
            {pill('ed-check', 'Check', check, { accent: true })}
            {pill('ed-undo', 'Undo', undo)}
            {pill('ed-redo', 'Redo', redo)}
          </UiEntity>
          <UiEntity uiTransform={{ ...rowStyle, margin: { top: S(2), bottom: S(4) } }}>
            {seg('paint', 'Paint')}
            {seg('rect', editor.mode === 'rect' && editor.anchor ? '2nd corner' : 'Rect')}
            <PillButton
              id="ed-erase"
              label="Erase"
              width={S(86)}
              height={S(34)}
              danger={editor.tool === '.'}
              onClick={() => {
                setMode('paint')
                pickTool('.')
              }}
              margin={{ right: S(4) }}
            />
          </UiEntity>
          <Label value={editor.status} fontSize={FS(14)} font="sans-serif" color={statusColor} textAlign="middle-center" textWrap="wrap" uiTransform={{ width: '100%', height: S(44) }} />
          <UiEntity uiTransform={rowStyle}>
            {pill('ed-map', mapOpen ? 'Map <' : 'Map >', () => (mapOpen = !mapOpen), { accent: mapOpen, w: 104 })}
            {pill('ed-hint', 'Hint', showHint, { w: 104 })}
            {pill('ed-reset', 'Reset', resetBlocks, { w: 104 })}
          </UiEntity>
          <UiEntity uiTransform={rowStyle}>
            {pill('ed-file', fileOpen ? 'Less' : 'More', () => (fileOpen = !fileOpen), { w: 104 })}
            {pill('ed-exit', 'Exit', exitEditor, { danger: true, w: 104 })}
          </UiEntity>
          {fileOpen ? (
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center', pointerFilter: 'none' }}>
              <Input
                placeholder="Level name (to save)"
                value={editor.levelName}
                onChange={(v) => {
                  editor.levelName = v
                }}
                fontSize={FS(15)}
                color={PAL.text}
                placeholderColor={PAL.dim}
                uiTransform={{ width: '100%', height: S(34), margin: { bottom: S(4) } }}
                uiBackground={{ color: PAL.outline }}
              />
              <UiEntity uiTransform={rowStyle}>
                {pill('ed-save', 'Save', saveCurrentLevel, { accent: true, w: 100 })}
                {pill('ed-mine', 'My levels', openMyLevels, { w: 120 })}
                {pill('ed-copy', 'Copy code', copyEditorCode, { w: 140 })}
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
                uiTransform={{ width: '100%', height: S(34) }}
                uiBackground={{ color: PAL.outline }}
              />
            </UiEntity>
          ) : null}
        </Card>
      </UiEntity>
    </UiEntity>
  )
}

// ---- Phone layout ----
// No keys and no hover on a phone, so the editor is built from taps: a Last Gate style card at the bottom shows the
// selected tile with < > arrows to swap it (tap a tile in the 3D view to place it; "Ice" erases), a slim bar at the
// top holds the everyday actions, and the rest sits behind Menu / Tools. Sizes are canvas pixels (1600x720).
const SwapArrow = (props: { id: string; glyph: string; step: number }) => {
  const k = popFactor(props.id, 0.2)
  const size = Math.round(84 * k)
  return (
    <UiEntity
      uiTransform={{ width: size, height: size, margin: { left: 8, right: 8 }, padding: 4, borderRadius: 22, pointerFilter: 'block' }}
      uiBackground={{ color: PAL.amber }}
      onMouseDown={() => {
        popPress(props.id)
        stepTool(props.step)
      }}
    >
      <UiEntity uiTransform={{ width: '100%', height: '100%', borderRadius: 18, justifyContent: 'center', alignItems: 'center', pointerFilter: 'none' }} uiBackground={{ color: PAL.panel }}>
        <Label value={props.glyph} fontSize={44} font="sans-serif" color={PAL.amber} textAlign="middle-center" uiTransform={{ width: 60, height: 54 }} />
      </UiEntity>
    </UiEntity>
  )
}

let lastTool = ''
const TileCard = () => {
  const id = ARROW_CHARS.includes(editor.tool) ? 'arrow' : FAN_CHARS.includes(editor.tool) ? 'fan' : editor.tool
  if (editor.tool !== lastTool) {
    if (lastTool !== '') popPress('tilecard')
    lastTool = editor.tool
  }
  const idx = Math.max(0, TOOLS.findIndex((t) => t.tool === id))
  const t = TOOLS[idx]
  const turnable = id === 'arrow' || id === 'fan'
  const glyph = turnable ? (id === 'arrow' ? editor.tool : FAN_GLYPH[editor.tool]) : ''
  const k = popFactor('tilecard', 0.08)
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: 14, left: 0 }, width: '100%', flexDirection: 'column', alignItems: 'center', pointerFilter: 'none' }}>
      {turnable ? <PillButton id="ed-turn" label="Turn" width={150} height={50} accent onClick={rotateTool} margin={{ bottom: 6 }} /> : null}
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', pointerFilter: 'none' }}>
        <SwapArrow id="tool-prev" glyph="<" step={-1} />
        <Card width={Math.round(250 * k)} height={Math.round(130 * k)} rim={PAL.amber} block>
          <UiEntity uiTransform={{ width: 64, height: 52, borderRadius: 10, margin: { bottom: 4 }, justifyContent: 'center', alignItems: 'center', pointerFilter: 'none' }} uiBackground={{ color: t.color }}>
            {glyph !== '' && <Label value={glyph} fontSize={26} font="sans-serif" color={hex('#0b1830')} textAlign="middle-center" uiTransform={{ width: '100%', height: '100%' }} />}
          </UiEntity>
          <OutlineLabel value={t.name} fontSize={26} color={PAL.amber} width={230} height={32} />
          <Label value={`${idx + 1} / ${TOOLS.length}`} fontSize={18} font="sans-serif" color={PAL.dim} textAlign="middle-center" uiTransform={{ width: 230, height: 20 }} />
        </Card>
        <SwapArrow id="tool-next" glyph=">" step={1} />
      </UiEntity>
    </UiEntity>
  )
}

// Phone: a column at the top right (Play, Check, Undo, Redo, More) with a second column of extras beside it, a status
// line under the stat pills, a tools window, and the optional Map panel to the left of the columns.
let moreOpen = false

const MobileBar = () => {
  const w = S(132)
  const h = S(42)
  const m = { bottom: S(6) }
  const b = (id: string, label: string, onClick: () => void, o: { accent?: boolean; danger?: boolean } = {}) => (
    <PillButton id={id} label={label} width={w} height={h} accent={o.accent} danger={o.danger} onClick={onClick} margin={m} />
  )
  const mode = editor.mode === 'paint' ? 'Paint' : editor.anchor ? '2nd corner' : 'Rect'
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: S(10), right: S(12) }, flexDirection: 'row', alignItems: 'flex-start', pointerFilter: 'none' }}>
      {moreOpen ? (
        <UiEntity uiTransform={{ flexDirection: 'column', margin: { right: S(8) }, pointerFilter: 'none' }}>
          {b('ed-mode', mode, cycleMode, { accent: editor.mode !== 'paint' })}
          {b('ed-map', mapOpen ? 'Map <' : 'Map >', () => (mapOpen = !mapOpen), { accent: mapOpen })}
          {b('ed-hint', 'Hint', showHint)}
          {b('ed-reset', 'Reset', resetBlocks)}
          {b('ed-tools', editor.panelOpen ? 'Tools <' : 'Tools', togglePanel)}
          {b('ed-exit', 'Exit', exitEditor, { danger: true })}
        </UiEntity>
      ) : null}
      <UiEntity uiTransform={{ flexDirection: 'column', pointerFilter: 'none' }}>
        {b('ed-play', 'Play', playTest, { accent: true })}
        {b('ed-check', 'Check', check, { accent: true })}
        {b('ed-undo', canUndo() ? 'Undo' : 'Undo -', undo)}
        {b('ed-redo', canRedo() ? 'Redo' : 'Redo -', redo)}
        {b('ed-more', moreOpen ? 'Close' : 'More', () => (moreOpen = !moreOpen), { danger: moreOpen })}
      </UiEntity>
    </UiEntity>
  )
}

/** One line of feedback under the stat pills (top centre). */
const StatusLine = () => {
  const color = editor.statusKind === 'ok' ? PAL.good : editor.statusKind === 'bad' ? hex('#ff8a7a') : PAL.text
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: S(78), left: 0 }, width: '100%', height: S(38), justifyContent: 'center', alignItems: 'center', pointerFilter: 'none' }}>
      <OutlineLabel value={editor.status} fontSize={FS(18)} color={color} width={S(900)} height={S(34)} />
    </UiEntity>
  )
}

/** Level tools as a centred two column window: flip, rotate, naming, saving, importing and exporting. */
const MobileTools = () => {
  const mp = (id: string, label: string, onClick: () => void, o: { accent?: boolean; w?: number } = {}) => (
    <PillButton id={id} label={label} width={o.w ?? 116} height={52} accent={o.accent} onClick={onClick} margin={{ right: 6, bottom: 6 }} />
  )
  const row = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, width: '100%' as const, margin: { bottom: 8 }, pointerFilter: 'none' as const }
  const W = 1100
  const H = 380
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: '50%', left: '50%' }, margin: { top: -H / 2, left: -W / 2 }, width: W, height: H, pointerFilter: 'none' }}>
      <Card width="100%" height="100%" pad={20} block justify="flex-start">
        <OutlineLabel value="LEVEL TOOLS" fontSize={28} color={PAL.amber} width="100%" height={40} />
        <UiEntity uiTransform={{ flexDirection: 'row', width: '100%', margin: { top: 10 }, pointerFilter: 'none' }}>
          <UiEntity uiTransform={{ width: 520, flexDirection: 'column', margin: { right: 20 }, pointerFilter: 'none' }}>
            <UiEntity uiTransform={row}>
              {mp('ed-fliph', 'Flip H', flipH)}
              {mp('ed-flipv', 'Flip V', flipV)}
              {mp('ed-rot', 'Rotate', rotate)}
              {mp('ed-new', 'New', () => newBlank(7, 7))}
            </UiEntity>
            <UiEntity uiTransform={row}>
              {mp('ed-copy', 'Copy code', copyEditorCode, { w: 180 })}
              {mp('ed-mine', 'My levels', openMyLevels, { w: 160 })}
            </UiEntity>
          </UiEntity>
          <UiEntity uiTransform={{ width: 480, flexDirection: 'column', pointerFilter: 'none' }}>
            <Input
              placeholder="Level name (to save)"
              value={editor.levelName}
              onChange={(v) => {
                editor.levelName = v
              }}
              fontSize={22}
              color={PAL.text}
              placeholderColor={PAL.dim}
              uiTransform={{ width: '100%', height: 54, margin: { bottom: 8 } }}
              uiBackground={{ color: PAL.outline }}
            />
            {mp('ed-save', 'Save to my levels', saveCurrentLevel, { accent: true, w: 260 })}
            <Input
              placeholder="Paste a level code, press Enter"
              onChange={(v) => {
                editor.importText = v
              }}
              onSubmit={(v) => importCode(v)}
              fontSize={22}
              color={PAL.text}
              placeholderColor={PAL.dim}
              uiTransform={{ width: '100%', height: 54, margin: { top: 8, bottom: 8 } }}
              uiBackground={{ color: PAL.outline }}
            />
          </UiEntity>
        </UiEntity>
        <PillButton id="ed-tools-close" label="Close" danger width={160} height={52} onClick={togglePanel} margin={{ top: 4 }} />
      </Card>
    </UiEntity>
  )
}

const MobileEditorUI = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%', pointerFilter: 'none' }}>
    <MobileBar />
    <StatusLine />
    {mapOpen && !editor.panelOpen && <MapPanel />}
    {!editor.panelOpen && <TileCard />}
    {editor.panelOpen && <MobileTools />}
  </UiEntity>
)

/** The whole editor interface: desktop gets the docked panel and hotbar, phones the column, tile card and tools window. */
export const EditorUI = () =>
  mobile() ? (
    <MobileEditorUI />
  ) : (
    <UiEntity uiTransform={{ width: '100%', height: '100%', pointerFilter: 'none' }}>
      <Dock />
      <Hotbar />
    </UiEntity>
  )

export const editorAvailable = () => true
