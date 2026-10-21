// Static imports first: registerMessages() defines a component, which must happen before the engine seals.
import './shared/messages'
import { isServer } from '@dcl/sdk/network'
import { setupEditor } from './game/editor'
import { setupLevelStore } from './game/levelStore'
import { setupWorld } from './game/world'
import { setupHud } from './hud'

export async function main() {
  if (isServer()) {
    // the server never renders: it only stores players' levels
    const { initServer } = await import('./server/server')
    initServer()
    return
  }
  setupWorld()
  setupEditor()
  setupLevelStore()
  setupHud()
}
