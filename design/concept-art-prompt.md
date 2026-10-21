# Slide Maze: concept art prompts for Gemini

How to use: paste the **Base brief** first so the model knows the game, then paste one **Direction** and one **Shot**. Generate each shot under all three directions, compare, and keep what works. Ask Gemini to make 4 variations of each.

---

## Base brief (paste first)

> I'm designing a 3D puzzle game called **Slide Maze** for Decentraland, a low-poly web 3D platform that runs in a browser and on phones. I need **concept art** to explore the visual direction.
>
> **The game:** the whole floor is ice. You walk into a block and it slides across the level until it hits a wall, another block or an obstacle. You solve each level by sliding blocks onto glowing pressure plates. It is a "Sokoban on ice", inspired by the ice dungeon block puzzles in Zelda: Ocarina of Time.
>
> **How it looks to the player:** each level is a small square room of ice tiles **floating high in the air above a dark cave void**, seen from a third-person camera above and behind the player, like a diorama. The floor is a grid of 3-metre square tiles. Holes in the floor are real drops into the void.
>
> **Pieces that must be clearly readable (this is the biggest design risk):**
> - **Movable blocks:** friendly, chunky, **warm orange**, obviously "push me".
> - **Static cubes:** cold, heavy, **dark slate**, obviously immovable. Must never be confused with movable blocks, even tiny in a thumbnail.
> - **Pressure plates:** flat glowing plates set in the ice, amber when empty and green when a block sits on them.
> - **Walls:** a low stone step around the room's edge that the player can climb onto, and taller full walls for complex levels.
> - **Holes:** missing tiles, a drop into darkness. **Fillable pits:** the same hole but with a glowing amber brass lip, which a block can fill.
> - **Snow patches:** matte snow drifts on glossy ice. **Arrow tiles:** a glowing arrow inlay that redirects a sliding block. **Fans:** a solid machine with spinning blades that blows blocks along a line.
>
> **Hard constraints for the art:** it must be buildable as simple low-poly models with a small texture atlas (hand-painted or simple PBR), readable from a high third-person camera, and clean on a phone screen. Strong silhouettes, few small details. No text in the images. The game launches as a **Christmas / winter event** in December.
>
> Please produce concept art only, no UI.

---

## Style directions (paste one)

### Direction A: Crystal Cave
> **Style:** a stylised glowing ice cavern. Glossy translucent ice, dark blue-black rock, large luminous crystals in cyan and magenta. Cool palette, high contrast, magical rim lighting. Think a polished mobile puzzle game with the mood of an ice dungeon. Soft bloom on emissive parts.

### Direction B: Cosy Toy Winter
> **Style:** a chunky toy-like winter world, as if built from wooden and plastic toy blocks on a frosted glass table. Rounded bevelled shapes, bright saturated colours, soft warm string lights and lanterns against a cool blue night, gentle snow. Friendly, festive, very readable. Think a premium casual game with a Christmas feel.

### Direction C: Ancient Ice Temple
> **Style:** a weathered ice temple in the spirit of a Zelda dungeon. Carved stone, worn runes, brass fittings, frozen ruins, torch light against cold blue. Ancient and mysterious but still clean and readable. The movable blocks look like carved stone offerings with warm orange glow lines, the static cubes like dark carved monoliths.

---

## Shots (paste one at a time)

### Shot 1: Key art, a level seen from the game camera
> Show **one puzzle level** as a floating diorama: a 7x7 room of glossy ice tiles with a low stone step around the edge, floating high above a dark glowing cave abyss. Three orange movable blocks, two dark slate static cubes, two glowing pressure plates (one amber, one green with a block on it), one hole in the floor showing the drop. Camera: three-quarter view from above and behind, as the player would see it. Include the player's small avatar standing at the start. Dramatic, readable lighting.

### Shot 2: The lobby cave
> The **lobby**, an ice cave at ground level where players arrive. A glowing **level-select terminal** (a pillar with a large screen) in the centre, a big **leaderboard board** on the back wall, a **reward pedestal** with a glowing wearable, glowing crystals along the walls, snow drifts, stalactites overhead, a big **SLIDE MAZE** sign (blank, no text). Overhead we can glimpse the floating puzzle levels through an opening in the cave roof. Wide view from the arrival point.

### Shot 3: The tile kit sheet
> A **modular kit sheet** on a neutral grey background, orthographic three-quarter views, evenly lit, every piece labelled with a number only: ice floor tile (two shades), stone step tile with a corner piece, full-height wall tile, pressure plate off and on, the start pad rune circle, a floor tile with a broken-ice hole, and the underside rock chunk that hangs below the floating level. Clean, turnaround-sheet style, so a 3D artist can model them.

