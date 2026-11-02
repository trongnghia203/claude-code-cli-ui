import { homedir } from 'node:os'
import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

const MAX_BYTES = 1024 * 1024

/** Read a local markdown file for the preview popup. Only .md files under the home directory. */
export default defineEventHandler(async (event) => {
  const { path } = getQuery(event) as { path?: string }
  if (!path) throw createError({ statusCode: 400, message: 'path required' })
  const home = await realpath(homedir())
  const wanted = path.startsWith('~/') ? resolve(home, path.slice(2)) : resolve(path)
  let real: string
  try { real = await realpath(wanted) } catch { throw createError({ statusCode: 404, message: 'File not found' }) }
  if (real !== home && !real.startsWith(home + sep)) throw createError({ statusCode: 403, message: 'Only files under your home folder' })
  if (extname(real).toLowerCase() !== '.md') throw createError({ statusCode: 403, message: 'Only .md files' })
  const info = await stat(real)
  if (!info.isFile()) throw createError({ statusCode: 404, message: 'Not a file' })
  if (info.size > MAX_BYTES) throw createError({ statusCode: 413, message: 'File is larger than 1 MB' })
  return { path: real, content: await readFile(real, 'utf8') }
})
