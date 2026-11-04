// Re-skinning the exit door model so its rune glow can be set from code. Shared by the level exit door (world.ts) and the
// lobby doors (lobbyDoors.ts).

import { Entity, GltfNodeModifiers, Material } from '@dcl/sdk/ecs'
import { Color3, Color4 } from '@dcl/sdk/math'

/** Re-skin a model with its own base and emissive textures so the glow strength can be set from code (0 = dark). */
export function setGlow(e: Entity, base: string, emissive: string, intensity: number) {
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
              emissiveTexture: Material.Texture.Common({ src: emissive }),
              emissiveColor: Color3.White(),
              emissiveIntensity: intensity,
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