### Shot 4: Hero blocks
> **Close-up comparison** of the two cubes side by side: the **movable block** (warm orange, friendly, push marks) and the **static cube** (cold dark slate, heavy, carved). Show each from the front, the side and the top, then both tiny in a thumbnail-sized crop on an ice tile to prove they can never be confused.

### Shot 5: Special tiles sheet
> **Sheet of the special tiles** on ice tiles, orthographic three-quarter views: the **snow patch** (matte drift), the **arrow tile** (glowing inlay, four rotations), the **fan** (solid machine, spinning blades, a faint line of wind showing where it blows), the **fillable pit** (square shaft with a glowing amber brass lip) next to a plain **deadly hole**, and the same pit **after being filled** (rubble patch flush with the floor).

### Shot 6: Mood and palette board
> A **mood board**: 8 small scenes showing lighting, materials and colour for this direction (ice, rock, glowing crystals, metal, snow), followed by a strip of **10 colour swatches** that define the palette. No text.

### Shot 7: Reward wearable
> **Three wearable concepts** for the prize given to a player who completes all 15 levels, in this game's style: one head item, one back item, one handheld item. Shown on a plain mannequin-style avatar silhouette, front and side. Low-poly friendly, strong silhouette, glow accents in the game's orange.

### Shot 8: The fall
> A **dramatic moment**: the player's avatar tumbling off the edge of the floating level into the glowing abyss, with the level floating above and a dropped orange block falling beside them. Cinematic, wide, for the "you fell" feeling.

---

## Tips for iterating

- After the first batch, say: "I like variation 3's lighting and variation 1's block shapes. Combine them." Gemini responds well to naming the exact variation.
- If movable and static cubes look too similar: "Make the movable block much warmer and rounder, and the static cube much colder, taller and more angular."
- If it looks too realistic: "Simplify to low-poly game art, big flat shapes, hand-painted textures, no photographic detail."
- Keep one **winner image** per direction and reuse it as a reference: "Match the style of the attached image."
- When a direction is chosen, bring the winning Shot 3 and Shot 4 images back and I will turn them into the final asset spec and update `design/3d-assets.md`.

---

# Round 2: more directions

The first three directions were all variations on "stylised magical ice". These are deliberately different. Use them exactly like the others: **Base brief, then one direction, then a Shot.**

### Direction D: Pastel Diorama (Monument Valley feel)
> **Style:** calm, architectural, minimal. Clean geometric shapes, flat soft colours with gentle gradients, no texture noise. A pastel palette (powder blue, cream, dusty pink, soft coral) with one bold accent colour for the movable blocks. Floating islands in a hazy gradient sky instead of a dark cave. Soft ambient light, long gentle shadows, quiet and elegant. It should feel like a premium art-house puzzle game.

### Direction E: Cryo-Lab Test Chamber (Portal feel)
> **Style:** a clean sci-fi testing facility. The floors are slick white-blue ice-glass panels in a dark industrial chamber, with bright neon guide lines, hazard stripes, glowing panel seams and floating observation windows. The movable blocks look like orange cargo or test cubes, the static cubes like dark steel weights. A cold, witty, clinical mood with strong clean lighting. Ice as a lab surface, not a fantasy cave.

### Direction F: Paper Craft Winter
> **Style:** everything looks cut from layered paper and card, with visible paper edges, soft drop shadows between layers and subtle paper fibre texture. Snowflake cut-outs, folded origami blocks, torn-paper rock edges, a warm backlit paper lantern glow. Handmade, tactile and cheerful. Muted winter colours with a bright orange for the blocks.

### Direction G: Neon Rink (Synthwave arcade)
> **Style:** a retro arcade ice rink at night. A dark navy void with a glowing neon grid, the ice tiles lit from below by cyan and magenta light, chrome and glossy plastic blocks with neon edge lines, lens flares and soft haze. Bold, high contrast, energetic, a little 80s. The movable blocks glow hot orange, the static cubes are matte black chrome.

### Direction H: Nordic Folk Storybook
> **Style:** a hand-painted Scandinavian folk-art winter. Carved painted wood, rosemaling patterns, woven textiles, red and cream and deep forest-green with a gold accent, warm lantern light in the snow. The movable blocks look like painted wooden toys with patterns, the static cubes like dark carved stone. Cosy, handcrafted, storybook illustration, a bit mythic.

