// Run a TypeScript file in Node by bundling it with the esbuild that ships with the SDK.
//   node tools/run.mjs tools/check.ts [args...]
import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [entry, ...rest] = process.argv.slice(2)
if (!entry) {
  console.error('usage: node tools/run.mjs <file.ts> [args...]')
  process.exit(2)
}
const outfile = join(mkdtempSync(join(tmpdir(), 'slidemaze-')), 'out.mjs')
await build({ entryPoints: [resolve(entry)], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'error' })
process.argv = [process.argv[0], resolve(entry), ...rest]
await import(pathToFileURL(outfile).href)
