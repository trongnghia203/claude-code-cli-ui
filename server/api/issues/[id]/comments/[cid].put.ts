import { readIssue, updateIssue } from '../../../../utils/issues/store'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const cid = getRouterParam(event, 'cid')!
  const issue = readIssue(id)
  if (!issue) throw createError({ statusCode: 404, message: 'Issue not found' })
  if (!issue.timeline.some(e => e.type === 'comment' && e.id === cid)) throw createError({ statusCode: 404, message: 'Comment not found' })
  const text = String((await readBody(event)).body ?? '').trim()
  if (!text) throw createError({ statusCode: 400, message: 'Comment is empty' })
  return {
    issue: updateIssue(id, (i) => {
      for (const e of i.timeline) if (e.type === 'comment' && e.id === cid) e.body = text
    }),
  }
})
