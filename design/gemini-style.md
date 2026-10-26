# Slide Maze: Gemini "Style" setup

Fill in the four boxes of the SlideMaze style in this order. Everything here comes from Direction J (Frozen Ruins) in `concept-art-prompt.md` and the colours already in `src/game/world.ts`.

## 1. Guidelines (paste into "Add guidelines")

```
Slide Maze is a low-poly 3D ice-sliding puzzle game (Sokoban on ice) for a browser and phones. Always make game concept art or asset sheets, never UI, and never any readable text or letters.

LOOK: frozen ancient ruins floating in a dark cavern void. Weathered carved slate stone, glossy blue ice, pale frost and snow. Hand-painted stylised look: big simple shapes, strong silhouettes, few small details, soft light. It must stay readable from a high third-person camera and on a phone screen.

COLOUR RULES (most important):
- Glow is ONLY cool cyan / ice blue (crystals, thin rune lines).
- Warm orange is ONLY for movable blocks and interactive things. Nothing else is orange.
- NO purple, NO magenta, NO fire, NO torches, NO flames.
- Palette: deep navy void, slate stone, glossy pale-blue ice, frosty white snow, cyan glow, orange for movables.

PIECES:
- Movable block: chunky 2.7 m cube, polished carved stone with a glowing warm-orange hand-print / rune seams. Friendly, "push me", sits ON the ice.
- Static cube: same weathered slate as the walls, cold, no glow, no orange, clear cube silhouette, base set into a carved stone collar in the floor with frost.
- Pressure plate: flat plate set into the ice, amber when empty, green when a block covers it.
- Floor: 3 m square glossy ice tiles in two shades so seams stay visible. Low carved stone step around the room.
- Hole: missing tile, rough broken ice edge, drop into darkness. Fillable pit: a square shaft with a smooth amber brass lip.
- Snow patch: matte white drift on glossy ice. Arrow tile: glowing cyan arrow inlay. Wind statue: stone block with puffed cheeks and a blowing mouth, cyan runes.
- Exit: carved stone arch / double door, dim runes when sealed, blazing cyan when open.
- Rune patterns are abstract symbols, never letters.
- The level floats: rough hanging rock underside with icicles.

Camera for level art: three-quarter view from above and behind. Winter / Christmas event mood, but restrained and clean.
```

(About 2,000 characters. If the box rejects it, drop the PIECES section and keep the LOOK and COLOUR RULES, which are the ones Gemini needs most.)

## 2. Colours (paste the hex values)

| Role | Hex |
|---|---|
| Void / background | `#0B1220` |
| Dark rock (island, walls) | `#2B3854` |
| Slate stone (static cube) | `#4D5C6B` |
| Stone step (climbable) | `#4D668C` |
| Ice A | `#B8E3FA` |
| Ice B | `#A3D1F2` |
| Snow | `#F7FCFF` |
| Cyan glow (runes, crystals, arrows) | `#4DE6FF` |
| Movable orange | `#FF8C26` |
| Plate amber / pit lip | `#F2BF33` |
| Plate on (green) | `#4DFF8C` |

Keep orange and cyan as the two accent colours. Everything else stays cool and muted.

## 3. Fonts

The game has no custom font yet (the HUD uses the Decentraland UI font), so this only affects headline art such as the title sign and key art. A friendly rounded display font suits the chunky blocks:
- Headlines: **Fredoka** (or Baloo 2), bold
- Body text and accents: **Nunito** (or Poppins), regular

## 4. References

Drop in the images you attached, in this order of importance:
1. The key-art diorama (frozen ruins, orange blocks, arch door), which sets the overall look. It has torches, but Direction J removes them, so the guidelines say no fire.
2. The orange hand-print block sheet, which is the movable block.
3. The slate wind statue, which is the wind cube and the colour language of the stone.

Later additions worth adding: the best static-cube and exit-door images from Direction J shots J2 and J3. Keep it to 4-6 references so no single one dominates.

## Using it

With the style selected you no longer need the Base brief. Just name the shot, for example "Shot J1: level with both doors", or ask for a single piece such as the snow patch, the hole rim, the start pad or the exit door, which are the models still missing from the game.
