import { createReadStream, existsSync } from 'node:fs'
import { attachmentPath, readIssue } from '../../../../../utils/issues/store'

/** Serve a comment attachment. Images and PDFs open inline, text files show as plain text. `?download=1` saves it. */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const cid = getRouterParam(event, 'cid')!
  const name = decodeURIComponent(getRouterParam(event, 'name')!)
  const comment = readIssue(id)?.timeline.find(e => e.type === 'comment' && e.id === cid)
  const meta = comment?.type === 'comment' ? comment.attachments?.find(a => a.name === name) : undefined
  const file = meta ? attachmentPath(id, cid, name) : null
  if (!meta || !file || !existsSync(file)) throw createError({ statusCode: 404, message: 'Attachment not found' })
  // Text and SVG go out as text/plain, so an attached .html or .svg never runs as a page
  const mime = meta.mime.startsWith('text/') || meta.mime.startsWith('image/svg') ? 'text/plain; charset=utf-8' : meta.mime
  setHeader(event, 'Content-Type', mime)
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Content-Disposition', `${getQuery(event).download ? 'attachment' : 'inline'}; filename="${name}"`)
  return sendStream(event, createReadStream(file))
})