### Direction I: Voxel Brick World
> **Style:** built entirely from chunky cubes, like voxels or toy bricks, with visible studs and clean bevels. Every object, even the rocks, crystals and fans, is made of cubes on a grid, which matches the game's own tile grid. Bright, clean toy colours, glossy plastic, soft studio lighting, a miniature "diorama on a table" feel. Very easy to build and very readable.

---

## What to tell me after you look at them

If none of these work either, tell me what bothered you in the images you got. These answers help the most:
- **Too realistic, too cartoony, or too dark?**
- **Too busy:** can you still tell the blocks from the cubes at a glance?
- **Mood:** do you want it cosy, epic, mysterious, funny, or calm?
- **A game you'd like it to feel like** (even one that isn't a puzzle game).

I'll write a new direction around that.

---

# Round 3: Direction J, Frozen Ruins (merges Crystal Cave and Ancient Ice Temple)

Built from what worked in the first images: the temple's carved stone and glowing runes, and the crystal cave's dark void and clean readable tiles.

**What changed and why**
- **One crystal colour (cyan / ice blue), no purple or magenta.** Warm orange then means only "movable / interactive".
- **No fire.** Torches use orange and compete with the blocks. Light comes from cool crystals set into the ruins and glowing rune lines.
- **Static cubes are part of the architecture**, not crates on the floor. **Movable blocks sit on top** of the ice and glow.
- **One entrance arch and one exit door.** The exit is sealed until every plate is covered, then it opens.

### Direction J (paste after the Base brief)
> **Style:** frozen ancient ruins floating in a dark cavern void. Weathered carved stone and glossy blue ice, with no fire. The only glow is **cool cyan / ice-blue**: crystals set into the ruin walls, thin glowing rune lines, and small crystal lamps. **No purple, no magenta, no flames, no torches.** A restrained palette: deep navy void, slate stone, pale frosty snow, glowing cyan, and **warm orange used only on the movable blocks**.
>
> **Movable blocks:** polished carved stone with **glowing warm-orange rune seams**, sitting on top of the ice with a soft contact shadow. Friendly, chunky, inviting.
>
> **Static cubes:** the same weathered slate stone as the walls, **built into the floor**: each one rises from a carved stone collar or socket sunk into the ice, with frost along its base and a worn rune pattern that matches the walls. **No glow, no orange.** They read as part of the architecture, clearly immovable, but still unmistakably a plain **cube silhouette** so they are never confused with walls.
>
> **Walls:** a low carved stone step around the room with frost on top and thin cyan rune lines. Rune patterns are **abstract symbols, never readable letters**.
>
> **Doors:** one **open entrance arch** in the border wall where the player arrives, and one **sealed exit door** on the opposite side: a stone double door with cyan rune lines that are dark and dim, to show it is locked.
>
> **Underside:** the level floats; the underside is rough hanging rock with icicles. Soft light, strong readable shapes, clean enough for a phone screen.

### Shot J1: Level with both doors
> One puzzle level in this style from the game camera (three-quarter view, above and behind): a floating 7x7 room of ice tiles, **an open entrance arch on the near side with the player's small avatar just inside**, a **sealed exit door on the far wall with dim runes**, three orange movable blocks, two static carved cubes built into the floor, two pressure plates (one amber, one green with a block on it), one fillable pit (a square shaft with a smooth carved stone lip and a bright cyan-white rune ring around it) next to one plain deadly hole (rough broken ice edge, no lip, no ring), an arrow tile and a fan. Dark cavern void around it.

### Shot J2: The exit door states
> Two panels side by side of the **exit door**: left, **sealed**, dark dim runes, cold and quiet; right, **open**, runes blazing cyan, the double doors slid apart and a soft cyan light shining through. Same stone, same frost.

### Shot J3: Static vs movable, integrated
> A close-up of **one static cube and one movable block** on the same ice tiles. The static cube grows out of a carved stone collar sunk into the floor, with frost at its base and wall-matching runes, no glow. The movable block sits on the ice, polished, with glowing warm-orange rune seams. Then a tiny thumbnail version of the scene to show they are still instantly distinguishable.

### Tips for this round
- If Gemini adds fire or purple anyway, add: "Absolutely no flames and no purple or magenta anywhere."
- If the runes turn into readable letters: "Abstract geometric symbols only, no letters or words."
- If the static cubes read as walls: "Keep them a clear cube silhouette, separate from the wall, only the base is embedded in the floor."
