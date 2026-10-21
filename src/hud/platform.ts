import { getExplorerInformation } from '~system/Runtime'

// One place that knows whether we are on a phone. Same approach as WordCubes / DontCatchIt / MyDearPet: ask the
// Explorer once, fall back to the agent string, stay on desktop if the lookup fails. The HUD reads mobile() every
// frame, so it switches as soon as the answer arrives.
//
// The UI is drawn on the SDK's default virtual canvas (1920x1080 desktop, 1600x720 phone) and the renderer applies
// the device safe-area inset itself, so we never pass canvas options to setUiRenderer.
const MOBILE_AGENT_RE = /mobile|android|iphone|ipad|ios/

let detected = false
let forced: boolean | null = null // lets a desktop Explorer show the phone layout while testing
let started = false

export function resolvePlatform() {
  if (started) return
  started = true
  void getExplorerInformation({})
    .then((info) => {
      const platform = (info.platform ?? '').toLowerCase()
      const agent = (info.agent ?? '').toLowerCase()
      detected = platform === 'mobile' || MOBILE_AGENT_RE.test(agent)
      console.log('[HUD] platform', platform || '?', 'agent', agent || '?', 'mobile', detected)
    })
    .catch(() => {})
}

export const mobile = (): boolean => (forced === null ? detected : forced)

/** Debug: force the phone layout on desktop (call from index.ts while designing). null = auto. */
export function forceMobile(v: boolean | null) {
  forced = v
}
