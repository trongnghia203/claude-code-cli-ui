import { createHash } from 'node:crypto'
import { liveComments, newEntryId, readIssue, updateIssue } from '../../../utils/issues/store'

/**
 * Fold comments without a run. For an interactive session that distilled the issue itself.
 * Body: `commentIds` (only live ones are folded, default all live), optional `description`
 * (replaces it, `descriptionBefore` keeps the old text), `note`, `ifDescriptionHash` (409 when the
 * description changed since the caller read it, so two sessions do not overwrite each other).
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const issue = readIssue(id)
  if (!issue) throw createError({ statusCode: 404, message: 'Issue not found' })
  const { commentIds, description, note, ifDescriptionHash } = await readBody(event)
  if (ifDescriptionHash && ifDescriptionHash !== createHash('sha1').update(issue.description ?? '').digest('hex')) {
    throw createError({ statusCode: 409, message: 'The description changed since you read it. Read the issue again and merge.' })
  }
  if (description !== undefined && typeof description !== 'string') throw createError({ statusCode: 400, message: 'description must be text' })
  const live = liveComments(issue)
  const wanted = Array.isArray(commentIds) ? new Set(commentIds.map(String)) : null
  const foldedIds = live.filter(c => !wanted || wanted.has(c.id)).map(c => c.id)
  if (!foldedIds.length && description === undefined) throw createError({ statusCode: 400, message: 'Nothing to fold: no live comments' })
  const text = typeof note === 'string' ? note.trim().slice(0, 200) : ''
  const updated = updateIssue(id, (i) => {
    const descriptionBefore = i.description
    if (description !== undefined) i.description = description
    if (foldedIds.length) {
      i.timeline.push({ id: newEntryId(), at: new Date().toISOString(), type: 'distill', ...(text ? { note: text } : {}), foldedIds, descriptionBefore })
    }
  })!
  return { issue: updated, folded: foldedIds.length }
})
