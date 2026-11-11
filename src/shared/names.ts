// Display names on the shared leaderboard. Pure (no SDK imports): the server cleans what it stores, the client cleans
// again before drawing.

export const NAME_MAX = 24

// Control characters (newlines included), line / paragraph separators, zero-width and bidi controls, and the angle
// brackets of TextShape rich-text tags: any of them lets a crafted name draw over the neighbouring rows of the board.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff<>]/g

/** A name safe to store and draw on one line: unsafe characters become spaces, runs of spaces collapse, at most NAME_MAX. */
export function cleanName(name: string): string {
  const flat = (name ?? '').replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim()
  return Array.from(flat).slice(0, NAME_MAX).join('').trim() // by code point, so an emoji is never cut in half
}

/** 0x1234...abcd, shown for a player whose name is not known. */
export const shortAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`
