import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

export default defineEventHandler(async (event) => {
  const { path } = getQuery(event) as { path?: string }
  if (!path) throw createError({ statusCode: 400, message: 'path required' })
  if (!existsSync(path)) throw createError({ statusCode: 404, message: 'not found' })
  const mime = MIME[extname(path).toLowerCase()] ?? 'image/png'
  const buf = await readFile(path)
  setHeader(event, 'Content-Type', mime)
  setHeader(event, 'Cache-Control', 'max-age=3600')
  return send(event, buf, mime)
})
