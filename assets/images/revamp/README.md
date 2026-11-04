# Slide Maze — UI Sprites · Opción C "Arcade helado"

PNG con fondo transparente. Todos ≤ 1024 px (límite de DCL).
Escala: **2x** respecto al diseño de Figma (paneles grandes a 1.45x / 1.85x y toast a 1.9x para no pasar de 1024).
Fuente: Lilita One (horneada en los sprites, DCL no la tiene).

## Margen transparente
Cada sprite trae un margen transparente para la sombra sólida y el contorno:
- 6 px (1x) arriba / izquierda / derecha y 6 + sombra abajo (botones: +7, tiles: +6, paneles: +10).
- Es decir: en tamaño 1x un botón de 150×66 ocupa **162×85**. Para alinear, posicioná el sprite entero; la "cara" del botón queda arriba y la sombra abajo.
- El estado **pressed** ya viene corrido hacia abajo dentro del mismo lienzo, así que normal / hover / pressed se intercambian sin mover nada.

## Carpetas
| Carpeta | Qué hay |
|---|---|
| `buttons/` | Botones vacíos (primary naranja, secondary celeste, danger rojo, play grande) en normal / hover / pressed + disabled. Para poner texto por código o reutilizar. |
| `buttons_labeled/` | Botones con texto horneado y **centrado óptico** (Play, Options, Options abierto, Prev, Next, My levels, Close) × normal / hover / pressed (+ Prev/Next disabled). |
| `menu/` | Ítems de menú vacíos (default / danger) × 3 estados. |
| `menu_labeled/` | Close, Levels, Lobby, Restart, Level code, Editor × 3 estados. |
| `panels/` | Popup Select Level (con título y destellos), versión vacía, panel del menú Options, `panel_9slice`. |
| `hud/` | Fondos HUD (s 170, m 220, l 400 de ancho), `hud_9slice`, rótulos MOVES / TIME / LEVEL y ejemplos armados. |
| `toast/` | "Exit unlocked! Head for the door" horneado + fondo vacío. |
| `level_tiles/` | Fondos de tile (normal / current naranja, hover y pressed), locked con candado, tags NEW / PLAY!, tiras de estrellas 0–3 y ejemplos armados. |
| `digits/` | 0–9, `:`, `.`, `/` en el estilo del juego para armar números (moves, tiempo, nivel, página). |
| `text/` | Título SELECT LEVEL, "1 / 2". |
| `icons/` | 13 íconos con contorno + estrella llena/vacía (128 px). |
| `fx/` | Destellos (sparkle) grande y chico. |
| `_preview.png` | Mock con todo montado (referencia, no va al juego). |

## 9-slice (para estirar a cualquier tamaño en DCL)
`uiBackground: { textureMode: 'nine-slices', texture: { src }, textureSlices: { top, bottom, left, right } }`

| Sprite | top | bottom | left | right |
|---|---|---|---|---|
| `panels/panel_9slice.png` (280×300) | 0.26 | 0.33 | 0.28 | 0.28 |
| `hud/hud_9slice.png` (280×234) | 0.28 | 0.34 | 0.24 | 0.24 |
| Pills `buttons/*` y `menu/*` (estirar a lo ancho) | 0.45 | 0.45 | 0.25 (btn) / 0.14 (menu) | igual |

## Textos dinámicos
- Números (moves, tiempo, nivel, número de tile): componer con `digits/` en una fila (flexDirection row). Los dígitos tienen alto igual y ancho propio.
- El nombre del nivel ("Stoppers") es libre: usar un Label de DCL encima de `hud_stat_l` (centrado `middle-center`), o pedir que lo hornee.

## Ejemplo DCL (SDK7)
```tsx
<UiEntity
  uiTransform={{ width: 162, height: 85 }}
  uiBackground={{ textureMode: 'stretch', texture: { src: pressed ? 'images/ui/buttons_labeled/btn_play_pressed.png' : 'images/ui/buttons_labeled/btn_play_normal.png' } }}
  onMouseDown={() => setPressed(true)}
  onMouseUp={() => { setPressed(false); startGame() }}
/>
```
(Tamaño = mitad de los píxeles del PNG para verlo a 1x.)
