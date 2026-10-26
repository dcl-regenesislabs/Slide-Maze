// Level code: a readable, copy-pasteable string for one level.
//
//   SM1-7x7-#7/#.4P#/#.5#/#.2B.2#/#.5#/#@.5#/#7-K3F9
//    |    |   |  rows are run-length encoded: a tile char, then its repeat count (none = 1), rows split by '/'
//    |    |   +- the grid body (tile chars are never digits, so the counts are unambiguous)
//    |    +- width x height
//    +- format version
//
// The trailing 4 chars are a checksum over the grid, so a mistyped or cut-off paste is rejected instead of
// silently loading a different level. Pure functions, no SDK imports.

const PREFIX = 'SM1'

function checksum(text: string): string {
  let h = 0x811c9dc5 // FNV-1a
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return ((h >>> 0) % 1679616).toString(36).toUpperCase().padStart(4, '0') // 36^4
}

function encodeRow(row: string): string {
  let out = ''
  let i = 0
  while (i < row.length) {
    let j = i
    while (j < row.length && row[j] === row[i]) j++
    const n = j - i
    out += row[i] + (n > 1 ? n : '')
    i = j
  }
  return out
}

function decodeRow(enc: string): string {
  let out = ''
  const re = /([^0-9])(\d*)/g
  let m: RegExpExecArray | null
  let used = 0
  while ((m = re.exec(enc))) {
    out += m[1].repeat(m[2] === '' ? 1 : parseInt(m[2], 10))
    used += m[0].length
  }
  if (used !== enc.length) throw new Error('malformed row')
  return out
}

export function encodeLevelCode(rows: string[]): string {
  const body = rows.map(encodeRow).join('/')
  return `${PREFIX}-${rows[0].length}x${rows.length}-${body}-${checksum(rows.join('/'))}`
}

/** Returns the ASCII rows, or throws an Error whose message says what is wrong with the code. */
export function decodeLevelCode(code: string): string[] {
  const parts = code.trim().split('-')
  if (parts.length !== 4) throw new Error('not a level code (expected 4 parts separated by -)')
  const [prefix, size, body, sum] = parts
  if (prefix !== PREFIX) throw new Error(`unknown level code version '${prefix}'`)
  const m = /^(\d+)x(\d+)$/.exec(size)
  if (!m) throw new Error(`bad size '${size}'`)
  const rows = body.split('/').map(decodeRow)
  if (rows.length !== parseInt(m[2], 10) || rows.some((r) => r.length !== parseInt(m[1], 10))) {
    throw new Error(`grid does not match size ${size}`)
  }
  if (checksum(rows.join('/')) !== sum.toUpperCase()) throw new Error('checksum mismatch (typo or cut-off paste?)')
  return rows.map((r) => r.replace(/W/g, 'S')) // 'W' (the old full wall) is now the cube
}
