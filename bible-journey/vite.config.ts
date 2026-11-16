import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const PUBLIC = fileURLToPath(new URL('./public', import.meta.url))

/*
 * The size of every file under public/bible/, keyed by the path it is served
 * at, for the Settings card that offers to save the whole Bible and has to name
 * the size before the tap.
 *
 * Measured here, from the files this build is about to ship, rather than kept
 * in a committed table: a table would be wrong the first time anybody re-ran
 * `npm run layout` and forgot it, and nothing on screen would say so. Baked into
 * the JavaScript, which is fingerprinted, so a deploy that changes the text
 * ships the new sizes with it. A manifest file under /bible/ instead would be
 * cached first with no revalidation, which is the trap `sw.js` warns about.
 */
function bibleBytes(): Record<string, number> {
  const out: Record<string, number> = {}
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.json')) {
        out[`/${relative(PUBLIC, path).split(sep).join('/')}`] = statSync(path).size
      }
    }
  }
  walk(join(PUBLIC, 'bible'))
  return out
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __BIBLE_BYTES__: JSON.stringify(bibleBytes()),
  },
})
