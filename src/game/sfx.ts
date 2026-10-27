// Sound effects. One-shots reuse a lazily created global AudioSource per clip (same pattern as DontCatchIt's sfx.ts); the wind loops
// are spatial, one per wind statue. The sound button in the HUD flips `sfx.muted`.

import { AudioSource, Entity, Transform, engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

export const SFX = {
  slide: 'assets/Sounds/CubeSlide.wav',
  stop: 'assets/Sounds/CubeStop.wav',
  snow: 'assets/Sounds/SnowHit.wav',
  plate: 'assets/Sounds/Plate.wav',
  arrow: 'assets/Sounds/ArrowChange.wav'
}
const WIND_LOOP = 'assets/Sounds/WindLoop.wav'
const WIND_VOLUME = 0.6

/** Player sound settings. `music` is ready for when a track exists: read `musicLevel()` for the AudioSource volume. */
export const sfx = { muted: false, volume: 1 }
export const music = { muted: false, volume: 0.5 }
export const soundPanel = { open: false }
export const musicLevel = () => (music.muted ? 0 : music.volume)

const own = new Map<string, Entity>()
let wind: Entity[] = []
const windOn = () => !sfx.muted && sfx.volume > 0

/** Play a one-shot (retriggers the same clip if it is still playing). */
export function playSfx(src: string, volume = 0.8): void {
  if (sfx.muted || sfx.volume <= 0) return
  volume *= sfx.volume
  let entity = own.get(src)
  if (!entity) {
    entity = engine.addEntity()
    Transform.create(entity, {})
    AudioSource.create(entity, { audioClipUrl: src, playing: false, global: true, volume })
    own.set(src, entity)
  }
  AudioSource.getMutable(entity).volume = volume
  AudioSource.playSound(entity, src)
}

/** Create every clip's audio entity silently at scene start so the files are fetched before first use. */
export function preloadSfx(): void {
  for (const src of Object.values(SFX)) {
    if (own.has(src)) continue
    const entity = engine.addEntity()
    Transform.create(entity, {})
    AudioSource.create(entity, { audioClipUrl: src, playing: false, global: true, volume: 0 })
    own.set(src, entity)
  }
}

/** One looping, spatial wind sound per wind statue (called when a level is built). */
export function startWind(spots: { x: number; z: number }[], y: number): void {
  stopWind()
  for (const s of spots) {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(s.x, y, s.z) })
    AudioSource.create(e, { audioClipUrl: WIND_LOOP, playing: windOn(), loop: true, global: false, volume: WIND_VOLUME * sfx.volume })
    wind.push(e)
  }
}

export function stopWind(): void {
  for (const e of wind) engine.removeEntity(e)
  wind = []
}

function applyWind(): void {
  for (const e of wind) {
    const a = AudioSource.getMutable(e)
    a.playing = windOn()
    a.volume = WIND_VOLUME * sfx.volume
  }
}

export function toggleMute(): void {
  sfx.muted = !sfx.muted
  applyWind()
  if (!sfx.muted) playSfx(SFX.plate)
}

export function setSfxVolume(v: number): void {
  sfx.volume = v
  applyWind()
  playSfx(SFX.plate) // hear the new level
}

export function toggleMusicMute(): void {
  music.muted = !music.muted
}

export function setMusicVolume(v: number): void {
  music.volume = v
}
