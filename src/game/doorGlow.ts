// Re-skinning the exit door model so its rune glow can be set from code. Shared by the level exit door (world.ts) and the
// lobby doors (lobbyDoors.ts).

import { Entity, GltfNodeModifiers, Material } from '@dcl/sdk/ecs'
import { Color3, Color4 } from '@dcl/sdk/math'

/**
 * Re-skin a model with its own base and emissive textures so the glow strength can be set from code (0 = dark).
 * Off is sent with no emissive texture, a black emissive colour and intensity 0: Bevy kept showing the glow with only
 * the intensity (or the colour) turned down, so off must leave nothing to light on any explorer.
 */
export function setGlow(e: Entity, base: string, emissive: string, intensity: number) {
  const on = intensity > 0.001
  GltfNodeModifiers.createOrReplace(e, {
    modifiers: [
      {
        path: '',
        material: {
          material: {
            $case: 'pbr',
            pbr: {
              albedoColor: Color4.White(),
              texture: Material.Texture.Common({ src: base }),
              // no emissive texture at all when off: Bevy lit it even with a black colour and intensity 0
              emissiveTexture: on ? Material.Texture.Common({ src: emissive }) : undefined,
              emissiveColor: on ? Color3.White() : Color3.Black(),
              emissiveIntensity: on ? intensity : 0,
              metallic: 0,
              roughness: 1
            }
          }
        }
      }
    ]
  })
}

export const exitGlow = (e: Entity, intensity: number) => setGlow(e, 'assets/images/ExitDoor_base.png', 'assets/images/ExitDoor_emissive.png', intensity)
